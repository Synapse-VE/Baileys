import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyProtoCompat } from '../proto-compat.mjs'

const FIXTURE = `syntax = "proto3";
package proto;

/// WhatsApp Version: 2.3000.1

message PollResultSnapshotMessage {
    optional string id = 1;
}

message Message {
    optional string conversation = 1;

    oneof payload {
        string extendedTextMessage = 2;
    }
}
`

test('restores the legacy LID migration payload', () => {
	const out = applyProtoCompat(FIXTURE)
	assert.match(out, /message LIDMigrationMapping \{/)
	assert.match(out, /message LIDMigrationMappingSyncPayload \{/)
	assert.match(out, /repeated LIDMigrationMapping pnToLidMappings = 1;/)
})

test('keeps the old poll snapshot field number readable', () => {
	const out = applyProtoCompat(FIXTURE)
	assert.match(out, /PollResultSnapshotMessage pollResultSnapshotMessageV3Legacy = 114;/)
})

test('is idempotent', () => {
	const once = applyProtoCompat(FIXTURE)
	const twice = applyProtoCompat(once)
	assert.equal(twice, once)
})
