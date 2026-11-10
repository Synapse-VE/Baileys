import { readFileSync } from 'node:fs'
import P from 'pino'
import * as bridge from '../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'
import { makeLibSignalRepository } from '../../Signal/libsignal'
import { LIDMappingStore } from '../../Signal/lid-mapping'
import { makeWasmSignalRepository } from '../../Signal/wasm/repository'
import type { SignalAuthState, SignalDataTypeMap } from '../../Types'
import { addTransactionCapability } from '../../Utils/auth-utils'

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
				const stored = values.get(`${type}:${id}`)
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
		keys: addTransactionCapability(keys, P({ level: 'silent' }), {
			maxCommitRetries: 1,
			delayBetweenTriesMs: 1
		})
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

		expect(await aliceRepo.validateSession(bobJid)).toEqual({ exists: true })
		expect(aliceRepo.jidToSignalProtocolAddress('551100000001:2@s.whatsapp.net')).toBe('551100000001.2')

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

		const sessionInfo = await bobRepo.getSessionInfo(aliceJid)
		expect(sessionInfo?.registrationId).toBe(alice.registrationId)
		expect(sessionInfo?.baseKey.length).toBeGreaterThan(0)

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

		await aliceRepo.deleteSession([bobJid])
		expect(await aliceRepo.validateSession(bobJid)).toEqual({ exists: false, reason: 'no session' })
	})

	it('creates, distributes and decrypts a group sender key', async () => {
		const alice = makeParty()
		const bob = makeParty()
		const aliceRepo = makeRepository(makeAuth(alice))
		const bobRepo = makeRepository(makeAuth(bob))
		const group = '120363000000000000@g.us'

		const first = await aliceRepo.encryptGroupMessage({
			group,
			meId: aliceJid,
			data: new TextEncoder().encode('grupo wasm')
		})
		expect(first.ciphertext.length).toBeGreaterThan(0)

		await bobRepo.processSenderKeyDistributionMessage({
			item: {
				groupId: group,
				axolotlSenderKeyDistributionMessage: first.senderKeyDistributionMessage
			},
			authorJid: aliceJid
		})
		const plaintext = await bobRepo.decryptGroupMessage({
			group,
			authorJid: aliceJid,
			msg: first.ciphertext
		})
		expect(new TextDecoder().decode(plaintext)).toBe('grupo wasm')
		expect(await bobRepo.hasSenderKey({ group, meId: aliceJid })).toBe(true)

		const reply = await bobRepo.encryptGroupMessage({
			group,
			meId: bobJid,
			data: new TextEncoder().encode('respuesta grupo')
		})
		await aliceRepo.processSenderKeyDistributionMessage({
			item: {
				groupId: group,
				axolotlSenderKeyDistributionMessage: reply.senderKeyDistributionMessage
			},
			authorJid: bobJid
		})
		const replyIn = await aliceRepo.decryptGroupMessage({
			group,
			authorJid: bobJid,
			msg: reply.ciphertext
		})
		expect(new TextDecoder().decode(replyIn)).toBe('respuesta grupo')
	})

	it('clears the old session when the peer identity changes', async () => {
		const alice = makeParty()
		const bob = makeParty()
		const aliceAuth = makeAuth(alice)
		const bobAuth = makeAuth(bob)
		const aliceRepo = makeRepository(aliceAuth)
		const bobRepo = makeRepository(bobAuth)
		const bobAddress = new bridge.ProtocolAddress('551100000002', 0)

		const pair = await bridge.processBundleWithSnapshot(
			{ identity: alice.identity, registrationId: alice.registrationId, preKeys: [], signedPreKeys: [] },
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
		const first = await aliceRepo.encryptMessage({ jid: bobJid, data: new TextEncoder().encode('old identity') })
		await bobRepo.decryptMessage({ jid: aliceJid, type: 'pkmsg', ciphertext: first.ciphertext })

		const replacement = makeParty()
		const replacementAuth = makeAuth(replacement)
		const replacementRepo = makeRepository(replacementAuth)
		const replacementPair = await bridge.processBundleWithSnapshot(
			{ identity: replacement.identity, registrationId: replacement.registrationId, preKeys: [], signedPreKeys: [] },
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
		await replacementAuth.keys.set({ session: { [bobAddress.toString()]: replacementPair.changes.session! } })
		await bobAuth.keys.set({
			'pre-key': {
				'1': { public: bob.preKey.keyPair.pubKey, private: bob.preKey.keyPair.privKey }
			}
		})

		const second = await replacementRepo.encryptMessage({
			jid: bobJid,
			data: new TextEncoder().encode('new identity')
		})
		const plaintext = await bobRepo.decryptMessage({
			jid: aliceJid,
			type: 'pkmsg',
			ciphertext: second.ciphertext
		})
		expect(new TextDecoder().decode(plaintext)).toBe('new identity')
		const info = await bobRepo.getSessionInfo(aliceJid)
		expect(info?.registrationId).toBe(replacement.registrationId)
	})

	it('lets the legacy JS repository decrypt a group sender key written by WASM', async () => {
		const alice = makeParty()
		const bob = makeParty()
		const aliceAuth = makeAuth(alice)
		const bobAuth = makeAuth(bob)
		const aliceRepo = makeRepository(aliceAuth)
		const bobRepo = makeRepository(bobAuth)
		const group = '120363000000000000@g.us'

		const first = await aliceRepo.encryptGroupMessage({
			group,
			meId: aliceJid,
			data: new TextEncoder().encode('grupo legacy')
		})
		await bobRepo.processSenderKeyDistributionMessage({
			item: { groupId: group, axolotlSenderKeyDistributionMessage: first.senderKeyDistributionMessage },
			authorJid: aliceJid
		})
		const firstPlain = await bobRepo.decryptGroupMessage({
			group,
			authorJid: aliceJid,
			msg: first.ciphertext
		})
		expect(new TextDecoder().decode(firstPlain)).toBe('grupo legacy')

		const second = await aliceRepo.encryptGroupMessage({
			group,
			meId: aliceJid,
			data: new TextEncoder().encode('legacy group reads this')
		})
		const legacyBob = makeLibSignalRepository(bobAuth, P({ level: 'silent' }))
		const plaintext = await legacyBob.decryptGroupMessage({
			group,
			authorJid: aliceJid,
			msg: Buffer.from(second.ciphertext)
		})
		expect(new TextDecoder().decode(plaintext)).toBe('legacy group reads this')
		legacyBob.close?.()
	})

	it('lets the legacy JS repository read a session advanced by WASM', async () => {
		const alice = makeParty()
		const bob = makeParty()
		const aliceAuth = makeAuth(alice)
		const bobAuth = makeAuth(bob)
		const aliceRepo = makeRepository(aliceAuth)
		const bobRepo = makeRepository(bobAuth)
		const bobAddress = new bridge.ProtocolAddress('551100000002', 0)

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

		const first = await aliceRepo.encryptMessage({ jid: bobJid, data: new TextEncoder().encode('first wasm') })
		await bobRepo.decryptMessage({ jid: aliceJid, type: 'pkmsg', ciphertext: first.ciphertext })

		const ack = await bobRepo.encryptMessage({ jid: aliceJid, data: new TextEncoder().encode('ack') })
		await aliceRepo.decryptMessage({ jid: bobJid, type: ack.type, ciphertext: ack.ciphertext })

		const second = await aliceRepo.encryptMessage({ jid: bobJid, data: new TextEncoder().encode('legacy reads this') })
		expect(second.type).toBe('msg')

		const legacyBob = makeLibSignalRepository(bobAuth, P({ level: 'silent' }))
		const plaintext = await legacyBob.decryptMessage({
			jid: aliceJid,
			type: 'msg',
			ciphertext: Buffer.from(second.ciphertext)
		})
		expect(new TextDecoder().decode(plaintext)).toBe('legacy reads this')
		legacyBob.close?.()
	})
})
