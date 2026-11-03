import { proto } from '../../../WAProto/index.js'
import { getMediaType, getNormalizedMediaType } from '../../Socket/messages-send'

describe('outgoing media type', () => {
	it('resolves media types through view once and ephemeral wrappers', () => {
		const viewOnce = {
			viewOnceMessage: { message: { imageMessage: { url: 'https://mmg.whatsapp.net/x' } } }
		} as proto.IMessage

		expect(getMediaType(viewOnce)).toBe('')
		expect(getNormalizedMediaType(viewOnce)).toBe('image')
	})
})
