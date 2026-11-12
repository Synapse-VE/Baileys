import { readFileSync } from 'node:fs'
import http from 'node:http'
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
const startedAt = Date.now()
const durationMs = minutes * 60_000
const elapsedMinutes = () => +((Date.now() - startedAt) / 60_000).toFixed(1)
const { state, saveCreds } = await useMultiFileAuthState(authDir)
const { version } = await fetchLatestBaileysVersion()
const factory = makeWasmSignalRepositoryFactory(bridge)
let connects = 0
let closes = 0
let messages = 0
let stopped = false
let sock

const describeDisconnect = error => {
	if (!error) return null
	const data = error.data && typeof error.data === 'object' ? error.data : undefined
	return {
		name: error.name,
		message: error.message,
		statusCode: error.output?.statusCode,
		streamError: data?.fullErrorNode?.attrs ?? data?.errorNode?.attrs,
		dataKeys: data ? Object.keys(data) : undefined
	}
}

const startHealthServer = () => {
	const port = Number(process.env.PORT)
	if (!port) return
	const server = http.createServer((request, response) => {
		response.writeHead(200, { 'content-type': 'text/plain' })
		response.end(request.url === '/health' ? 'ok' : 'baileys wasm soak')
	})
	server.listen(port, '0.0.0.0', () => {
		console.log(JSON.stringify({ at: new Date().toISOString(), healthListening: port }))
	})
	const externalUrl = process.env.RENDER_EXTERNAL_URL
	if (externalUrl) {
		const ping = () => fetch(`${externalUrl}/health`).catch(() => {})
		ping()
		setInterval(ping, 240_000)
	}
}

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
					fromMe: message.key.fromMe,
					id: message.key.id,
					textLength: text.length
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
					reconnect: !loggedOut && !stopped,
					error: describeDisconnect(lastDisconnect?.error)
				})
			)
			if (!loggedOut && !stopped) setTimeout(() => void connect().catch(console.error), 5_000)
			return
		}
		console.log(JSON.stringify({ at: new Date().toISOString(), connection, connects, closes, messages }))
	})
}

const finish = reason => {
	if (stopped) return
	stopped = true
	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			done: true,
			reason,
			elapsedMinutes: elapsedMinutes(),
			connects,
			closes,
			messages
		})
	)
	process.exit(0)
}

startHealthServer()
await connect()
setInterval(() => {
	const elapsed = elapsedMinutes()
	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			heartbeat: true,
			elapsedMinutes: elapsed,
			connects,
			closes,
			messages
		})
	)
	if (Date.now() - startedAt >= durationMs) finish('deadline')
}, 60_000)
setTimeout(() => finish('timer'), durationMs)

const stop = async signal => {
	stopped = true
	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			stopping: signal,
			elapsedMinutes: elapsedMinutes(),
			connects,
			closes,
			messages
		})
	)
	try {
		await sock?.end?.(new Error(`soak stopped by ${signal}`))
	} finally {
		process.exit(0)
	}
}
process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))
