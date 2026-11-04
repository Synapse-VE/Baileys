import { shouldReofferPreKeys } from '../../Utils/signal'

const base = { enabled: true, minted: 500, serverCount: 3, topUpCount: 30, missingCurrentPreKey: false }

describe('shouldReofferPreKeys', () => {
	it('re-offers stored keys when the local store already grew', () => {
		expect(shouldReofferPreKeys(base)).toBe(true)
	})

	it('leaves small accounts on the mint path', () => {
		expect(shouldReofferPreKeys({ ...base, minted: 100 })).toBe(false)
	})

	it('does not re-offer when there is no server pool or the current key is missing', () => {
		expect(shouldReofferPreKeys({ ...base, serverCount: 0 })).toBe(false)
		expect(shouldReofferPreKeys({ ...base, missingCurrentPreKey: true })).toBe(false)
	})

	it('can be disabled', () => {
		expect(shouldReofferPreKeys({ ...base, enabled: false })).toBe(false)
	})
})
