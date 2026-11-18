import { readFileSync } from 'node:fs'
import * as bridge from '../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'

bridge.initSync({
	module: readFileSync(new URL('../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge_bg.wasm', import.meta.url))
})

const N = 5000
const prefixed = key => (key.length === 33 ? key : Uint8Array.from([5, ...key]))
const addr = name => new bridge.ProtocolAddress(name, 1)
const party = () => {
	const identity = bridge.generateIdentityKeyPair()
	return {
		identity: { public: identity.pubKey, private: identity.privKey },
		registrationId: bridge.generateRegistrationId(),
		signedPreKey: bridge.generateSignedPreKey(identity, 1),
		preKey: bridge.generatePreKey(1)
	}
}
const snapshot = (p, extra = {}) => ({
	identity: p.identity,
	registrationId: p.registrationId,
	preKeys: [{ id: 1, keyPair: { public: p.preKey.keyPair.pubKey, private: p.preKey.keyPair.privKey } }],
	signedPreKeys: [
		{
			id: 1,
			keyPair: { public: p.signedPreKey.keyPair.pubKey, private: p.signedPreKey.keyPair.privKey },
			signature: p.signedPreKey.signature
		}
	],
	...extra
})

const alice = party()
const bob = party()
const a = addr('alice')
const b = addr('bob')
const bundle = {
	registrationId: bob.registrationId,
	identityKey: prefixed(bob.identity.public),
	preKey: { keyId: 1, publicKey: prefixed(bob.preKey.keyPair.pubKey) },
	signedPreKey: {
		keyId: 1,
		publicKey: prefixed(bob.signedPreKey.keyPair.pubKey),
		signature: bob.signedPreKey.signature
	}
}
const established = await bridge.processBundleWithSnapshot(snapshot(alice), b, bundle)
let aliceSession = established.changes.session
let bobSession
const payload = new TextEncoder().encode('bench')

const start = performance.now()
for (let i = 0; i < N; i++) {
	const sent = await bridge.encryptWithSnapshot(snapshot(alice, { session: aliceSession }), b, payload)
	aliceSession = sent.changes.session

	const received =
		sent.messageType === 3
			? await bridge.decryptPreKeyWithSnapshot(snapshot(bob), a, sent.ciphertext)
			: await bridge.decryptWhisperWithSnapshot(snapshot(bob, { session: bobSession }), a, sent.ciphertext)
	bobSession = received.changes.session
	if (new TextDecoder().decode(received.plaintext) !== 'bench') throw new Error('bad inbound plaintext')

	const reply = await bridge.encryptWithSnapshot(snapshot(bob, { session: bobSession }), a, payload)
	bobSession = reply.changes.session
	const replyIn = await bridge.decryptWhisperWithSnapshot(
		snapshot(alice, { session: aliceSession }),
		b,
		reply.ciphertext
	)
	aliceSession = replyIn.changes.session
	if (new TextDecoder().decode(replyIn.plaintext) !== 'bench') throw new Error('bad reply plaintext')
}
const totalMs = performance.now() - start
const result = {
	date: new Date().toISOString(),
	roundtrips: N,
	totalMs: +totalMs.toFixed(2),
	roundtripsPerSecond: +(N / (totalMs / 1000)).toFixed(0),
	avgRoundtripMs: +(totalMs / N).toFixed(3)
}
console.log(JSON.stringify(result))
