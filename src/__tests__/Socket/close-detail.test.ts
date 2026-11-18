import { jest } from '@jest/globals'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import makeWASocket from '../../Socket'
import { makeSession, mockWebSocket } from '../TestUtils/session'

mockWebSocket()

jest.setTimeout(30_000)

const makeSocketForTest = async () => {
	const { state, clear } = await makeSession()
	state.creds.me = { id: '1234567890:1@s.whatsapp.net', name: 'Test User' }
	const sock = makeWASocket({ ...DEFAULT_CONNECTION_CONFIG, auth: state })
	const updates: any[] = []
	sock.ev.on('connection.update', update => updates.push(update))
	return { sock, updates, clear }
}

const waitForClose = async (updates: any[]) => {
	for (let i = 0; i < 40; i++) {
		const closed = updates.find(update => update.connection === 'close')
		if (closed) return closed
		await new Promise(resolve => setTimeout(resolve, 25))
	}

	return undefined
}

describe('websocket close', () => {
	it('carries the close code and reason in the connection error', async () => {
		const { sock, updates, clear } = await makeSocketForTest()
		expect(sock.connectionHealth()).toMatchObject({
			connected: false,
			consecutivePingFailures: 0,
			pingsSent: 0,
			pingsFailed: 0
		})

		sock.ws.emit('close', 1006, Buffer.from(''))

		const closed = await waitForClose(updates)
		const error = closed?.lastDisconnect?.error as any
		expect(error?.message).toContain('ws close 1006')
		expect(error?.data).toMatchObject({ closeCode: 1006, closeReason: null, wasClean: false })

		await sock.end(new Error('Test completed'))
		await clear()
	})

	it('marks a close with code 1000 and a reason as clean', async () => {
		const { sock, updates, clear } = await makeSocketForTest()

		sock.ws.emit('close', 1000, Buffer.from('bye'))

		const closed = await waitForClose(updates)
		const error = closed?.lastDisconnect?.error as any
		expect(error?.message).toContain('ws close 1000: bye')
		expect(error?.data).toMatchObject({ closeCode: 1000, closeReason: 'bye', wasClean: true })

		await sock.end(new Error('Test completed'))
		await clear()
	})
})
