import { DisconnectReason } from '../../Types/index.js'
import { getDisconnectAction, getReconnectDelay } from '../../Utils/reconnect'

describe('getDisconnectAction', () => {
	it.each([
		[DisconnectReason.connectionReplaced, 'stop'],
		[DisconnectReason.loggedOut, 'stop'],
		[DisconnectReason.forbidden, 'stop'],
		[DisconnectReason.multideviceMismatch, 'stop'],
		[DisconnectReason.badSession, 'stop'],
		[DisconnectReason.unavailableService, 'wait'],
		[DisconnectReason.restartRequired, 'reconnect'],
		[DisconnectReason.connectionClosed, 'reconnect'],
		[undefined, 'reconnect']
	] as const)('maps %s to %s', (code, action) => {
		expect(getDisconnectAction(code)).toBe(action)
	})
})

describe('getReconnectDelay', () => {
	it('grows exponentially with a cap', () => {
		expect(getReconnectDelay(1, { random: () => 0.5 })).toBe(1000)
		expect(getReconnectDelay(2, { random: () => 0.5 })).toBe(2000)
		expect(getReconnectDelay(10, { random: () => 0.5 })).toBe(60000)
	})

	it('applies jitter around the base delay', () => {
		expect(getReconnectDelay(1, { random: () => 0 })).toBe(750)
		expect(getReconnectDelay(1, { random: () => 0.999 })).toBe(1250)
	})
})
