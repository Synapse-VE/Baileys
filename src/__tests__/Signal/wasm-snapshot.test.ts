import { readFileSync } from 'node:fs'
import * as bridge from '../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'

type SignalSnapshot = Parameters<typeof bridge.encryptWithSnapshot>[0]
type SnapshotBundle = Parameters<typeof bridge.processBundleWithSnapshot>[2]

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

const snapshotOf = (party: ReturnType<typeof makeParty>, extra: Partial<SignalSnapshot> = {}): SignalSnapshot => ({
	identity: party.identity,
	registrationId: party.registrationId,
	preKeys: [
		{
			id: 1,
			keyPair: { public: party.preKey.keyPair.pubKey, private: party.preKey.keyPair.privKey }
		}
	],
	signedPreKeys: [
		{
			id: 1,
			keyPair: {
				public: party.signedPreKey.keyPair.pubKey,
				private: party.signedPreKey.keyPair.privKey
			},
			signature: party.signedPreKey.signature
		}
	],
	...extra
})

describe('WASM snapshot session', () => {
	it('encrypts and decrypts a prekey message and preserves the changeset', async () => {
		const alice = makeParty()
		const bob = makeParty()
		const aliceAddress = address('alice')
		const bobAddress = address('bob')

		const bundle: SnapshotBundle = {
			registrationId: bob.registrationId,
			identityKey: prefixed(bob.identity.public),
			preKey: { keyId: 1, publicKey: prefixed(bob.preKey.keyPair.pubKey) },
			signedPreKey: {
				keyId: 1,
				publicKey: prefixed(bob.signedPreKey.keyPair.pubKey),
				signature: bob.signedPreKey.signature
			}
		}
		const established = await bridge.processBundleWithSnapshot(snapshotOf(alice), bobAddress, bundle)

		expect(established.changes.session).toBeDefined()

		const sent = await bridge.encryptWithSnapshot(
			snapshotOf(alice, { session: established.changes.session }),
			bobAddress,
			new TextEncoder().encode('hola wasm')
		)

		expect(sent.messageType).toBe(3)
		expect(sent.ciphertext.length).toBeGreaterThan(0)
		expect(sent.changes.session).toBeDefined()

		const received = await bridge.decryptPreKeyWithSnapshot(snapshotOf(bob), aliceAddress, sent.ciphertext)

		expect(new TextDecoder().decode(received.plaintext)).toBe('hola wasm')
		expect(received.changes.removedPreKeyId).toBe(1)
		expect(received.changes.session).toBeDefined()
	})
})
