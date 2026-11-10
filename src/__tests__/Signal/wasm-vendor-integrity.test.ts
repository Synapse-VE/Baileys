import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../vendor/whatsapp-rust-bridge')

describe('WASM vendor integrity', () => {
	it('matches the pinned artifact hashes', () => {
		const expected = readFileSync(resolve(root, 'SHA256SUMS'), 'utf8')
			.trim()
			.split('\n')
			.map(line => line.split(/\s+/))
			.map(([hash, file]) => {
				if (!hash || !file) throw new Error(`invalid checksum line: ${hash}:${file}`)
				return [hash, file] as const
			})

		for (const [hash, file] of expected) {
			const actual = createHash('sha256')
				.update(readFileSync(resolve(root, file)))
				.digest('hex')
			expect(`${file}:${actual}`).toBe(`${file}:${hash}`)
		}
	})
})
