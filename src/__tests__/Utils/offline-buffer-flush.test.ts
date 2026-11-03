import { jest } from '@jest/globals'
import { scheduleInitialBufferFlush } from '../../Utils/offline'

describe('scheduleInitialBufferFlush', () => {
	it('releases the buffer when the offline marker never arrives', async () => {
		const flush = jest.fn()
		const logger = { warn: jest.fn() }
		scheduleInitialBufferFlush(flush, logger, 20)

		expect(flush).not.toHaveBeenCalled()
		await new Promise(resolve => setTimeout(resolve, 60))
		expect(flush).toHaveBeenCalledTimes(1)
		expect(logger.warn).toHaveBeenCalledTimes(1)
	})

	it('can be cancelled when the marker does arrive', async () => {
		const flush = jest.fn()
		const cancel = scheduleInitialBufferFlush(flush, { warn: jest.fn() }, 20)
		cancel()

		await new Promise(resolve => setTimeout(resolve, 60))
		expect(flush).not.toHaveBeenCalled()
	})
})
