import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('proto-extract/package.json', root), 'utf8'))
const source = readFileSync(new URL('proto-extract/index.js', root), 'utf8')

test('the extractor does not depend on the abandoned request package', () => {
	for (const dependency of Object.keys(pkg.dependencies ?? {})) {
		assert.ok(!dependency.startsWith('request'), `unexpected dependency: ${dependency}`)
	}
	assert.doesNotMatch(source, /request-promise|require\(['"]request['"]\)/)
	assert.match(source, /fetch\(/)
})
