import { readFileSync } from 'node:fs'

describe('libsignal session logging', () => {
	const source = readFileSync(new URL('../../../node_modules/libsignal/src/session_record.js', import.meta.url), 'utf8')

	it.each(['Session already closed', 'Closing session:', 'Opening session:'])(
		'does not dump session key material for "%s" unless LIBSIGNAL_DEBUG is set',
		message => {
			expect(source).toContain(`if (process.env.LIBSIGNAL_DEBUG) console.`)
			expect(source).not.toMatch(new RegExp(`^\\s*console\\.(info|warn)\\("${message.replace(/[()]/g, '\\$&')}`, 'm'))
		}
	)
})
