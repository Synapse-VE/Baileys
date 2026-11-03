import type { AuthenticationCreds } from '../Types'

/**
 * A pairing-code session registers with the server; a QR session with existing
 * credentials logs in. Old QR credentials have no pairingCode, so they keep the
 * login path even when `registered` was never persisted.
 */
export const shouldUseRegistrationNode = (creds: Pick<AuthenticationCreds, 'me' | 'pairingCode' | 'registered'>) =>
	!creds.me || (!!creds.pairingCode && !creds.registered)

/**
 * The server sends two link_code_companion_reg notifications: one right after
 * companion_hello with only the ref, and the real one after the phone enters
 * the code. Only the latter carries every crypto field.
 */
export const isCompanionRegReady = (stage?: string | null) => stage === 'primary_hello'
