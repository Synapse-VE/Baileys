import { jest } from '@jest/globals'
import { findJidsWithoutSession } from '../../Utils/session-validation'

const tick = () => new Promise<void>(resolve => setImmediate(resolve))

describe('findJidsWithoutSession', () => {
	it('validates in bounded parallel batches', async () => {
		let active = 0
		let maxActive = 0
		const jids = Array.from({ length: 250 }, (_, index) => `user${index}@s.whatsapp.net`)
		const validate = async () => {
			active++
			maxActive = Math.max(maxActive, active)
			await tick()
			active--
			return { exists: false }
		}

		const missing = await findJidsWithoutSession(jids, validate, { batchSize: 100 })

		expect(missing).toEqual(jids)
		expect(maxActive).toBe(100)
	})

	it('keeps order and only returns missing sessions', async () => {
		const jids = ['a@s.whatsapp.net', 'b@s.whatsapp.net', 'c@s.whatsapp.net']
		const missing = await findJidsWithoutSession(jids, async jid => ({ exists: jid === 'b@s.whatsapp.net' }))
		expect(missing).toEqual(['a@s.whatsapp.net', 'c@s.whatsapp.net'])
	})

	it('skips validation entirely when forced', async () => {
		const validate = jest.fn(async () => ({ exists: true }))
		const missing = await findJidsWithoutSession(['a@s.whatsapp.net'], validate, { force: true })
		expect(missing).toEqual(['a@s.whatsapp.net'])
		expect(validate).not.toHaveBeenCalled()
	})
})
