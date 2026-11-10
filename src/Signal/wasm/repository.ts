import { proto } from '../../../WAProto/index.js'
import type { SignalAuthState } from '../../Types'
import type { SignalRepositoryWithLIDStore } from '../../Types/Signal'
import { jidDecode, WAJIDDomains } from '../../WABinary'
import { entryRegistrationId, isLegacySessionRecord, pickOpenLegacySession } from '../legacy-session'
import { fromTypedRecord } from '../legacy-session-codec'
import type { LIDMappingStore } from '../lid-mapping'
import { makeWasmSessionStore, type WasmBundle, type WasmSessionBridge } from './session-store'

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

const resolveStorageId = async (jid: string, address: AddressFactory, lidMapping: LIDMappingStore) => {
	const raw = addressForJid(jid, address).toString()
	if (!raw.includes('.')) return raw

	const [deviceId, device] = raw.split('.')
	const [user, domainTypeRaw] = deviceId!.split('_')
	const domainType = Number.parseInt(domainTypeRaw || '0', 10)

	if (domainType === WAJIDDomains.LID || domainType === WAJIDDomains.HOSTED_LID) return raw

	const pnJid = `${user}${device !== '0' ? `:${device}` : ''}@${
		domainType === WAJIDDomains.HOSTED ? 'hosted' : 's.whatsapp.net'
	}`
	const lid = await lidMapping.getLIDForPN(pnJid)
	return lid ? addressForJid(lid, address).toString() : raw
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
		async decryptMessage({ jid, type, ciphertext }) {
			const addr = addressForJid(jid, address)
			const storageId = await resolveStorageId(jid, address, lidMapping)
			return type === 'pkmsg'
				? store.decryptPreKey(addr, ciphertext, preKeyIds(ciphertext), storageId)
				: store.decryptWhisper(addr, ciphertext, storageId)
		},
		async encryptMessage({ jid, data }) {
			const addr = addressForJid(jid, address)
			return store.encrypt(addr, data, await resolveStorageId(jid, address, lidMapping))
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
		async getSessionInfo(jid) {
			const wireId = await resolveStorageId(jid, address, lidMapping)
			const { [wireId]: stored } = await auth.keys.get('session', [wireId])
			if (!stored) return null

			const legacy = isLegacySessionRecord(stored)
				? stored
				: (() => {
						const projection = bridge.projectLegacySessionRecordV1(stored)
						return projection.status === 'projected' ? fromTypedRecord(projection.record) : undefined
					})()
			if (!legacy) return null

			const open = pickOpenLegacySession(legacy)
			const registrationId = entryRegistrationId(open, legacy)
			const baseKey = open?.indexInfo?.baseKey
			if (typeof registrationId !== 'number' || typeof baseKey !== 'string') return null

			return { baseKey: new Uint8Array(Buffer.from(baseKey, 'base64')), registrationId }
		},
		async injectE2ESession({ jid, session }) {
			await store.processBundle(
				addressForJid(jid, address),
				session as WasmBundle,
				await resolveStorageId(jid, address, lidMapping)
			)
		},
		jidToSignalProtocolAddress(jid) {
			return addressForJid(jid, address).toString()
		},
		lidMapping,
		async validateSession(jid) {
			const wireId = await resolveStorageId(jid, address, lidMapping)
			const { [wireId]: serialized } = await auth.keys.get('session', [wireId])
			if (!serialized) return { exists: false, reason: 'no session' }
			if (!bridge.SessionRecord) return { exists: true }
			try {
				return bridge.SessionRecord.deserialize(serialized).haveOpenSession()
					? { exists: true }
					: { exists: false, reason: 'no open session' }
			} catch {
				return { exists: false, reason: 'validation error' }
			}
		},
		async migrateSession() {
			return { migrated: 0, skipped: 0, total: 0 }
		},
		async deleteSession(jids) {
			if (!jids.length) return
			const session: Record<string, null> = {}
			for (const jid of jids) session[await resolveStorageId(jid, address, lidMapping)] = null
			await auth.keys.set({ session })
		}
	}

	return repository
}
