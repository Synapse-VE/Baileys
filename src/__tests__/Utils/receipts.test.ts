import { proto } from '../../../WAProto/index.js'
import { getReceiptTimestampField } from '../../Utils/receipts'

describe('getReceiptTimestampField', () => {
	it.each([
		[proto.WebMessageInfo.Status.DELIVERY_ACK, 'receiptTimestamp'],
		[proto.WebMessageInfo.Status.READ, 'readTimestamp'],
		[proto.WebMessageInfo.Status.PLAYED, 'playedTimestamp']
	] as const)('maps %i to %s', (status, field) => {
		expect(getReceiptTimestampField(status)).toBe(field)
	})

	it('ignores statuses that are not per-user receipts', () => {
		expect(getReceiptTimestampField(proto.WebMessageInfo.Status.SERVER_ACK)).toBeUndefined()
	})
})
