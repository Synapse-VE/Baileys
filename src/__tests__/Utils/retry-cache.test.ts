import { makeKeyedMutex } from '../../Utils/make-mutex'
import {
	incrementRetryCount,
	incrementSendAgainCount,
	nextRetryCount,
	normalizedRetryCount,
	shouldRetryMessage
} from '../../Utils/retry-cache'

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

	it('normalizes persisted counts for the retry manager', () => {
		expect(normalizedRetryCount(undefined, 5)).toBe(0)
		expect(normalizedRetryCount(null, 5)).toBeNull()
		expect(normalizedRetryCount(3, 5)).toBe(3)
		expect(normalizedRetryCount(Number.NaN, 5)).toBe(5)
	})
})

const makeSlowCache = () => {
	const map = new Map<string, number | null>()
	return {
		map,
		async get<T>(key: string) {
			await new Promise(resolve => setImmediate(resolve))
			return map.get(key) as T | undefined
		},
		async set(key: string, value: number) {
			map.set(key, value)
		},
		async del(key: string) {
			map.delete(key)
		}
	}
}

describe('atomic retry counters', () => {
	it('does not lose concurrent increments', async () => {
		const cache = makeSlowCache()
		const mutex = makeKeyedMutex()

		const results = await Promise.all([
			incrementRetryCount(cache, 'msg', 5, mutex),
			incrementRetryCount(cache, 'msg', 5, mutex)
		])

		expect(results.map(r => (r.status === 'incremented' ? r.count : 0)).sort()).toEqual([1, 2])
		expect(await cache.get<number>('msg')).toBe(2)
	})

	it('honours suppression and the retry ceiling', async () => {
		const cache = makeSlowCache()
		const mutex = makeKeyedMutex()
		cache.map.set('suppressed', null)
		cache.map.set('exceeded', 5)

		expect(await incrementRetryCount(cache, 'suppressed', 5, mutex)).toEqual({ status: 'suppressed' })
		expect(await incrementRetryCount(cache, 'exceeded', 5, mutex)).toEqual({ status: 'exceeded' })
		// The ceiling is preserved so a restart/reconnect cannot reset it.
		expect(await cache.get<number>('exceeded')).toBe(5)
	})

	it('serializes the resend counter too', async () => {
		const cache = makeSlowCache()
		const mutex = makeKeyedMutex()

		const results = await Promise.all([
			incrementSendAgainCount(cache, 'msg', mutex),
			incrementSendAgainCount(cache, 'msg', mutex)
		])

		expect(results.sort()).toEqual([1, 2])
	})
})
