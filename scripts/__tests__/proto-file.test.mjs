import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const proto = readFileSync(new URL('../../WAProto/WAProto.proto', import.meta.url), 'utf8')

test('committed proto has no proto3-invalid required labels', () => {
	assert.doesNotMatch(proto, /^[ \t]*required /m)
})

test('committed proto keeps the legacy LID payload Baileys still decodes', () => {
	assert.match(proto, /message LIDMigrationMappingSyncPayload \{/)
	assert.match(proto, /message LIDMigrationMapping \{/)
})

test('committed proto keeps the legacy poll snapshot field number', () => {
	assert.match(proto, /pollResultSnapshotMessageV3Legacy = 114;/)
})
