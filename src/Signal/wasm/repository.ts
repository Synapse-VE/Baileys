import { Boom } from '@hapi/boom'
import { proto } from '../../../WAProto/index.js'
import type { SignalAuthState, SignalKeyStoreWithRecordTransaction } from '../../Types'
import type { SignalRepositoryWithLIDStore } from '../../Types/Signal'
import { MISSING_KEYS_ERROR_TEXT } from '../../Utils/decode-wa-message'
import { jidDecode, jidEncode, transferDevice, WAJIDDomains } from '../../WABinary'
import {
	entryRegistrationId,
	hasOpenLegacySession,
	isLegacySessionRecord,
	pickOpenLegacySession
} from '../legacy-session'
import { fromTypedRecord } from '../legacy-session-codec'
import type { LIDMappingStore } from '../lid-mapping'
import { makeWasmSessionStore, type WasmBundle, type WasmSessionBridge } from './session-store'

type AddressFactory = (user: string, device: number) => { toString(): string }

type WasmStorage = {
	loadSenderKey(keyId: string): Promise<Uint8Array | null>
	storeSenderKey(keyId: string, record: Uint8Array): Promise<void>
}

type WasmGroupApi = {
	GroupCipher: new (
		storage: WasmStorage,
		group: string,
		sender: { toString(): string }
	) => { encrypt(data: Uint8Array): Promise<Uint8Array>; decrypt(data: Uint8Array): Promise<Uint8Array> }
	GroupSessionBuilder: new (storage: WasmStorage) => {
		create(name: unknown): Promise<{ serialize(): Uint8Array }>
		process(name: unknown, skdm: unknown): Promise<void>
	}
	SenderKeyName: new (group: string, sender: { toString(): string }) => { toString(): string }
	SenderKeyDistributionMessage: { deserialize(value: Uint8Array): unknown }
	projectLegacySenderKeyRecordV1(record: Uint8Array): Uint8Array
}

export type WasmRepositoryDeps = {
	bridge: WasmSessionBridge &
		WasmGroupApi & {
			SessionRecord?: { deserialize(value: Uint8Array): { haveOpenSession(): boolean } }
		}
	auth: SignalAuthState
	address: AddressFactory
	lidMapping: LIDMappingStore
}

export type WasmRepositoryDiagnostics = {
	encrypt: number
	decrypt: number
	groupEncrypt: number
	groupDecrypt: number
	errors: number
}

export type WasmSignalRepository = SignalRepositoryWithLIDStore & {
	getDiagnostics(): WasmRepositoryDiagnostics
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

const normalizeDecryptError = (error: unknown): Error => {
	const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
	if (message.includes('DuplicatedMessage') || message.includes('old counter')) {
		return new Boom(MISSING_KEYS_ERROR_TEXT, { data: { cause: message } })
	}

	return error instanceof Error ? error : new Error(message || 'WASM decrypt failed')
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
}: WasmRepositoryDeps): WasmSignalRepository => {
	const store = makeWasmSessionStore(bridge, auth)
	const diagnostics: WasmRepositoryDiagnostics = {
		encrypt: 0,
		decrypt: 0,
		groupEncrypt: 0,
		groupDecrypt: 0,
		errors: 0
	}
	const withSenderKey = async <T>(keyId: string, work: () => Promise<T>): Promise<T> => {
		const keys = auth.keys as Partial<SignalKeyStoreWithRecordTransaction>
		return keys.transactWith ? keys.transactWith({ records: [{ type: 'sender-key', id: keyId }] }, work) : work()
	}

	const groupStorage: WasmStorage = {
		async loadSenderKey(keyId) {
			const { [keyId]: key } = await auth.keys.get('sender-key', [keyId])
			return key ?? null
		},
		async storeSenderKey(keyId, record) {
			await auth.keys.set({
				'sender-key': { [keyId]: bridge.projectLegacySenderKeyRecordV1(record) }
			})
		}
	}
	const senderName = (group: string, meId: string) => new bridge.SenderKeyName(group, addressForJid(meId, address))

	const repository: WasmSignalRepository = {
		getDiagnostics() {
			return { ...diagnostics }
		},
		async decryptGroupMessage({ group, authorJid, msg }) {
			const keyId = senderName(group, authorJid).toString()
			return withSenderKey(keyId, async () => {
				diagnostics.groupDecrypt++
				try {
					const cipher = new bridge.GroupCipher(groupStorage, group, addressForJid(authorJid, address))
					return await cipher.decrypt(msg)
				} catch (error) {
					diagnostics.errors++
					throw normalizeDecryptError(error)
				}
			})
		},
		async processSenderKeyDistributionMessage({ item, authorJid }) {
			const serializedSkdm = item.axolotlSenderKeyDistributionMessage
			if (!item.groupId || !serializedSkdm) {
				diagnostics.errors++
				throw new Error('Sender key distribution message is incomplete')
			}

			const keyName = senderName(item.groupId, authorJid)
			try {
				await withSenderKey(keyName.toString(), async () => {
					const builder = new bridge.GroupSessionBuilder(groupStorage)
					await builder.process(keyName, bridge.SenderKeyDistributionMessage.deserialize(serializedSkdm))
				})
			} catch (error) {
				diagnostics.errors++
				throw error
			}
		},
		async decryptMessage({ jid, type, ciphertext }) {
			const addr = addressForJid(jid, address)
			const storageId = await resolveStorageId(jid, address, lidMapping)
			diagnostics.decrypt++
			try {
				return type === 'pkmsg'
					? await store.decryptPreKey(addr, ciphertext, preKeyIds(ciphertext), storageId)
					: await store.decryptWhisper(addr, ciphertext, storageId)
			} catch (error) {
				diagnostics.errors++
				throw normalizeDecryptError(error)
			}
		},
		async encryptMessage({ jid, data }) {
			const addr = addressForJid(jid, address)
			return store.encrypt(addr, data, await resolveStorageId(jid, address, lidMapping))
		},
		async encryptGroupMessage({ group, meId, data }) {
			const name = senderName(group, meId)
			diagnostics.groupEncrypt++
			try {
				return await withSenderKey(name.toString(), async () => {
					const builder = new bridge.GroupSessionBuilder(groupStorage)
					const skdm = await builder.create(name)
					const cipher = new bridge.GroupCipher(groupStorage, group, addressForJid(meId, address))
					const ciphertext = await cipher.encrypt(data)
					return { ciphertext, senderKeyDistributionMessage: skdm.serialize() }
				})
			} catch (error) {
				diagnostics.errors++
				throw error
			}
		},
		async getSenderKeyDistributionMessage({ group, meId }) {
			const name = senderName(group, meId)
			return withSenderKey(name.toString(), async () => {
				const builder = new bridge.GroupSessionBuilder(groupStorage)
				return (await builder.create(name)).serialize()
			})
		},
		async hasSenderKey({ group, meId }) {
			const name = senderName(group, meId).toString()
			const { [name]: key } = await auth.keys.get('sender-key', [name])
			return !!key
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
			if (isLegacySessionRecord(serialized)) {
				return hasOpenLegacySession(serialized) ? { exists: true } : { exists: false, reason: 'no open session' }
			}

			if (!bridge.SessionRecord) return { exists: true }
			try {
				return bridge.SessionRecord.deserialize(serialized).haveOpenSession()
					? { exists: true }
					: { exists: false, reason: 'no open session' }
			} catch {
				return { exists: false, reason: 'validation error' }
			}
		},
		async migrateSession(fromJid, toJid) {
			const fromDecoded = jidDecode(fromJid)
			if (!fromDecoded?.user) return { migrated: 0, skipped: 1, total: 1 }

			const migrateOne = async (sourceJid: string, targetJid: string) => {
				const fromId = addressForJid(sourceJid, address).toString()
				const toId = addressForJid(targetJid, address).toString()
				if (fromId === toId) return { migrated: 0, skipped: 1, total: 1 }

				const keys = auth.keys as Partial<SignalKeyStoreWithRecordTransaction>
				const run = async () => {
					const [fromSession, toSession] = await Promise.all([
						auth.keys.get('session', [fromId]),
						auth.keys.get('session', [toId])
					])
					const source = fromSession[fromId]
					if (!source || toSession[toId]) return { migrated: 0, skipped: 1, total: 1 }

					await auth.keys.set({ session: { [toId]: source, [fromId]: null } })
					return { migrated: 1, skipped: 0, total: 1 }
				}

				return keys.transactWith
					? keys.transactWith(
							{
								records: [
									{ type: 'session', id: fromId },
									{ type: 'session', id: toId }
								]
							},
							run
						)
					: run()
			}

			const { [fromDecoded.user]: listedDevices } = await auth.keys.get('device-list', [fromDecoded.user])
			const devices = new Set<string>([String(fromDecoded.device ?? 0), ...(listedDevices ?? []).map(String)])
			let migrated = 0
			let skipped = 0

			for (const device of devices) {
				const sourceJid =
					Number(device) === (fromDecoded.device ?? 0)
						? fromJid
						: jidEncode(fromDecoded.user, fromDecoded.server, Number(device))
				const targetJid = transferDevice(sourceJid, toJid)
				const result = await migrateOne(sourceJid, targetJid)
				migrated += result.migrated
				skipped += result.skipped
			}

			return { migrated, skipped, total: devices.size }
		},
		close() {
			lidMapping.close()
		},
		async deleteSession(jids) {
			if (!jids.length) return
			const ids = new Set<string>()
			for (const jid of jids) ids.add(await resolveStorageId(jid, address, lidMapping))
			const session: Record<string, null> = {}
			for (const id of ids) session[id] = null

			const keys = auth.keys as Partial<SignalKeyStoreWithRecordTransaction>
			const run = async () => {
				await auth.keys.set({ session })
			}

			await (keys.transactWith
				? keys.transactWith({ records: [...ids].map(id => ({ type: 'session' as const, id })) }, run)
				: run())
		}
	}

	return repository
}
