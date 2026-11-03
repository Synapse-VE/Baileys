import { isPnUser } from '../WABinary'
import type { ILogger } from './logger'

/**
 * WhatsApp addresses 1:1 chats by LID when a mapping exists. Sending to the
 * phone-number JID of a mapped contact can fail or hang, so resolve it before
 * building the stanza. A mapping failure keeps the original JID: sending to the
 * PN is better than not sending at all.
 */
export const resolveLidDestination = async (
	jid: string,
	getLIDForPN: (pn: string) => Promise<string | null>,
	logger?: ILogger
) => {
	if (!isPnUser(jid)) {
		return jid
	}

	try {
		const lid = await getLIDForPN(jid)
		return lid ?? jid
	} catch (error) {
		logger?.debug({ jid, err: (error as Error)?.message }, 'failed to resolve PN to LID')
		return jid
	}
}
