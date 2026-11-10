import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import makeWASocket, {
	DisconnectReason,
	fetchLatestBaileysVersion,
	makeWasmSignalRepositoryFactory,
	useMultiFileAuthState
} from '../lib/index.js'
import * as bridge from '../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge.js'
import P from 'pino'

bridge.initSync({
	module: readFileSync(new URL('../vendor/whatsapp-rust-bridge/pkg/whatsapp_rust_bridge_bg.wasm', import.meta.url))
})

const { values } = parseArgs({
	options: {
		auth: { type: 'string', default: '.tools/auth-wasm' },
		minutes: { type: 'string', default: '120' }
	}
})
const authDir = resolve(values.auth)
const minutes = Number(values.minutes)
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('--minutes must be a positive number')

const logger = P({ level: 'silent' })
const { state, saveCreds } = await useMultiFileAuthState(authDir)
const { version } = await fetchLatestBaileysVersion()
const factory = makeWasmSignalRepositoryFactory(bridge)
let connects = 0
let closes = 0
let messages = 0
let stopped = false
let sock

const connect = async () => {
	sock = makeWASocket({
		version,
		logger,
		auth: state,
		markOnlineOnConnect: false,
		syncFullHistory: false,
		makeSignalRepository: factory
	})
	sock.ev.on('creds.update', saveCreds)
	sock.ev.on('messages.upsert', ({ messages: list }) => {
		messages += list.length
		for (const message of list) {
			if (!message.key.remoteJid?.endsWith('@g.us')) continue
			const text =
				message.message?.conversation ||
				message.message?.extendedTextMessage?.text ||
				message.message?.imageMessage?.caption ||
				message.message?.videoMessage?.caption ||
				''
			console.log(
				JSON.stringify({
					at: new Date().toISOString(),
					groupMessage: true,
					from: message.key.remoteJid,
					participant: message.key.participant,
					fromMe: message.key.fromMe,
					id: message.key.id,
					text
				})
			)
		}
	})
	sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
		const code = lastDisconnect?.error?.output?.statusCode
		if (connection === 'open') connects++
		if (connection === 'close') {
			closes++
			const loggedOut = code === DisconnectReason.loggedOut
			console.log(
				JSON.stringify({
					at: new Date().toISOString(),
					connection,
					code,
					connects,
					closes,
					messages,
					reconnect: !loggedOut && !stopped
				})
			)
			if (!loggedOut && !stopped) setTimeout(() => void connect().catch(console.error), 5_000)
			return
		}
		console.log(JSON.stringify({ at: new Date().toISOString(), connection, connects, closes, messages }))
	})
}

await connect()
setInterval(
	() =>
		console.log(
			JSON.stringify({
				at: new Date().toISOString(),
				heartbeat: true,
				connects,
				closes,
				messages
			})
		),
	60_000
)
setTimeout(() => {
	stopped = true
	console.log(JSON.stringify({ at: new Date().toISOString(), done: true, connects, closes, messages }))
	process.exit(0)
}, minutes * 60_000)

const stop = async signal => {
	stopped = true
	console.log(JSON.stringify({ at: new Date().toISOString(), stopping: signal, connects, closes, messages }))
	try {
		await sock?.end?.(new Error(`soak stopped by ${signal}`))
	} finally {
		process.exit(0)
	}
}
process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))
