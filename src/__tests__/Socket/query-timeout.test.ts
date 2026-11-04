import { jest } from '@jest/globals'

const send = jest.fn((_data: unknown, cb?: (err?: Error) => void) => cb?.())

jest.unstable_mockModule('../../Socket/Client/websocket', () => ({
	WebSocketClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn(),
		close: jest.fn(),
		on: jest.fn(),
		off: jest.fn(),
		removeAllListeners: jest.fn(),
		emit: jest.fn(),
		send,
		isOpen: true
	}))
}))

const { DEFAULT_CONNECTION_CONFIG } = await import('../../Defaults')
const makeWASocket = (await import('../../Socket')).default
const { makeSession } = await import('../TestUtils/session')

jest.setTimeout(30_000)

describe('socket query timeout (M9)', () => {
	it('throws a typed timeout instead of resolving undefined', async () => {
		const { state, clear } = await makeSession()
		state.creds.me = { id: '1234567890:1@s.whatsapp.net', name: 'Test User' }

		const sock = makeWASocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: state,
			defaultQueryTimeoutMs: 30,
			connectTimeoutMs: 100
		})

		await expect(
			sock.query({ tag: 'iq', attrs: { id: 'm9-timeout', type: 'get' }, content: [] })
		).rejects.toMatchObject({
			output: { statusCode: 408 },
			data: { msgId: 'm9-timeout', timeoutMs: 30 }
		})

		await sock.end(new Error('Test completed'))
		await clear()
	})
})
