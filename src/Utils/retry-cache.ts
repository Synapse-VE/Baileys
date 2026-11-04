/**
 * Retry-cache semantics: `undefined` means "unknown, never retried" and keeps
 * the normal retry budget; `null` means "the caller explicitly wants no retry".
 * Before this distinction, a cache miss and an explicit zero were the same, so
 * a custom cache written to suppress a retry could only authorise one.
 */
export const shouldRetryMessage = (cached: number | null | undefined, maxRetryCount: number) =>
	cached !== null && (cached ?? 0) < maxRetryCount

/** Returns null when the cache asks to suppress retries. */
export const nextRetryCount = (cached: number | null | undefined) => (cached === null ? null : (cached ?? 0) + 1)

export type RetryCache = {
	get<T>(key: string): Promise<T | undefined>
	set(key: string, value: number): Promise<void>
	del(key: string): Promise<void>
}

type RetryMutex = {
	mutex<T>(key: string, task: () => Promise<T> | T): Promise<T>
}

export type RetryIncrement =
	| { status: 'incremented'; count: number }
	| { status: 'suppressed' }
	| { status: 'exceeded' }

/**
 * Serialize the read-modify-write per message key. The inbound retry path and
 * the outgoing resend counter share the same cache and used to lose increments
 * when both ran concurrently.
 */
export const incrementRetryCount = (
	cache: RetryCache,
	key: string,
	maxRetryCount: number,
	mutex: RetryMutex
): Promise<RetryIncrement> =>
	mutex.mutex(key, async () => {
		const cached = await cache.get<number | null>(key)
		if (cached === null) {
			return { status: 'suppressed' }
		}

		if ((cached ?? 0) >= maxRetryCount) {
			await cache.del(key)
			return { status: 'exceeded' }
		}

		const count = (cached ?? 0) + 1
		await cache.set(key, count)
		return { status: 'incremented', count }
	})

/** Atomic increment for the outgoing resend counter; null means suppressed. */
export const incrementSendAgainCount = (cache: RetryCache, key: string, mutex: RetryMutex): Promise<number | null> =>
	mutex.mutex(key, async () => {
		const cached = await cache.get<number | null>(key)
		if (cached === null) {
			return null
		}

		const count = (cached ?? 0) + 1
		await cache.set(key, count)
		return count
	})
