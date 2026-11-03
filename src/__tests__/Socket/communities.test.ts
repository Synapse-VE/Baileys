import { Boom } from '@hapi/boom'
import { extractCommunityMetadata } from '../../Socket/communities'
import type { BinaryNode } from '../../WABinary'

const metadataNode = (tag: 'community' | 'group'): BinaryNode => ({
	tag,
	attrs: {
		id: '120363000000000000',
		creation: '1700000000',
		s_t: '1700000000',
		subject: 'Test Community'
	},
	content: []
})

describe('extractCommunityMetadata', () => {
	it.each(['community', 'group'] as const)('parses metadata from a <%s> response node', tag => {
		const result: BinaryNode = { tag: 'iq', attrs: { type: 'result' }, content: [metadataNode(tag)] }

		const metadata = extractCommunityMetadata(result)

		expect(metadata.id).toBe('120363000000000000@g.us')
		expect(metadata.subject).toBe('Test Community')
	})

	it('throws a classified Boom when neither node is present', () => {
		const result: BinaryNode = { tag: 'iq', attrs: { type: 'result' }, content: [] }
		const captured = (() => {
			try {
				extractCommunityMetadata(result)
			} catch (error) {
				return error
			}
		})()

		expect(captured).toBeInstanceOf(Boom)
		expect((captured as Error).message).toMatch(/missing <community> or <group> node/)
	})

	it('throws when the metadata node has no id', () => {
		const community = metadataNode('community')
		delete (community.attrs as Record<string, string>).id
		expect(() => extractCommunityMetadata({ tag: 'iq', attrs: { type: 'result' }, content: [community] })).toThrow(
			/missing community id/
		)
	})
})
