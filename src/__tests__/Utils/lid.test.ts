import { jest } from '@jest/globals'
import { resolveLidDestination } from '../../Utils/lid'
import type { ILogger } from '../../Utils/logger'

const logger = { debug: jest.fn() } as unknown as ILogger

describe('resolveLidDestination', () => {
	beforeEach(() => jest.clearAllMocks())

	it('maps a phone-number JID to its LID', async () => {
		const getLIDForPN = jest.fn(async () => '98765@lid')
		await expect(resolveLidDestination('12345@s.whatsapp.net', getLIDForPN, logger)).resolves.toBe('98765@lid')
	})

	it('keeps the PN when there is no mapping', async () => {
		const getLIDForPN = jest.fn(async () => null)
		await expect(resolveLidDestination('12345@s.whatsapp.net', getLIDForPN, logger)).resolves.toBe(
			'12345@s.whatsapp.net'
		)
	})

	it('keeps the PN when the mapping lookup fails', async () => {
		const getLIDForPN = jest.fn(async () => {
			throw new Error('mapping unavailable')
		})
		await expect(resolveLidDestination('12345@s.whatsapp.net', getLIDForPN, logger)).resolves.toBe(
			'12345@s.whatsapp.net'
		)
		expect(logger.debug).toHaveBeenCalled()
	})

	it('does not touch LID, group or newsletter JIDs', async () => {
		const getLIDForPN = jest.fn(async () => 'unexpected@lid')
		await expect(resolveLidDestination('98765@lid', getLIDForPN, logger)).resolves.toBe('98765@lid')
		await expect(resolveLidDestination('1203@g.us', getLIDForPN, logger)).resolves.toBe('1203@g.us')
		await expect(resolveLidDestination('123@newsletter', getLIDForPN, logger)).resolves.toBe('123@newsletter')
		expect(getLIDForPN).not.toHaveBeenCalled()
	})
})
