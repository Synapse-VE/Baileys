import { pathToFileURL } from 'node:url'

export const WATCHLIST = [
	'pqMode',
	'simulateXxkemFs',
	'extendedEphemeral',
	'XXKEM',
	'HANDSHAKE_PQ_MODE',
	'kyberPreKeyId',
	'lightE2Ee'
]

const USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const countFeatures = source =>
	Object.fromEntries(WATCHLIST.map(feature => [feature, source.split(feature).length - 1]))

// While the handshake only defines these fields they appear once or twice in the
// bundle (the protobuf spec). A bigger count means the client started using them.
export const isPqActivated = counts =>
	(counts.pqMode ?? 0) > 2 || (counts.simulateXxkemFs ?? 0) > 2 || (counts.extendedEphemeral ?? 0) > 2

export const fetchBundle = async () => {
	const headers = { 'user-agent': USER_AGENT, 'sec-fetch-site': 'none' }
	const swResponse = await fetch('https://web.whatsapp.com/sw.js', { headers })
	if (!swResponse.ok) throw new Error(`sw.js responded ${swResponse.status}`)
	const sw = await swResponse.text()

	const match = sw.replaceAll('/*BTDS*/', '').match(/importScripts\(["']([^"']+)["']\)/)
	if (!match?.[1]) throw new Error('could not find the bundle URL in sw.js')

	const url = new URL(match[1].replaceAll('\\', '')).href
	const bundleResponse = await fetch(url, { headers })
	if (!bundleResponse.ok) throw new Error(`bundle responded ${bundleResponse.status}`)
	return { url, source: await bundleResponse.text() }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const { url, source } = await fetchBundle()
	const counts = countFeatures(source)
	console.log(`bundle: ${url}`)
	console.log(JSON.stringify(counts, null, 2))

	if (isPqActivated(counts)) {
		console.error('post-quantum handshake fields are being used by the web client')
		process.exit(1)
	}
}
