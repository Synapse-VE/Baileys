import { proto } from '../../../WAProto/index.js'
import type { SignalAuthState } from '../../Types'
import type { SignalRepositoryWithLIDStore } from '../../Types/Signal'
import { jidDecode, WAJIDDomains } from '../../WABinary'
import type { LIDMappingStore } from '../lid-mapping'
import { makeWasmSessionStore, type WasmSessionBridge } from './session-store'

type AddressFactory = (user: string, device: number) => { toString(): string }

export type WasmRepositoryDeps = {
	bridge: WasmSessionBridge & {
		SessionRecord?: { deserialize(value: Uint8Array): { haveOpenSession(): boolean } }
	}
	auth: SignalAuthState
	address: AddressFactory
	lidMapping: LIDMappingStore
}

const addressForJid = (jid: string, makeAddress: AddressFactory) => {
	const decoded = jidDecode(jid)
	if (!decoded?.user) throw new Error(`Invalid JID: ${jid}`)
	const signalUser =
		decoded.domainType !== WAJIDDomains.WHATSAPP ? `${decoded.user}_${decoded.domainType}` : decoded.user
	return makeAddress(signalUser, decoded.device || 0)
}

const preKeyIds = (ciphertext: Uint8Array): number[] => {
	try {
		const parsed = proto.PreKeySignalMessage.decode(ciphertext.slice(1))
		return typeof parsed.preKeyId === 'number' ? [parsed.preKeyId] : []
	} catch {
		return []
	}
}

/** Phase-1 1:1 facade. Group methods stay explicit until their adapter exists. */
export const makeWasmSignalRepository = ({
	bridge,
	auth,
	address,
	lidMapping
}: WasmRepositoryDeps): SignalRepositoryWithLIDStore => {
	const store = makeWasmSessionStore(bridge, auth)

	const repository: SignalRepositoryWithLIDStore = {
		async decryptGroupMessage() {
			throw new Error('WASM group decryption is not implemented in phase 1')
		},
		async processSenderKeyDistributionMessage() {
			throw new Error('WASM sender keys are not implemented in phase 1')
		},
		decryptMessage({ jid, type, ciphertext }) {
			const addr = addressForJid(jid, address)
			return type === 'pkmsg'
				? store.decryptPreKey(addr, ciphertext, preKeyIds(ciphertext))
				: store.decryptWhisper(addr, ciphertext)
		},
		encryptMessage({ jid, data }) {
			return store.encrypt(addressForJid(jid, address), data)
		},
		async encryptGroupMessage() {
			throw new Error('WASM group encryption is not implemented in phase 1')
		},
		async getSenderKeyDistributionMessage() {
			throw new Error('WASM sender keys are not implemented in phase 1')
		},
		async hasSenderKey() {
			return false
		},
		async getSessionInfo() {
			return null
		},
		async injectE2ESession() {
			throw new Error('WASM session injection is not implemented in phase 1')
		},
		jidToSignalProtocolAddress(jid) {
			return addressForJid(jid, address).toString()
		},
		lidMapping,
		async validateSession() {
			return { exists: false, reason: 'WASM session validation pending' }
		},
		async migrateSession() {
			return { migrated: 0, skipped: 0, total: 0 }
		},
		async deleteSession(jids) {
			if (!jids.length) return
			const session: Record<string, null> = {}
			for (const jid of jids) session[repository.jidToSignalProtocolAddress(jid)] = null
			await auth.keys.set({ session })
		}
	}

	return repository
}
