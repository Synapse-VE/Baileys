import { makeOfflineNodeProcessor, type MessageType } from '../../Utils/offline-node-processor'
import type { BinaryNode } from '../../WABinary'

describe('offline status node', () => {
	it('routes a status node through the ordered offline processor', async () => {
		const processed: BinaryNode[] = []
		const errors: Array<{ error: Error; context: string }> = []
		const processor = makeOfflineNodeProcessor(
			new Map<MessageType, (node: BinaryNode) => Promise<void>>([
				[
					'status',
					async (node: BinaryNode) => {
						processed.push(node)
					}
				]
			]),
			{
				isWsOpen: () => true,
				onUnexpectedError: (error, context) => errors.push({ error, context }),
				yieldToEventLoop: () => Promise.resolve()
			}
		)

		const node: BinaryNode = { tag: 'status', attrs: { id: 'x', from: '5511@s.whatsapp.net' } }
		processor.enqueue('status', node)
		await new Promise(resolve => setTimeout(resolve, 10))

		expect(processed).toEqual([node])
		expect(errors).toEqual([])
	})
})
