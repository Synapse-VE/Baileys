import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countFeatures, isPqActivated } from '../feature-watch.mjs'

test('counts watchlist occurrences', () => {
	const counts = countFeatures('pqMode pqMode XXKEM')
	assert.equal(counts.pqMode, 2)
	assert.equal(counts.XXKEM, 1)
	assert.equal(counts.kyberPreKeyId, 0)
})

test('treats definitions only as inactive', () => {
	assert.equal(isPqActivated({ pqMode: 1, simulateXxkemFs: 2, extendedEphemeral: 1 }), false)
})

test('flags the handshake once the client uses it', () => {
	assert.equal(isPqActivated({ pqMode: 3, simulateXxkemFs: 2, extendedEphemeral: 1 }), true)
	assert.equal(isPqActivated({ simulateXxkemFs: 5 }), true)
})
