import type {
	LegacySessionProjectionV1,
	LegacySessionRecordV1
} from '../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'
import type {
	RecordRef,
	SignalAuthState,
	SignalDataSet,
	SignalDataTypeMap,
	SignalKeyStoreWithRecordTransaction
} from '../../Types'
import { generateSignalPubKey } from '../../Utils/crypto'
import { hasOpenLegacySession, isLegacySessionRecord } from '../legacy-session'
import { fromTypedRecord, toTypedRecord } from '../legacy-session-codec'

const DEFAULT_LEGACY_MESSAGE_KEYS = 2000

export type WasmSnapshot = {
	identity: { public: Uint8Array; private: Uint8Array }
	registrationId: number
	session?: Uint8Array
	peerIdentity?: Uint8Array
	preKeys?: Array<{ id: number; keyPair: { public: Uint8Array; private: Uint8Array } }>
	signedPreKeys?: Array<{
		id: number
		keyPair: { public: Uint8Array; private: Uint8Array }
		signature: Uint8Array
	}>
}

export type WasmChanges = {
	session?: Uint8Array
	sessionCleared: boolean
	identity?: Uint8Array
	removedPreKeyId?: number
}

export type WasmAddress = { toString(): string }

export type WasmBundle = {
	registrationId: number
	identityKey: Uint8Array
	preKey?: { keyId: number; publicKey: Uint8Array }
	signedPreKey: { keyId: number; publicKey: Uint8Array; signature: Uint8Array }
}

export type WasmSessionBridge = {
	processBundleWithSnapshot(
		snapshot: WasmSnapshot,
		address: WasmAddress,
		bundle: WasmBundle
	): Promise<{ changes: WasmChanges }>
	encryptWithSnapshot(
		snapshot: WasmSnapshot,
		address: WasmAddress,
		data: Uint8Array
	): Promise<{ ciphertext: Uint8Array; messageType: number; changes: WasmChanges }>
	decryptPreKeyWithSnapshot(
		snapshot: WasmSnapshot,
		address: WasmAddress,
		ciphertext: Uint8Array
	): Promise<{ plaintext: Uint8Array; changes: WasmChanges }>
	decryptWhisperWithSnapshot(
		snapshot: WasmSnapshot,
		address: WasmAddress,
		ciphertext: Uint8Array
	): Promise<{ plaintext: Uint8Array; changes: WasmChanges }>
	importLegacySessionRecordV1(record: LegacySessionRecordV1, context: SignalContext): Uint8Array
	projectLegacySessionRecordV1(bytes: Uint8Array): LegacySessionProjectionV1
}

type SignalContext = { identityKey: Uint8Array; registrationId: number }

/** Minimal 1:1 session store over the bridge snapshot API. */
export const makeWasmSessionStore = (bridge: WasmSessionBridge, auth: SignalAuthState) => {
	const read = async <T extends keyof SignalDataTypeMap>(type: T, id: string) => {
		const result = await auth.keys.get(type, [id])
		return result[id] as SignalDataTypeMap[T] | undefined
	}

	const transact = async <T>(records: RecordRef[], work: () => Promise<T>): Promise<T> => {
		const keys = auth.keys as Partial<SignalKeyStoreWithRecordTransaction>
		return keys.transactWith ? keys.transactWith({ records }, work) : work()
	}

	const readSession = async (wireId: string) => {
		const stored = await read('session', wireId)
		if (!stored) return undefined
		if (isLegacySessionRecord(stored)) {
			if (!hasOpenLegacySession(stored)) return undefined
			return bridge.importLegacySessionRecordV1(toTypedRecord(stored), {
				identityKey: generateSignalPubKey(auth.creds.signedIdentityKey.public),
				registrationId: auth.creds.registrationId
			})
		}

		return stored
	}

	const toStoredSession = (session: Uint8Array) => {
		const projection = bridge.projectLegacySessionRecordV1(session)
		if (projection.status !== 'projected') return session
		const overflowing = projection.record.sessions.some(indexed =>
			indexed.session.chains.some(chain => chain.messageKeys.length > DEFAULT_LEGACY_MESSAGE_KEYS)
		)
		return overflowing ? session : fromTypedRecord(projection.record)
	}

	const snapshot = async (
		address: WasmAddress,
		preKeyIds: number[] = [],
		storageId = address.toString()
	): Promise<WasmSnapshot> => {
		const wireId = storageId
		const [session, peerIdentity, ...preKeys] = await Promise.all([
			readSession(wireId),
			read('identity-key', wireId),
			...preKeyIds.map(async id => ({ id, value: await read('pre-key', String(id)) }))
		])

		return {
			identity: {
				public: auth.creds.signedIdentityKey.public,
				private: auth.creds.signedIdentityKey.private
			},
			registrationId: auth.creds.registrationId,
			session,
			peerIdentity: peerIdentity,
			preKeys: preKeys.flatMap(({ id, value }) =>
				value ? [{ id, keyPair: { public: value.public, private: value.private } }] : []
			),
			signedPreKeys: [
				{
					id: auth.creds.signedPreKey.keyId,
					keyPair: {
						public: auth.creds.signedPreKey.keyPair.public,
						private: auth.creds.signedPreKey.keyPair.private
					},
					signature: auth.creds.signedPreKey.signature
				}
			]
		}
	}

	const apply = async (wireId: string, changes: WasmChanges) => {
		const update: SignalDataSet = {}

		if (changes.sessionCleared) {
			update.session = { [wireId]: null }
		} else if (changes.session) {
			update.session = { [wireId]: toStoredSession(changes.session) as Uint8Array }
		}

		if (changes.identity) {
			update['identity-key'] = { [wireId]: changes.identity }
		}

		if (changes.removedPreKeyId !== undefined) {
			update['pre-key'] = { [String(changes.removedPreKeyId)]: null }
		}

		if (Object.keys(update).length) {
			await auth.keys.set(update)
		}
	}

	return {
		async processBundle(address: WasmAddress, bundle: WasmBundle, storageId = address.toString()) {
			await transact(
				[
					{ type: 'session', id: storageId },
					{ type: 'identity-key', id: storageId }
				],
				async () => {
					const out = await bridge.processBundleWithSnapshot(await snapshot(address, [], storageId), address, bundle)
					await apply(storageId, out.changes)
				}
			)
		},

		async encrypt(address: WasmAddress, data: Uint8Array, storageId = address.toString()) {
			return transact(
				[
					{ type: 'session', id: storageId },
					{ type: 'identity-key', id: storageId }
				],
				async () => {
					const out = await bridge.encryptWithSnapshot(await snapshot(address, [], storageId), address, data)
					await apply(storageId, out.changes)
					return {
						type: out.messageType === 3 ? ('pkmsg' as const) : ('msg' as const),
						ciphertext: out.ciphertext
					}
				}
			)
		},

		async decryptPreKey(
			address: WasmAddress,
			ciphertext: Uint8Array,
			preKeyIds: number[] = [],
			storageId = address.toString()
		) {
			return transact(
				[
					{ type: 'session', id: storageId },
					{ type: 'identity-key', id: storageId },
					...preKeyIds.map(id => ({ type: 'pre-key' as const, id: String(id) }))
				],
				async () => {
					const out = await bridge.decryptPreKeyWithSnapshot(
						await snapshot(address, preKeyIds, storageId),
						address,
						ciphertext
					)
					await apply(storageId, out.changes)
					return out.plaintext
				}
			)
		},

		async decryptWhisper(address: WasmAddress, ciphertext: Uint8Array, storageId = address.toString()) {
			return transact(
				[
					{ type: 'session', id: storageId },
					{ type: 'identity-key', id: storageId }
				],
				async () => {
					const out = await bridge.decryptWhisperWithSnapshot(
						await snapshot(address, [], storageId),
						address,
						ciphertext
					)
					await apply(storageId, out.changes)
					return out.plaintext
				}
			)
		}
	}
}
