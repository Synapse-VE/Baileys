import { readFileSync } from 'node:fs'
import P from 'pino'
import * as bridge from '../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'
import { LIDMappingStore } from '../../Signal/lid-mapping'
import { makeWasmSignalRepository } from '../../Signal/wasm/repository'
import type { SignalAuthState, SignalDataTypeMap } from '../../Types'

bridge.initSync({
	module: readFileSync(
		new URL('../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge_bg.wasm', import.meta.url)
	)
})

const aliceJid = '551100000001@s.whatsapp.net'
const bobJid = '551100000002@s.whatsapp.net'
const prefixed = (key: Uint8Array) => (key.length === 33 ? key : Uint8Array.from([5, ...key]))

const makeParty = () => {
	const identity = bridge.generateIdentityKeyPair()
	return {
		identity: { public: identity.pubKey, private: identity.privKey },
		registrationId: bridge.generateRegistrationId(),
		signedPreKey: bridge.generateSignedPreKey(identity, 1),
		preKey: bridge.generatePreKey(1)
	}
}

const makeAuth = (party: ReturnType<typeof makeParty>): SignalAuthState => {
	const values = new Map<string, Uint8Array | null>()
	const keys = {
		get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
			const out: Record<string, unknown> = {}
			for (const id of ids) {
				if (type === 'pre-key' && id === '1') {
					out[id] = {
						public: party.preKey.keyPair.pubKey,
						private: party.preKey.keyPair.privKey
					}
				} else {
					out[id] = values.get(`${type}:${id}`)
				}
			}

			return out as { [id: string]: SignalDataTypeMap[T] }
		},
		set(data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }) {
			for (const [type, entries] of Object.entries(data)) {
				for (const [id, value] of Object.entries(entries ?? {})) {
					values.set(`${type}:${id}`, value as Uint8Array | null)
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

const makeRepository = (auth: SignalAuthState) =>
	makeWasmSignalRepository({
		bridge: bridge as never,
		auth,
		address: (user, device) => new bridge.ProtocolAddress(user, device),
		lidMapping: new LIDMappingStore(auth.keys as never, P({ level: 'silent' }))
	})

describe('WASM SignalRepository phase 1', () => {
	it('routes JID 1:1 messages through the snapshot store', async () => {
		const alice = makeParty()
		const bob = makeParty()
		const aliceAuth = makeAuth(alice)
		const bobAuth = makeAuth(bob)
		const aliceRepo = makeRepository(aliceAuth)
		const bobRepo = makeRepository(bobAuth)
		const bobAddress = new bridge.ProtocolAddress('551100000002', 0)
		const aliceAddress = new bridge.ProtocolAddress('551100000001', 0)

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

		const sent = await aliceRepo.encryptMessage({
			jid: bobJid,
			data: new TextEncoder().encode('repo hola')
		})
		expect(sent.type).toBe('pkmsg')

		const plaintext = await bobRepo.decryptMessage({
			jid: aliceJid,
			type: 'pkmsg',
			ciphertext: sent.ciphertext
		})
		expect(new TextDecoder().decode(plaintext)).toBe('repo hola')

		const restartedBob = makeRepository(bobAuth)
		const reply = await restartedBob.encryptMessage({
			jid: aliceJid,
			data: new TextEncoder().encode('repo respuesta')
		})
		const replyIn = await aliceRepo.decryptMessage({
			jid: bobJid,
			type: 'msg',
			ciphertext: reply.ciphertext
		})
		expect(new TextDecoder().decode(replyIn)).toBe('repo respuesta')
		expect(aliceAddress.toString()).toBe('551100000001.0')
	})
})
