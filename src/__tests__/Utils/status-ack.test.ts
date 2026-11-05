import { jest } from '@jest/globals'
import { ackStatusNode } from '../../Utils/status-ack'
import type { BinaryNode } from '../../WABinary'

const node: BinaryNode = { tag: 'status', attrs: { id: 'x', from: '5511@s.whatsapp.net' } }

describe('ackStatusNode', () => {
	it('acks successfully', async () => {
		const send = jest.fn(async () => {})
		const onError = jest.fn()
		await ackStatusNode(node, send, onError)
		expect(send).toHaveBeenCalledWith(node)
		expect(onError).not.toHaveBeenCalled()
	})

	it('reports a failed ack without throwing', async () => {
		const send = jest.fn(async () => {
			throw new Error('send failed')
		})
		const onError = jest.fn()
		await expect(ackStatusNode(node, send, onError)).resolves.toBeUndefined()
		expect(onError).toHaveBeenCalledWith(expect.any(Error), 'acking status stanza')
	})
})
