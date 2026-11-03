/** WhatsApp sends `offline` as a string; `"0"` must not be treated as truthy. */
export const isOfflineAttr = (value?: string | null) => value === '1' || value === 'true'

/** Fallback flush for the initial event buffer when `<ib><offline>` never arrives. */
export const INITIAL_SYNC_FLUSH_TIMEOUT_MS = 60_000

/**
 * Releases the initial event buffer if the server never sends the offline marker.
 * Returns a cancel function to call when the marker does arrive or the socket closes.
 */
export const scheduleInitialBufferFlush = (
	flush: () => void,
	logger: { warn: (message: string) => void },
	timeoutMs = INITIAL_SYNC_FLUSH_TIMEOUT_MS
) => {
	const timer = setTimeout(() => {
		flush()
		logger.warn('initial event buffer flushed without the offline marker')
	}, timeoutMs)
	timer.unref?.()
	return () => clearTimeout(timer)
}
