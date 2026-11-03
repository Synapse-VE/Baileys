import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// WhatsApp removed these from the live schema, but Baileys still needs to decode
// them from history sync payloads produced by older clients.
const LEGACY_MESSAGES = `
message LIDMigrationMapping {
    uint64 pn = 1;
    uint64 assignedLid = 2;
    optional uint64 latestLid = 3;
}

message LIDMigrationMappingSyncPayload {
    repeated LIDMigrationMapping pnToLidMappings = 1;
    optional uint64 chatDbMigrationTimestamp = 2;
}
`

// WhatsApp renumbered pollResultSnapshotMessageV3 from 114 to 115; keep the old
// number readable so messages already stored with 114 still decode.
const LEGACY_POLL_FIELD = '    optional PollResultSnapshotMessage pollResultSnapshotMessageV3Legacy = 114;'

export const applyProtoCompat = proto => {
	let out = proto

	if (!out.includes('message LIDMigrationMapping {')) {
		out = out.trimEnd() + '\n' + LEGACY_MESSAGES
	}

	if (!out.includes('pollResultSnapshotMessageV3Legacy')) {
		const lines = out.split('\n')
		const start = lines.findIndex(line => line.trim() === 'message Message {')
		if (start === -1) {
			throw new Error('message Message not found in proto')
		}

		let depth = 0
		let end = -1
		for (let i = start; i < lines.length; i++) {
			depth += (lines[i].match(/{/g) || []).length
			depth -= (lines[i].match(/}/g) || []).length
			if (i > start && depth === 0) {
				end = i
				break
			}
		}

		if (end === -1) {
			throw new Error('closing brace of message Message not found')
		}

		lines.splice(end, 0, LEGACY_POLL_FIELD)
		out = lines.join('\n')
	}

	return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const path = new URL('../WAProto/WAProto.proto', import.meta.url)
	const proto = await readFile(path, 'utf8')
	const updated = applyProtoCompat(proto)

	if (updated === proto) {
		console.log('proto compat: nothing to add')
	} else {
		await writeFile(path, updated)
		console.log('proto compat: legacy definitions added')
	}
}
