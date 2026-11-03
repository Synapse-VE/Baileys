import { jidNormalizedUser } from '../WABinary'

/**
 * A device whose identity changed needs a fresh sender-key distribution, even
 * if we still hold the old key: the ciphertext would be undecryptable for it.
 * The recent-change set keeps that device out of the "already has key" fast path
 * for a bounded window.
 */
export const hasUsableSenderKey = (
	deviceJid: string,
	senderKeyMap: Record<string, unknown>,
	recentlyChangedIdentities: Set<string>
) => !recentlyChangedIdentities.has(jidNormalizedUser(deviceJid)) && !!senderKeyMap[deviceJid]
