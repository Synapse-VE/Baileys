// Live smoke for workflow_dispatch. Needs E2E_AUTH_DIR (multi-file auth folder)
// and E2E_TARGET (jid). Without them it exits cleanly so the workflow can run
// before secrets are configured.
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '../lib/index.js'
import P from 'pino'

const authDir = process.env.E2E_AUTH_DIR
const target = process.env.E2E_TARGET

if (!authDir || !target) {
	console.log('E2E_AUTH_DIR or E2E_TARGET missing, skipping live smoke')
	process.exit(0)
}

const { state, saveCreds } = await useMultiFileAuthState(authDir)
const sock = makeWASocket({ logger: P({ level: 'silent' }), auth: state, syncFullHistory: false })
sock.ev.on('creds.update', saveCreds)

let sentId
let acked = false

sock.ev.on('messages.update', updates => {
	for (const { key, update } of updates) {
		if (key.id === sentId && (update.status ?? 0) >= 2) acked = true
	}
})

sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
	if (connection === 'open') {
		const sent = await sock.sendMessage(target, { text: `live smoke ${new Date().toISOString()}` })
		sentId = sent?.key.id
		console.log(`sent ${sentId}`)
	}

	if (connection === 'close') {
		const code = lastDisconnect?.error?.output?.statusCode
		console.log(`closed ${code}`)
		if (code === DisconnectReason.loggedOut) process.exit(1)
	}
})

setTimeout(() => {
	console.log(acked ? 'delivery ack received' : 'no delivery ack')
	process.exit(acked ? 0 : 2)
}, 90_000)
