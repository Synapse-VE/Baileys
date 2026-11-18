import type { LIDMapping, SignalAuthState } from '../../Types'
import type { ILogger } from '../../Utils/logger'
import { LIDMappingStore } from '../lid-mapping'
import { makeWasmSignalRepository, type WasmRepositoryDeps, type WasmSignalRepository } from './repository'

export type { WasmRepositoryDiagnostics, WasmSignalRepository } from './repository'

/** Bridge surface needed by the factory, including the address constructor. */
export type WasmBackendBridge = WasmRepositoryDeps['bridge'] & {
	ProtocolAddress: new (user: string, device: number) => { toString(): string }
}

/**
 * Returns the exact factory shape accepted by `SocketConfig.makeSignalRepository`.
 * The legacy factory remains the default; callers opt in to WASM explicitly.
 */
export const makeWasmSignalRepositoryFactory = (bridge: WasmBackendBridge) => {
	return (
		auth: SignalAuthState,
		logger: ILogger,
		pnToLIDFunc?: (jids: string[]) => Promise<LIDMapping[] | undefined>
	): WasmSignalRepository => {
		const lidMapping = new LIDMappingStore(auth.keys as never, logger, pnToLIDFunc)
		return makeWasmSignalRepository({
			bridge,
			auth,
			address: (user, device) => new bridge.ProtocolAddress(user, device),
			lidMapping
		})
	}
}
