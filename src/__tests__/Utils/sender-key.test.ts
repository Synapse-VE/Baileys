import { hasUsableSenderKey } from '../../Utils/sender-key'

describe('hasUsableSenderKey', () => {
	it('uses an existing key', () => {
		expect(hasUsableSenderKey('123:1@s.whatsapp.net', { '123:1@s.whatsapp.net': true }, new Set())).toBe(true)
	})

	it('does not use a key for a device whose identity just changed', () => {
		expect(
			hasUsableSenderKey('123:1@s.whatsapp.net', { '123:1@s.whatsapp.net': true }, new Set(['123@s.whatsapp.net']))
		).toBe(false)
	})

	it('does not use a missing key', () => {
		expect(hasUsableSenderKey('123:1@s.whatsapp.net', {}, new Set())).toBe(false)
	})
})
