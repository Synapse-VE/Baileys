import { readFileSync } from 'node:fs'
import * as bridge from '../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'
import { fromTypedRecord, toTypedRecord } from '../../Signal/legacy-session-codec'
import { generateSignalPubKey } from '../../Utils/crypto'
import fixture from '../fixtures/legacy-session-rc9.json' with { type: 'json' }

bridge.initSync({
	module: readFileSync(
		new URL('../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge_bg.wasm', import.meta.url)
	)
})

const revive = (value: unknown): unknown => {
	if (typeof value === 'object' && value !== null && (value as { type?: string }).type === 'Buffer') {
		const { data } = value as { data: number[] | string }
		return typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data)
	}

	if (Array.isArray(value)) return value.map(revive)
	if (ArrayBuffer.isView(value)) return value
	if (typeof value === 'object' && value !== null) {
		return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, revive(entry)]))
	}

	return value
}

describe('legacy auth migration', () => {
	it('imports a real rc9 session and projects it back to the legacy shape', () => {
		const creds = revive(fixture.alice.creds) as {
			registrationId: number
			signedIdentityKey: { public: Uint8Array }
		}
		const stored = Object.values(fixture.alice.store.session)[0]
		expect(stored).toBeDefined()

		const typed = toTypedRecord(stored as never)
		const bytes = bridge.importLegacySessionRecordV1(typed, {
			identityKey: generateSignalPubKey(creds.signedIdentityKey.public),
			registrationId: creds.registrationId
		})
		expect(bytes.length).toBeGreaterThan(0)

		const projection = bridge.projectLegacySessionRecordV1(bytes)
		expect(projection.status).toBe('projected')
		if (projection.status !== 'projected') return

		const again = fromTypedRecord(projection.record)
		expect(Object.keys(again._sessions ?? {}).length).toBeGreaterThan(0)
		expect(JSON.stringify(toTypedRecord(again))).toBe(JSON.stringify(projection.record))
	})
})
