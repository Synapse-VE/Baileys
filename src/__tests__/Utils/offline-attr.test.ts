import { isOfflineAttr } from '../../Utils/offline'

describe('isOfflineAttr', () => {
	it('does not treat the string "0" as offline', () => {
		expect(isOfflineAttr('0')).toBe(false)
		expect(isOfflineAttr(undefined)).toBe(false)
		expect(isOfflineAttr('false')).toBe(false)
	})

	it('recognizes the offline markers WhatsApp sends', () => {
		expect(isOfflineAttr('1')).toBe(true)
		expect(isOfflineAttr('true')).toBe(true)
	})
})
