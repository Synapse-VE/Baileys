import { jest } from '@jest/globals'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import makeWASocket from '../../Socket'
import { makeSession, mockWebSocket } from '../TestUtils/session'

mockWebSocket()

jest.setTimeout(30_000)

describe('websocket close', () => {
	it('carries the close code and reason in the connection error', async () => {
		const { state, clear } = await makeSession()
		state.creds.me = { id: '1234567890:1@s.whatsapp.net', name: 'Test User' }

		const sock = makeWASocket({ ...DEFAULT_CONNECTION_CONFIG, auth: state })
		const updates: any[] = []
		sock.ev.on('connection.update', update => updates.push(update))

		sock.ws.emit('close', 1006, Buffer.from(''))

		for (let i = 0; i < 40; i++) {
			if (updates.some(update => update.connection === 'close')) break
			await new Promise(resolve => setTimeout(resolve, 25))
		}

		const closed = updates.find(update => update.connection === 'close')
		expect(closed?.lastDisconnect?.error?.message).toContain('ws close 1006')

		await sock.end(new Error('Test completed'))
		await clear()
	})
})
