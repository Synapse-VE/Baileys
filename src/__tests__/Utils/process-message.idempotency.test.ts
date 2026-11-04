import NodeCache from '@cacheable/node-cache'
import { EventEmitter } from 'events'
import P from 'pino'
import type { AuthenticationCreds, BaileysEventEmitter, CacheStore, WAMessage } from '../../Types'
import { initAuthCreds } from '../../Utils/auth-utils'
import processMessage from '../../Utils/process-message'

const silent = P({ level: 'silent' })

const credsWithMe = (): AuthenticationCreds => ({
	...initAuthCreds(),
	me: { id: 'me@s.whatsapp.net' } as never
})

const makeContext = (cache?: CacheStore) => {
	const events = new EventEmitter() as unknown as BaileysEventEmitter
	const emitted: Array<{ event: string; payload: unknown }> = []
	const origEmit = (events as unknown as { emit: (event: string, ...args: unknown[]) => boolean }).emit.bind(events)
	;(events as unknown as { emit: (event: string, ...args: unknown[]) => boolean }).emit = (
		event: string,
		...args: unknown[]
	) => {
		emitted.push({ event, payload: args[0] })
		return origEmit(event, ...args)
	}

	return {
		emitted,
		ctx: {
			shouldProcessHistoryMsg: false,
			placeholderResendCache: undefined,
			processedMessageCache: cache,
			ev: events,
			creds: credsWithMe(),
			keyStore: {} as never,
			signalRepository: {} as never,
			logger: silent,
			options: {},
			getMessage: async () => undefined
		}
	}
}

const realMessage = (id: string): WAMessage => ({
	key: {
		remoteJid: 'chat@s.whatsapp.net',
		fromMe: false,
		id,
		participant: 'sender@s.whatsapp.net'
	},
	message: { conversation: 'hello' },
	messageTimestamp: 1675888000
})

describe('processMessage idempotency (M8)', () => {
	it('skips a second pass with the same (msgId, sender)', async () => {
		const cache = new NodeCache<boolean>({ stdTTL: 600, useClones: false }) as unknown as CacheStore
		const { ctx, emitted } = makeContext(cache)
		const msg = realMessage('msg-1')

		await processMessage(msg, ctx as never)
		const afterFirst = emitted.length

		await processMessage(msg, ctx as never)

		expect(await cache.get<boolean>('msg-1:sender@s.whatsapp.net')).toBe(true)
		expect(emitted.length).toBe(afterFirst)
	})

	it('keeps different (msgId, sender) pairs independent', async () => {
		const cache = new NodeCache<boolean>({ stdTTL: 600, useClones: false }) as unknown as CacheStore
		const { ctx, emitted } = makeContext(cache)

		await processMessage(realMessage('msg-1'), ctx as never)
		const afterFirst = emitted.length
		await processMessage(realMessage('msg-2'), ctx as never)

		expect(await cache.get<boolean>('msg-1:sender@s.whatsapp.net')).toBe(true)
		expect(await cache.get<boolean>('msg-2:sender@s.whatsapp.net')).toBe(true)
		expect(emitted.length).toBeGreaterThan(afterFirst)
	})

	it('is atomic for two concurrent duplicates', async () => {
		const persisted = new Map<string, boolean>()
		const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
		const slowCache: CacheStore = {
			get<T>(key: string) {
				return delay(5).then(() => persisted.get(key) as T)
			},
			async set<T>(key: string, value: T) {
				await delay(20)
				persisted.set(key, value as unknown as boolean)
			},
			async del(key: string) {
				persisted.delete(key)
			},
			async flushAll() {
				persisted.clear()
			}
		}

		const probe = makeContext(slowCache)
		await processMessage(realMessage('probe'), probe.ctx as never)
		const emitsPerPass = probe.emitted.length

		const { ctx, emitted } = makeContext(slowCache)
		const msg = realMessage('race-target')
		await Promise.all([processMessage(msg, ctx as never), processMessage(msg, ctx as never)])

		expect(emitted.length).toBe(emitsPerPass)
	})

	it('does not guard when no cache is supplied', async () => {
		const { ctx } = makeContext(undefined)
		await expect(processMessage(realMessage('msg-1'), ctx as never)).resolves.toBeUndefined()
	})
})
