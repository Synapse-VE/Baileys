import { readFileSync } from 'node:fs'
import P from 'pino'
import * as bridge from '../../../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'
import { LIDMappingStore } from '../../Signal/lid-mapping'
import { makeWasmSignalRepository } from '../../Signal/wasm/repository'
import type { SignalAuthState, SignalDataSet, SignalDataTypeMap, SignalKeyStore } from '../../Types'
import { addTransactionCapability } from '../../Utils/auth-utils'
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

const makeLegacyAuth = (): SignalAuthState => {
	const data = revive(fixture.bob.store) as Record<string, Record<string, unknown>>
	const store: SignalKeyStore = {
		get: async (type, ids) => {
			const bucket = data[type] || {}
			const out: Record<string, unknown> = {}
			for (const id of ids) {
				if (bucket[id] !== undefined && bucket[id] !== null) out[id] = bucket[id]
			}

			return out as { [id: string]: SignalDataTypeMap[typeof type] }
		},
		set: async (update: SignalDataSet) => {
			for (const [type, entries] of Object.entries(update)) {
				data[type] ||= {}
				for (const [id, value] of Object.entries(entries ?? {})) {
					if (value === null) delete data[type][id]
					else data[type][id] = value
				}
			}
		}
	}

	return {
		creds: revive(fixture.bob.creds) as never,
		keys: addTransactionCapability(store, P({ level: 'silent' }), {
			maxCommitRetries: 1,
			delayBetweenTriesMs: 1
		})
	}
}

describe('legacy group migration', () => {
	it('decrypts a fixture group message after importing the legacy auth state', async () => {
		const auth = makeLegacyAuth()
		const repository = makeWasmSignalRepository({
			bridge: bridge as never,
			auth,
			address: (user, device) => new bridge.ProtocolAddress(user, device),
			lidMapping: new LIDMappingStore(auth.keys as never, P({ level: 'silent' }))
		})
		const pending = fixture.pendingGroup[0]!
		const plaintext = await repository.decryptGroupMessage({
			group: fixture.jids.groupJid,
			authorJid: fixture.jids.aliceJid,
			msg: Buffer.from(pending.ct, 'base64')
		})
		expect(new TextDecoder().decode(plaintext)).toBe(pending.pt)
	})
})
