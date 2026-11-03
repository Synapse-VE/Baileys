import {
	extractMessageContent,
	getAggregateVotesInPollMessage,
	getContentType,
	normalizeMessageContent
} from '../../Utils/messages'

describe('new WhatsApp content types', () => {
	it.each(['spoilerMessage', 'newsletterScheduledMessage', 'acp2SettingMessage', 'audioStickerMessage'] as const)(
		'unwraps %s FutureProof wrappers',
		wrapper => {
			const content = { [wrapper]: { message: { conversation: 'hola' } } }
			expect(normalizeMessageContent(content)).toEqual({ conversation: 'hola' })
		}
	)

	it('exposes instant images as regular image content', () => {
		const instantImage = { url: 'https://mmg.whatsapp.net/x', mimetype: 'image/jpeg' }
		expect(extractMessageContent({ instantImageMessage: instantImage })).toEqual({ imageMessage: instantImage })
	})

	it('aggregates votes for pollCreationMessageV6', () => {
		const aggregated = getAggregateVotesInPollMessage({
			message: { pollCreationMessageV6: { options: [{ optionName: 'A' }, { optionName: 'B' }] } },
			pollUpdates: []
		})

		expect(aggregated.map(v => v.name)).toEqual(['A', 'B'])
	})
})

describe('new content fields are discoverable', () => {
	it.each([
		'acp2SettingMessage',
		'audioStickerMessage',
		'botGroupParticipantMessage',
		'botPlatformRegistrationSuccessMessage',
		'conditionalRevealMessage',
		'eventInviteMessage',
		'groupRootKeyShare',
		'instantImageMessage',
		'musicMessage',
		'newsletterAdminProfileMessage',
		'newsletterAdminProfileStatusMessage',
		'newsletterScheduledMessage',
		'paymentReminderMessage',
		'pollAddOptionMessage',
		'pollCreationMessageV6',
		'requestLocationMessage',
		'requestLocationUpdateMessage',
		'rootSecretDistributeMessage',
		'splitPaymentMessage',
		'splitPaymentUpdateMessage',
		'spoilerMessage',
		'statusLinkPreviewMetadata'
	])('getContentType returns %s', key => {
		expect(getContentType({ [key]: {} })).toBe(key)
	})
})
