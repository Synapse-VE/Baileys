#!/usr/bin/env node
// libsignal prints full session records (rootKey, chainKey, ephemeral keys) to
// stdout on session open/close. In production that ends up in hosting logs, so
// guard the three calls behind LIBSIGNAL_DEBUG. Safe to run multiple times.
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')

let packagePath
try {
	packagePath = require.resolve('libsignal/package.json')
} catch {
	process.exit(0)
}

const sessionRecord = join(dirname(packagePath), 'src', 'session_record.js')
if (!existsSync(sessionRecord)) {
	process.exit(0)
}

const replacements = [
	[
		'console.warn("Session already closed", session);',
		'if (process.env.LIBSIGNAL_DEBUG) console.warn("Session already closed", session);'
	],
	[
		'console.info("Closing session:", session);',
		'if (process.env.LIBSIGNAL_DEBUG) console.info("Closing session:", session);'
	],
	[
		'console.info("Opening session:", session);',
		'if (process.env.LIBSIGNAL_DEBUG) console.info("Opening session:", session);'
	]
]

let source = readFileSync(sessionRecord, 'utf8')
let changed = false

for (const [from, to] of replacements) {
	if (source.includes(from)) {
		source = source.split(from).join(to)
		changed = true
	}
}

if (changed) {
	writeFileSync(sessionRecord, source)
	console.log('libsignal session logs guarded (set LIBSIGNAL_DEBUG=1 to restore them)')
}
