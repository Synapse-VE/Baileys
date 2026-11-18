import { readFileSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'
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
		minutes: { type: 'string', default: '120' },
		keepalive: { type: 'string', default: '30000' },
		'tcp-keepalive': { type: 'string', default: '30000' },
		'dead-window-minutes': { type: 'string', default: '10' },
		'probe-interval-ms': { type: 'string', default: '90000' },
		'no-probe': { type: 'boolean', default: false }
	}
})
const authDir = resolve(values.auth)
const minutes = Number(values.minutes)
const keepAliveIntervalMs = Number(values.keepalive)
const tcpKeepAliveMs = Number(values['tcp-keepalive'])
const deadWindowMs = Number(values['dead-window-minutes']) * 60_000
const probeIntervalMs = Number(values['probe-interval-ms'])
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('--minutes must be a positive number')
if (!Number.isFinite(keepAliveIntervalMs) || keepAliveIntervalMs < 5_000) throw new Error('--keepalive must be >= 5000')
if (!Number.isFinite(tcpKeepAliveMs) || tcpKeepAliveMs < 0) throw new Error('--tcp-keepalive must be >= 0')
if (!Number.isFinite(deadWindowMs) || deadWindowMs < 60_000) throw new Error('--dead-window-minutes must be >= 1')
if (!Number.isFinite(probeIntervalMs) || probeIntervalMs < 10_000) throw new Error('--probe-interval-ms must be >= 10000')

const logger = P({ level: 'silent' })
const startedAt = Date.now()
const durationMs = minutes * 60_000
const elapsedMinutes = () => +((Date.now() - startedAt) / 60_000).toFixed(1)
const loop = monitorEventLoopDelay({ resolution: 20 })
loop.enable()
let lastCpu = process.cpuUsage()
let lastCpuAt = Date.now()
const { state, saveCreds } = await useMultiFileAuthState(authDir)
const { version } = await fetchLatestBaileysVersion()
const factory = makeWasmSignalRepositoryFactory(bridge)
let connects = 0
let closes = 0
let messages = 0
let reconnectAttempts = 0
let openedAt = null
let stopped = false
let probeTimer = null
let sock

const metrics = () => {
	const cpu = process.cpuUsage(lastCpu)
	const elapsedMs = Math.max(1, Date.now() - lastCpuAt)
	lastCpu = process.cpuUsage()
	lastCpuAt = Date.now()
	const memory = process.memoryUsage()
	const stats = {
		rssMb: +(memory.rss / 1024 / 1024).toFixed(1),
		heapUsedMb: +(memory.heapUsed / 1024 / 1024).toFixed(1),
		cpuUserMs: +(cpu.user / 1000).toFixed(1),
		cpuSystemMs: +(cpu.system / 1000).toFixed(1),
		cpuPct: +(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100).toFixed(2),
		eventLoopP99Ms: +(loop.percentile(99) / 1e6).toFixed(2),
		eventLoopMaxMs: +(loop.max / 1e6).toFixed(2)
	}
	loop.reset()
	return stats
}

const health = () => {
	try {
		return sock?.connectionHealth?.() ?? null
	} catch {
		return null
	}
}

const describeDisconnect = error => {
	if (!error) return null
	const data = error.data && typeof error.data === 'object' ? error.data : undefined
	return {
		name: error.name,
		message: error.message,
		statusCode: error.output?.statusCode,
		streamError: data?.fullErrorNode?.attrs ?? data?.errorNode?.attrs,
		dataKeys: data ? Object.keys(data) : undefined,
		closeCode: data?.closeCode ?? null,
		closeReason: data?.closeReason ?? null,
		wasClean: data?.wasClean ?? null
	}
}

const probe = async () => {
	if (stopped || !sock?.user?.id || !sock.connectionHealth?.().connected) return
	const lastInbound = sock.connectionHealth().lastInboundAt ?? openedAt
	if (!lastInbound || Date.now() - lastInbound.getTime() < deadWindowMs) return
	try {
		const result = await sock.onWhatsApp(sock.user.id)
		console.log(
			JSON.stringify({
				at: new Date().toISOString(),
				probe: true,
				alive: Array.isArray(result) && result.length > 0,
				lastInboundAt: lastInbound.toISOString()
			})
		)
		if (!Array.isArray(result) || result.length === 0) {
			await sock.end(new Error('deaf socket probe returned no result'))
		}
	} catch (error) {
		console.log(
			JSON.stringify({
				at: new Date().toISOString(),
				probe: true,
				alive: false,
				error: error?.message || String(error),
				lastInboundAt: lastInbound.toISOString()
			})
		)
		await sock.end(new Error('deaf socket probe failed'))
	}
}

const scheduleReconnect = () => {
	const base = Math.min(5_000 * 2 ** reconnectAttempts, 60_000)
	const delayMs = Math.round(base * (0.8 + Math.random() * 0.4))
	reconnectAttempts++
	console.log(JSON.stringify({ at: new Date().toISOString(), reconnectInMs: delayMs, attempt: reconnectAttempts }))
	setTimeout(() => void connect().catch(console.error), delayMs)
}

const connect = async () => {
	sock = makeWASocket({
		version,
		logger,
		auth: state,
		markOnlineOnConnect: false,
		syncFullHistory: false,
		keepAliveIntervalMs,
		tcpKeepAliveMs,
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
		if (connection === 'open') {
			connects++
			reconnectAttempts = 0
			openedAt = new Date()
		}
		if (connection === 'close') {
			closes++
			const loggedOut = code === DisconnectReason.loggedOut
			const uptimeMs = openedAt ? Date.now() - openedAt.getTime() : null
			console.log(
				JSON.stringify({
					at: new Date().toISOString(),
					connection,
					code,
					connects,
					closes,
					messages,
					uptimeMs,
					reconnect: !loggedOut && !stopped,
					error: describeDisconnect(lastDisconnect?.error),
					health: health(),
					metrics: metrics()
				})
			)
			openedAt = null
			if (!loggedOut && !stopped) scheduleReconnect()
			return
		}
		console.log(
			JSON.stringify({
				at: new Date().toISOString(),
				connection,
				connects,
				closes,
				messages,
				health: health(),
				metrics: metrics()
			})
		)
	})
}

const finish = reason => {
	if (stopped) return
	stopped = true
	if (probeTimer) clearInterval(probeTimer)
	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			done: true,
			reason,
			elapsedMinutes: elapsedMinutes(),
			connects,
			closes,
			messages,
			health: health(),
			metrics: metrics()
		})
	)
	process.exit(0)
}

await connect()
probeTimer = values['no-probe'] ? null : setInterval(() => void probe(), probeIntervalMs)
setInterval(() => {
	const elapsed = elapsedMinutes()
	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			heartbeat: true,
			elapsedMinutes: elapsed,
			connects,
			closes,
			messages,
			health: health(),
			metrics: metrics()
		})
	)
	if (Date.now() - startedAt >= durationMs) finish('deadline')
}, 60_000)
setTimeout(() => finish('timer'), durationMs)

const stop = async signal => {
	stopped = true
	if (probeTimer) clearInterval(probeTimer)
	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			stopping: signal,
			elapsedMinutes: elapsedMinutes(),
			connects,
			closes,
			messages,
			health: health(),
			metrics: metrics()
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
