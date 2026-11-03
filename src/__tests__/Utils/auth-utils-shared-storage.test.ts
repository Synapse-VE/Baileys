import { readFileSync } from 'node:fs'
import P from 'pino'
import type { SignalKeyStore } from '../../Types'
import { addTransactionCapability } from '../../Utils/auth-utils'

const logger = P({ level: 'silent' })

const makeStore = (): SignalKeyStore => {
	const data: Record<string, Record<string, unknown>> = {}
	return {
		get: async (type, ids) => {
			const result: Record<string, unknown> = {}
			for (const id of ids) {
				const value = data[type]?.[id]
				if (value !== undefined) result[id] = value
			}

			return result as never
		},
		set: async update => {
			for (const type in update) {
				const bucket = (data[type] ??= {})
				Object.assign(bucket, update[type as keyof typeof update])
			}
		}
	}
}

const makeCapability = () =>
	addTransactionCapability(makeStore(), logger, { maxCommitRetries: 1, delayBetweenTriesMs: 1 })

describe('addTransactionCapability', () => {
	it('keeps one AsyncLocalStorage for the whole process', () => {
		const source = readFileSync(new URL('../../Utils/auth-utils.ts', import.meta.url), 'utf-8')
		// A per-socket instance leaks heap because nothing calls disable(); it must be
		// created at module scope, before the capability factory.
		expect(source.indexOf('new AsyncLocalStorage')).toBeLessThan(
			source.indexOf('export const addTransactionCapability')
		)
	})

	it('keeps transaction context isolated between stores', async () => {
		const a = makeCapability()
		const b = makeCapability()

		await a.transaction(async () => {
			expect(a.isInTransaction()).toBe(true)
			expect(b.isInTransaction()).toBe(false)

			await b.transaction(async () => {
				expect(a.isInTransaction()).toBe(true)
				expect(b.isInTransaction()).toBe(true)
			}, 'session')

			expect(b.isInTransaction()).toBe(false)
		}, 'session')

		expect(a.isInTransaction()).toBe(false)
	})
})
