import { nextRetryCount, shouldRetryMessage } from '../../Utils/retry-cache'

describe('retry cache semantics', () => {
	it('treats a miss as unknown and allows the first retry', () => {
		expect(shouldRetryMessage(undefined, 5)).toBe(true)
		expect(nextRetryCount(undefined)).toBe(1)
	})

	it('lets a custom cache suppress retries with null', () => {
		expect(shouldRetryMessage(null, 5)).toBe(false)
		expect(nextRetryCount(null)).toBeNull()
	})

	it('honours the retry budget', () => {
		expect(shouldRetryMessage(4, 5)).toBe(true)
		expect(shouldRetryMessage(5, 5)).toBe(false)
	})
})
