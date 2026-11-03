import { shouldFanOutRecipients } from '../../Socket/messages-send'

describe('retry resend recipients', () => {
	it('does not fan out a retry to every device', () => {
		expect(shouldFanOutRecipients(true)).toBe(false)
	})

	it('fans out a normal send', () => {
		expect(shouldFanOutRecipients(false)).toBe(true)
	})
})
