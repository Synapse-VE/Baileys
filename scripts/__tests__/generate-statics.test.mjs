import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const yarnPath = (() => {
	if (process.env.npm_execpath) return dirname(process.env.npm_execpath)
	return join(root, '.tools')
})()

test('GenerateStatics.sh works when invoked from the repository root', () => {
	const workDir = mkdtempSync(join(root, '.proto-test-'))
	try {
		for (const file of ['WAProto.proto', 'fix-imports.js', 'GenerateStatics.sh']) {
			cpSync(join(root, 'WAProto', file), join(workDir, file))
		}

		const result = spawnSync('sh', [join(workDir, 'GenerateStatics.sh')], {
			cwd: root,
			env: { ...process.env, PATH: `${yarnPath}:${process.env.PATH}` },
			encoding: 'utf8',
			timeout: 300_000
		})

		assert.equal(
			result.status,
			0,
			`script failed (status ${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
		)
		assert.ok(existsSync(join(workDir, 'index.js')), 'index.js was not generated')
		assert.ok(existsSync(join(workDir, 'index.d.ts')), 'index.d.ts was not generated')
		assert.ok(statSync(join(workDir, 'index.js')).size > 1_000_000, 'index.js looks truncated')
	} finally {
		rmSync(workDir, { recursive: true, force: true })
	}
})
