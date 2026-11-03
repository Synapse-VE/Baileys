import { isCompanionRegReady, shouldUseRegistrationNode } from '../../Utils/pairing'

describe('shouldUseRegistrationNode', () => {
	it('registers when there are no credentials', () => {
		expect(shouldUseRegistrationNode({ me: undefined, pairingCode: undefined, registered: false })).toBe(true)
	})

	it('logs in for a QR session with existing credentials', () => {
		expect(
			shouldUseRegistrationNode({
				me: { id: '123:1@s.whatsapp.net' },
				pairingCode: undefined,
				registered: false
			})
		).toBe(false)
	})

	it('registers a pairing-code session until it is registered', () => {
		expect(
			shouldUseRegistrationNode({
				me: { id: '123:1@s.whatsapp.net' },
				pairingCode: 'ABCD-EFGH',
				registered: false
			})
		).toBe(true)
	})

	it('logs in once the pairing-code session is registered', () => {
		expect(
			shouldUseRegistrationNode({
				me: { id: '123:1@s.whatsapp.net' },
				pairingCode: 'ABCD-EFGH',
				registered: true
			})
		).toBe(false)
	})
})

describe('isCompanionRegReady', () => {
	it('only accepts the primary_hello stage', () => {
		expect(isCompanionRegReady('primary_hello')).toBe(true)
		expect(isCompanionRegReady(undefined)).toBe(false)
		expect(isCompanionRegReady('companion_hello')).toBe(false)
	})
})
