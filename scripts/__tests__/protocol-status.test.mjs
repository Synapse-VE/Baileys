import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStatus, parseProtoVersion, parseSwVersion } from '../protocol-status.mjs'

test('reads the version from the proto header', () => {
	assert.equal(parseProtoVersion('/// WhatsApp Version: 2.3000.1052769028\n'), '2.3000.1052769028')
	assert.equal(parseProtoVersion('no header'), undefined)
})

test('reads the client revision from sw.js', () => {
	assert.equal(parseSwVersion('{"client_revision":1052769028}'), '2.3000.1052769028')
	assert.equal(parseSwVersion('{"client_revision":1052769028}'.replace('client_revision', 'other')), undefined)
})

test('reports whether proto and advertised version match', () => {
	const status = buildStatus({
		packageVersion: '7.0.0-rc14.sync.2',
		protoVersion: '2.3000.1',
		advertisedVersion: '2.3000.1',
		currentVersion: '2.3000.2',
		generatedAt: '2026-11-03T00:00:00.000Z'
	})

	assert.match(status, /@synapse-ve\/baileys@7\.0\.0-rc14\.sync\.2/)
	assert.match(status, /Proto y versión coinciden \| sí/)
	assert.match(status, /Versión anunciada al día \| no/)
})
