import { readFileSync } from 'node:fs'
import * as bridge from '../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'
import { makeWasmSessionStore } from '../../Signal/wasm/session-store'
import type { SignalAuthState, SignalDataTypeMap } from '../../Types'

bridge.initSync({
	module: readFileSync(
		new URL('../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge_bg.wasm', import.meta.url)
	)
})

const prefixed = (key: Uint8Array) => (key.length === 33 ? key : Uint8Array.from([5, ...key]))
const address = (name: string) => new bridge.ProtocolAddress(name, 1)

const makeParty = () => {
	const identity = bridge.generateIdentityKeyPair()
	return {
		identity: { public: identity.pubKey, private: identity.privKey },
		registrationId: bridge.generateRegistrationId(),
		signedPreKey: bridge.generateSignedPreKey(identity, 1),
		preKey: bridge.generatePreKey(1)
	}
}

type Party = ReturnType<typeof makeParty>

const makeAuth = (party: Party): SignalAuthState => {
	const store = new Map<string, Uint8Array | null>()
	const keys = {
		get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
			const out: Record<string, unknown> = {}
			for (const id of ids) {
				const stored = store.get(`${type}:${id}`)
				if (stored !== undefined) {
					out[id] = stored
				} else if (type === 'pre-key' && id === '1') {
					out[id] = {
						public: party.preKey.keyPair.pubKey,
						private: party.preKey.keyPair.privKey
					}
				} else {
					out[id] = stored
				}
			}

			return out as { [id: string]: SignalDataTypeMap[T] }
		},
		set(data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }) {
			for (const [type, values] of Object.entries(data)) {
				for (const [id, value] of Object.entries(values ?? {})) {
					store.set(`${type}:${id}`, value as Uint8Array | null)
				}
			}
		}
	}

	return {
		creds: {
			signedIdentityKey: party.identity,
			signedPreKey: {
				keyId: 1,
				keyPair: {
					public: party.signedPreKey.keyPair.pubKey,
					private: party.signedPreKey.keyPair.privKey
				},
				signature: party.signedPreKey.signature
			},
			registrationId: party.registrationId
		},
		keys
	} as unknown as SignalAuthState
}

describe('WASM session store', () => {
	it('persists snapshots and decrypts after a restart', async () => {
		const alice = makeParty()
		const bob = makeParty()
		const aliceAuth = makeAuth(alice)
		const bobAuth = makeAuth(bob)
		const aliceStore = makeWasmSessionStore(bridge as never, aliceAuth)
		const bobStore = makeWasmSessionStore(bridge as never, bobAuth)
		const aliceAddress = address('alice')
		const bobAddress = address('bob')

		const pair = await bridge.processBundleWithSnapshot(
			{
				identity: alice.identity,
				registrationId: alice.registrationId,
				preKeys: [],
				signedPreKeys: []
			},
			bobAddress,
			{
				registrationId: bob.registrationId,
				identityKey: prefixed(bob.identity.public),
				preKey: { keyId: 1, publicKey: prefixed(bob.preKey.keyPair.pubKey) },
				signedPreKey: {
					keyId: 1,
					publicKey: prefixed(bob.signedPreKey.keyPair.pubKey),
					signature: bob.signedPreKey.signature
				}
			}
		)
		await aliceAuth.keys.set({ session: { [bobAddress.toString()]: pair.changes.session! } })

		const sent = await aliceStore.encrypt(bobAddress, new TextEncoder().encode('hola store'))
		expect(sent.type).toBe('pkmsg')

		const received = await bobStore.decryptPreKey(aliceAddress, sent.ciphertext, [1])
		expect(new TextDecoder().decode(received)).toBe('hola store')
		const remainingPreKey = await bobAuth.keys.get('pre-key', ['1'])
		expect(remainingPreKey['1']).toBeNull()

		// New store instance, same auth state: the session must survive.
		const restartedBob = makeWasmSessionStore(bridge as never, bobAuth)
		const reply = await restartedBob.encrypt(aliceAddress, new TextEncoder().encode('respuesta store'))
		expect(reply.type).toBe('msg')
	})
})
