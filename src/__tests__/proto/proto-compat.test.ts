import { proto } from '../../../WAProto/index.js'

describe('proto compatibility layer', () => {
	it('decodes the legacy LID migration payload that WhatsApp removed from the schema', () => {
		const encoded = proto.LIDMigrationMappingSyncPayload.encode({
			pnToLidMappings: [{ pn: 123, assignedLid: 456, latestLid: 456 }],
			chatDbMigrationTimestamp: 789
		}).finish()

		const decoded = proto.LIDMigrationMappingSyncPayload.decode(encoded)

		expect(decoded.pnToLidMappings?.[0]?.pn?.toString()).toBe('123')
		expect(decoded.pnToLidMappings?.[0]?.latestLid?.toString()).toBe('456')
		expect(decoded.chatDbMigrationTimestamp?.toString()).toBe('789')
	})

	it('still decodes poll snapshots written with the old field number 114', () => {
		// field 114, wire type 2: tag 914 -> varint 0x92 0x07; payload: {id: "x"}
		const legacyBytes = Uint8Array.from([0x92, 0x07, 0x03, 0x0a, 0x01, 0x78])
		const decoded = proto.Message.decode(legacyBytes)

		expect(decoded.pollResultSnapshotMessageV3Legacy?.name).toBe('x')
	})
})
