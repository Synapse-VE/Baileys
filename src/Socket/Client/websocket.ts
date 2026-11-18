import WebSocket from 'ws'
import { DEFAULT_ORIGIN } from '../../Defaults'
import { AbstractSocketClient } from './types'

type TrackedListener = {
	event: string
	handler: (...args: any[]) => void
}

export class WebSocketClient extends AbstractSocketClient {
	protected socket: WebSocket | null = null
	private readonly socketListeners: TrackedListener[] = []

	get isOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN
	}
	get isClosed(): boolean {
		return this.socket === null || this.socket?.readyState === WebSocket.CLOSED
	}
	get isClosing(): boolean {
		return this.socket === null || this.socket?.readyState === WebSocket.CLOSING
	}
	get isConnecting(): boolean {
		return this.socket?.readyState === WebSocket.CONNECTING
	}

	connect() {
		if (this.socket) {
			return
		}

		this.socket = new WebSocket(this.url, {
			origin: DEFAULT_ORIGIN,
			headers: this.config.options?.headers as {},
			handshakeTimeout: this.config.connectTimeoutMs,
			timeout: this.config.connectTimeoutMs,
			agent: this.config.agent
		})

		this.socket.setMaxListeners(0)

		const onOpen = () => {
			const keepAliveMs = this.config.tcpKeepAliveMs
			if (!keepAliveMs) return

			// ws keeps the raw net.Socket private; guard for Bun/alternate ws transports.
			const raw = (
				this.socket as unknown as {
					_socket?: { setKeepAlive?: (enable?: boolean, initialDelay?: number) => unknown }
				}
			)._socket
			raw?.setKeepAlive?.(true, keepAliveMs)
		}

		this.track('open', onOpen)

		const events = ['close', 'error', 'upgrade', 'message', 'open', 'ping', 'pong', 'unexpected-response']

		for (const event of events) {
			this.track(event, (...args: any[]) => this.emit(event, ...args))
		}
	}

	private track(event: string, handler: (...args: any[]) => void) {
		this.socket?.on(event, handler)
		this.socketListeners.push({ event, handler })
	}

	async close() {
		const socket = this.socket
		if (!socket) {
			return
		}

		const closePromise = new Promise<void>(resolve => {
			let settled = false
			const finish = () => {
				if (settled) return
				settled = true
				clearTimeout(timeout)
				resolve()
			}

			const timeout = setTimeout(() => {
				try {
					socket.terminate()
				} catch {}

				finish()
			}, 5_000)
			socket.once('close', finish)
		})

		socket.close()

		await closePromise

		for (const { event, handler } of this.socketListeners) {
			socket.off(event, handler)
		}

		this.socketListeners.length = 0

		this.socket = null
	}

	send(str: string | Uint8Array, cb?: (err?: Error) => void): boolean {
		this.socket?.send(str, cb)

		return Boolean(this.socket)
	}
}
