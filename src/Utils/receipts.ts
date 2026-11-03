import { proto } from '../../WAProto/index.js'

/** Maps a receipt status to the timestamp field it belongs in, if any. */
export const getReceiptTimestampField = (status: number) => {
	switch (status) {
		case proto.WebMessageInfo.Status.DELIVERY_ACK:
			return 'receiptTimestamp' as const
		case proto.WebMessageInfo.Status.READ:
			return 'readTimestamp' as const
		case proto.WebMessageInfo.Status.PLAYED:
			return 'playedTimestamp' as const
		default:
			return undefined
	}
}
