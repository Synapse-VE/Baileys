import { hkdfSync, randomBytes } from 'crypto'
import { proto } from '../../../WAProto/index.js'
import { aesDecryptGCM, aesEncryptGCM } from '../../Utils/crypto'
import { decryptMediaRetryData, encryptMediaRetryRequest } from '../../Utils/messages-media'
import { type BinaryNode, getBinaryNodeChild } from '../../WABinary'

describe('media retry key', () => {
	const mediaKey = randomBytes(32)
	const msgId = '3EB0C0FFEE0123456789'
	const retryKey = Buffer.from(hkdfSync('sha256', mediaKey, Buffer.alloc(0), 'WhatsApp Media Retry Notification', 32))
	const storedMediaKey: string = proto.Message.ImageMessage.create({ mediaKey }).toJSON().mediaKey

	const phoneAnswer = () => {
		const iv = randomBytes(12)
		const plaintext = proto.MediaRetryNotification.encode({
			stanzaId: msgId,
			directPath: '/v/t62.7118-24/fresh-path',
			result: proto.MediaRetryNotification.ResultType.SUCCESS
		}).finish()
		return { ciphertext: aesEncryptGCM(plaintext, retryKey, iv, Buffer.from(msgId)), iv }
	}

	it('decrypts with a binary media key', () => {
		expect(decryptMediaRetryData(phoneAnswer(), mediaKey, msgId).directPath).toBe('/v/t62.7118-24/fresh-path')
	})

	it('decrypts with a base64 media key from JSON', () => {
		expect(typeof storedMediaKey).toBe('string')
		expect(decryptMediaRetryData(phoneAnswer(), storedMediaKey, msgId).directPath).toBe('/v/t62.7118-24/fresh-path')
	})

	it('accepts a data URI base64 key', () => {
		expect(decryptMediaRetryData(phoneAnswer(), `data:;base64,${storedMediaKey}`, msgId).directPath).toBe(
			'/v/t62.7118-24/fresh-path'
		)
	})

	it('encrypts the retry request with the same key for a string media key', () => {
		const node = encryptMediaRetryRequest(
			{ remoteJid: '1234567890@s.whatsapp.net', fromMe: false, id: msgId },
			storedMediaKey,
			'1111111111:1@s.whatsapp.net'
		)
		const encrypt = getBinaryNodeChild(node, 'encrypt')!
		const encP = getBinaryNodeChild(encrypt, 'enc_p')! as BinaryNode & { content: Uint8Array }
		const encIv = getBinaryNodeChild(encrypt, 'enc_iv')! as BinaryNode & { content: Uint8Array }
		const receipt = proto.ServerErrorReceipt.decode(
			aesDecryptGCM(encP.content, retryKey, encIv.content, Buffer.from(msgId))
		)
		expect(receipt.stanzaId).toBe(msgId)
	})
})
