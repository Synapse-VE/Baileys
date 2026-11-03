import { DisconnectReason } from '../Types/index.js'

export type DisconnectAction = 'reconnect' | 'stop' | 'wait'

/** Translates a close status code into what the consumer should do next. */
export const getDisconnectAction = (statusCode?: number): DisconnectAction => {
	switch (statusCode) {
		case DisconnectReason.connectionReplaced:
		case DisconnectReason.loggedOut:
		case DisconnectReason.forbidden:
		case DisconnectReason.multideviceMismatch:
		case DisconnectReason.badSession:
			return 'stop'
		case DisconnectReason.unavailableService:
			return 'wait'
		default:
			return 'reconnect'
	}
}

export type ReconnectDelayOptions = {
	baseMs?: number
	maxMs?: number
	random?: () => number
}

/** Exponential backoff with jitter, so a fleet of bots does not reconnect in lockstep. */
export const getReconnectDelay = (attempt: number, options: ReconnectDelayOptions = {}) => {
	const { baseMs = 1_000, maxMs = 60_000, random = Math.random } = options
	const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1))
	const jitter = 0.75 + random() * 0.5
	return Math.round(exponential * jitter)
}
