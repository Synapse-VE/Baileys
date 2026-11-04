import type { AuthenticationState, SignalDataTypeMap, SignalKeyStore } from '../../Types'
import { initAuthCreds } from '../../Utils/auth-utils'
import { getNextPreKeysNode } from '../../Utils/signal'

const makeState = (nextPreKeyId = 101) => {
	const data: Record<string, Record<string, unknown>> = { 'pre-key': {} }
	const keys: SignalKeyStore = {
		get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
			const result: Record<string, SignalDataTypeMap[T]> = {}
			for (const id of ids) {
				const value = data[type]?.[id]
				if (value !== undefined) result[id] = value as SignalDataTypeMap[T]
			}

			return result
		},
		set: async update => {
			for (const type of Object.keys(update) as (keyof SignalDataTypeMap)[]) {
				for (const id of Object.keys(update[type] ?? {})) {
					const value = update[type]![id]
					if (value === null || value === undefined) {
						delete data[type]?.[id]
					} else {
						data[type] = data[type] ?? {}
						data[type][id] = value
					}
				}
			}
		}
	}
	const creds = initAuthCreds()
	creds.nextPreKeyId = nextPreKeyId
	creds.firstUnuploadedPreKeyId = nextPreKeyId
	const state: AuthenticationState = { creds, keys }
	return { state, data }
}

describe('prekey allocation/commit split', () => {
	it('only advances nextPreKeyId before the server confirms', async () => {
		const { state } = makeState(101)
		const { allocUpdate, commitUpdate } = await getNextPreKeysNode(state, 5)

		expect(allocUpdate).toEqual({ nextPreKeyId: 106 })
		expect(commitUpdate).toEqual({ firstUnuploadedPreKeyId: 106 })
		expect(allocUpdate).not.toHaveProperty('firstUnuploadedPreKeyId')
		expect(commitUpdate).not.toHaveProperty('nextPreKeyId')
	})
})
