import { Boom } from '@hapi/boom'
import { jest } from '@jest/globals'
import { createCipheriv, createHmac, randomBytes } from 'crypto'
import * as http from 'http'
import type { AddressInfo } from 'net'
import type { WAMessage } from '../../Types'
import type { ILogger } from '../../Utils/logger'
import { downloadMediaMessage, mediaLinkExpiry } from '../../Utils/messages'
import { getMediaKeys } from '../../Utils/messages-media'

const makeTestLogger = (): ILogger =>
	({
		level: 'silent',
		child: () => makeTestLogger(),
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {}
	}) as unknown as ILogger

const encryptMedia = async (plaintext: Buffer, mediaKey: Buffer) => {
	const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, 'image')
	const aes = createCipheriv('aes-256-cbc', cipherKey, iv)
	const enc = Buffer.concat([aes.update(plaintext), aes.final()])
	const mac = createHmac('sha256', macKey!).update(iv).update(enc).digest().subarray(0, 10)
	return Buffer.concat([enc, mac])
}

describe('downloadMediaMessage reupload', () => {
	const plaintext = Buffer.from('media after reupload')
	const mediaKey = randomBytes(32)

	let server: http.Server
	let baseUrl: string
	let encrypted: Buffer
	let expiredStatus: number
	let requestedPaths: string[]

	beforeAll(async () => {
		encrypted = await encryptMedia(plaintext, mediaKey)
		server = http.createServer((req, res) => {
			requestedPaths.push(req.url!)
			if (req.url === '/fresh') {
				res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
				res.end(encrypted)
			} else {
				res.writeHead(expiredStatus)
				res.end()
			}
		})
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
	})

	afterAll(async () => {
		server.closeAllConnections()
		await new Promise(resolve => server.close(resolve))
	})

	beforeEach(() => {
		requestedPaths = []
	})

	const imageMessage = (path: string): WAMessage => ({
		key: { remoteJid: '1234567890@s.whatsapp.net', fromMe: false, id: 'ABCDEF123456' },
		message: { imageMessage: { url: `${baseUrl}${path}`, mediaKey, mimetype: 'image/jpeg' } }
	})

	const makeCtx = () => {
		const reuploadRequest = jest.fn(async (msg: WAMessage) => ({
			...msg,
			message: { imageMessage: { ...msg.message!.imageMessage, url: `${baseUrl}/fresh` } }
		}))
		return { reuploadRequest, logger: makeTestLogger() }
	}

	it.each([404, 410])('requests a reupload when the CDN answers %i', async status => {
		expiredStatus = status
		const ctx = makeCtx()
		const message = imageMessage('/expired')

		const buffer = await downloadMediaMessage(message, 'buffer', {}, ctx)

		expect(buffer.equals(plaintext)).toBe(true)
		expect(ctx.reuploadRequest).toHaveBeenCalledTimes(1)
		expect(requestedPaths).toEqual(['/expired', '/fresh'])
	})

	it('does not retry a 500', async () => {
		expiredStatus = 500
		const ctx = makeCtx()
		const error = await downloadMediaMessage(imageMessage('/expired'), 'buffer', {}, ctx).catch(err => err)

		expect(error).toBeInstanceOf(Boom)
		expect((error as Boom).output.statusCode).toBe(500)
		expect(ctx.reuploadRequest).not.toHaveBeenCalled()
	})

	it('retries a 403 only when the link signature expired', async () => {
		const now = 1_790_000_000
		const oe = (seconds: number) => seconds.toString(16)
		jest.spyOn(Date, 'now').mockReturnValue(now * 1000)
		expiredStatus = 403

		const expiredCtx = makeCtx()
		const expired = imageMessage(`/expired?oe=${oe(now - 60)}`)
		const buffer = await downloadMediaMessage(expired, 'buffer', {}, expiredCtx)
		expect(buffer.equals(plaintext)).toBe(true)
		expect(expiredCtx.reuploadRequest).toHaveBeenCalledTimes(1)

		const validCtx = makeCtx()
		const valid = imageMessage(`/expired?oe=${oe(now + 600)}`)
		const error = await downloadMediaMessage(valid, 'buffer', {}, validCtx).catch(err => err)
		expect((error as Boom).output.statusCode).toBe(403)
		expect(validCtx.reuploadRequest).not.toHaveBeenCalled()

		jest.restoreAllMocks()
	})

	it('parses the oe expiry parameter', () => {
		expect(mediaLinkExpiry('/x?oe=6a7b8c9d')).toBe(0x6a7b8c9d * 1000)
		expect(mediaLinkExpiry('/x?oe=zz')).toBeUndefined()
		expect(mediaLinkExpiry('/x?oe=1&oe=2')).toBeUndefined()
	})
})
