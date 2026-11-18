import { makeWasmSignalRepositoryFactory } from '../../index'

describe('WASM public API', () => {
	it('exports the repository factory from the package entrypoint', () => {
		expect(typeof makeWasmSignalRepositoryFactory).toBe('function')
	})
})
