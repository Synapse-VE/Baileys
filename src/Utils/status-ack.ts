import type { BinaryNode } from '../WABinary'

/**
 * Acknowledges a top-level <status> stanza. Kept separate from the socket
 * listener so the failure path is deterministic and testable.
 */
export const ackStatusNode = async (
	node: BinaryNode,
	sendAck: (node: BinaryNode) => Promise<void>,
	onUnexpectedError: (error: Error, context: string) => void
) => {
	try {
		await sendAck(node)
	} catch (error) {
		onUnexpectedError(error as Error, 'acking status stanza')
	}
}
