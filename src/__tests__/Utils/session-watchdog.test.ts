import { jest } from '@jest/globals'
import { createSessionWatchdog } from '../../Utils/session-watchdog'

describe('createSessionWatchdog', () => {
	it('fires only after the silence threshold and resets', () => {
		let clock = 0
		const onDeaf = jest.fn()
		const watchdog = createSessionWatchdog({ silenceMs: 1_000, onDeaf, now: () => clock })

		clock = 500
		expect(watchdog.check()).toBe(false)
		clock = 1_200
		expect(watchdog.check()).toBe(true)
		expect(onDeaf).toHaveBeenCalledWith(1_200)

		// the window restarts after firing
		clock = 1_500
		expect(watchdog.check()).toBe(false)
	})

	it('activity postpones the deaf window', () => {
		let clock = 0
		const onDeaf = jest.fn()
		const watchdog = createSessionWatchdog({ silenceMs: 1_000, onDeaf, now: () => clock })

		clock = 800
		watchdog.noteActivity()
		clock = 1_500
		expect(watchdog.check()).toBe(false)
		expect(onDeaf).not.toHaveBeenCalled()
	})
})
