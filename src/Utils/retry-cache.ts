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
