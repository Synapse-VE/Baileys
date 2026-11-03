export type SessionWatchdogOptions = {
	/** How long the socket may stay connected without any inbound activity. */
	silenceMs?: number
	/** Called once per silent window; usually closes the socket so the host reconnects. */
	onDeaf: (silentForMs: number) => void
	now?: () => number
}

/**
 * Detects "deaf" sessions: the WebSocket stays open and pings succeed, but no
 * messages arrive. Baileys does not close the socket in that state, so callers
 * need their own signal. Feed `noteActivity()` from messages.upsert/connection
 * updates and call `check()` on a timer.
 */
export const createSessionWatchdog = ({ silenceMs = 5 * 60_000, onDeaf, now = Date.now }: SessionWatchdogOptions) => {
	let lastActivity = now()

	const noteActivity = () => {
		lastActivity = now()
	}

	const check = () => {
		const silentForMs = now() - lastActivity
		if (silentForMs < silenceMs) {
			return false
		}

		lastActivity = now()
		onDeaf(silentForMs)
		return true
	}

	return { noteActivity, check }
}
