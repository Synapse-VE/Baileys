import { getMintedPreKeyCount } from '../../Utils/signal'

describe('getMintedPreKeyCount', () => {
	it('counts minted ids excluding the zero slot', () => {
		expect(getMintedPreKeyCount({ nextPreKeyId: 0 })).toBe(0)
		expect(getMintedPreKeyCount({ nextPreKeyId: 1 })).toBe(0)
		expect(getMintedPreKeyCount({ nextPreKeyId: 1001 })).toBe(1000)
	})

	it('handles a missing counter', () => {
		expect(getMintedPreKeyCount({})).toBe(0)
	})
})
