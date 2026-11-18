import P from 'pino'
import { NOISE_WA_HEADER } from '../../Defaults'
import { Curve } from '../../Utils/crypto'
import { makeNoiseHandler } from '../../Utils/noise-handler'

describe('noise input buffer', () => {
	it('rejects a frame that exceeds the bounded buffer', async () => {
		const noise = makeNoiseHandler({
			keyPair: Curve.generateKeyPair(),
			NOISE_HEADER: NOISE_WA_HEADER,
			logger: P({ level: 'silent' })
		})

		await expect(noise.decodeFrame(Buffer.alloc(10 * 1024 * 1024 + 1), () => undefined)).rejects.toThrow(
			'noise input buffer exceeded limit'
		)

		noise.destroy()
	})
})
