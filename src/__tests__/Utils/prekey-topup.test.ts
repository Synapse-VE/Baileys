import { getPreKeyTopUpCount } from '../../Utils/signal'

describe('getPreKeyTopUpCount', () => {
	it('refills with the initial batch when the server pool is low or empty', () => {
		expect(getPreKeyTopUpCount(0, 30, 5)).toBe(30)
		expect(getPreKeyTopUpCount(5, 30, 5)).toBe(30)
		expect(getPreKeyTopUpCount(1, 30, 5)).toBe(30)
	})

	it('does nothing while the server still has keys', () => {
		expect(getPreKeyTopUpCount(6, 30, 5)).toBe(0)
		expect(getPreKeyTopUpCount(100, 30, 5)).toBe(0)
	})
})
