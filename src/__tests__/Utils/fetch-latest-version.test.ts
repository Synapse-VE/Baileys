import { fetchLatestBaileysVersion } from '../../Utils/generics'

describe('fetchLatestBaileysVersion', () => {
	const originalFetch = globalThis.fetch

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	it('reports the version published by WhatsApp Web', async () => {
		const revision = 1_100_000_000
		globalThis.fetch = (async () => ({
			ok: true,
			text: async () => `self.addEventListener('install',()=>{"client_revision":${revision}})`
		})) as unknown as typeof fetch

		const result = await fetchLatestBaileysVersion()

		expect(result.version).toEqual([2, 3000, revision])
		expect(result.isLatest).toBe(true)
	})

	it('falls back to the bundled version when the network fails', async () => {
		globalThis.fetch = (async () => {
			throw new Error('offline')
		}) as unknown as typeof fetch

		const result = await fetchLatestBaileysVersion()

		expect(result.version).toHaveLength(3)
		expect(result.version[0]).toBe(2)
		expect(result.isLatest).toBe(false)
		expect(result.error).toBeDefined()
	})
})
