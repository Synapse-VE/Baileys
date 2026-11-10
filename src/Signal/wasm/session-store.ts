import type { SignalAuthState, SignalDataSet, SignalDataTypeMap } from '../../Types'

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
}

/** Minimal 1:1 session store over the bridge snapshot API. */
export const makeWasmSessionStore = (bridge: WasmSessionBridge, auth: SignalAuthState) => {
	const read = async <T extends keyof SignalDataTypeMap>(type: T, id: string) => {
		const result = await auth.keys.get(type, [id])
		return result[id] as SignalDataTypeMap[T] | undefined
	}

	const snapshot = async (
		address: WasmAddress,
		preKeyIds: number[] = [],
		storageId = address.toString()
	): Promise<WasmSnapshot> => {
		const wireId = storageId
		const [session, peerIdentity, ...preKeys] = await Promise.all([
			read('session', wireId),
			read('identity-key', wireId),
			...preKeyIds.map(async id => ({ id, value: await read('pre-key', String(id)) }))
		])

		if (session && !(session instanceof Uint8Array)) {
			throw new Error(`unsupported legacy session record for ${wireId}`)
		}

		return {
			identity: {
				public: auth.creds.signedIdentityKey.public,
				private: auth.creds.signedIdentityKey.private
			},
			registrationId: auth.creds.registrationId,
			session: session as Uint8Array | undefined,
			peerIdentity: peerIdentity as Uint8Array | undefined,
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
			update.session = { [wireId]: changes.session }
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
			const out = await bridge.processBundleWithSnapshot(await snapshot(address, [], storageId), address, bundle)
			await apply(storageId, out.changes)
		},

		async encrypt(address: WasmAddress, data: Uint8Array, storageId = address.toString()) {
			const out = await bridge.encryptWithSnapshot(await snapshot(address, [], storageId), address, data)
			await apply(storageId, out.changes)
			return {
				type: out.messageType === 3 ? ('pkmsg' as const) : ('msg' as const),
				ciphertext: out.ciphertext
			}
		},

		async decryptPreKey(
			address: WasmAddress,
			ciphertext: Uint8Array,
			preKeyIds: number[] = [],
			storageId = address.toString()
		) {
			const out = await bridge.decryptPreKeyWithSnapshot(
				await snapshot(address, preKeyIds, storageId),
				address,
				ciphertext
			)
			await apply(storageId, out.changes)
			return out.plaintext
		},

		async decryptWhisper(address: WasmAddress, ciphertext: Uint8Array, storageId = address.toString()) {
			const out = await bridge.decryptWhisperWithSnapshot(await snapshot(address, [], storageId), address, ciphertext)
			await apply(storageId, out.changes)
			return out.plaintext
		}
	}
}
