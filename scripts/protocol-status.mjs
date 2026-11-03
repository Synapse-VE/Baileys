import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const parseProtoVersion = source => source.match(/WhatsApp Version:\s*([\d.]+)/)?.[1]

export const parseSwVersion = source => {
	const match = source.match(/client_revision\\?":\s*(\d+)/)
	return match?.[1] ? `2.3000.${match[1]}` : undefined
}

const yesNo = value => (value ? 'sí' : 'no')

export const buildStatus = ({
	packageVersion,
	protoVersion,
	advertisedVersion,
	currentVersion,
	generatedAt
}) => {
	const protoInSync = !!protoVersion && protoVersion === advertisedVersion
	const versionInSync = !!currentVersion && currentVersion === advertisedVersion
	return `# Estado del protocolo

Generado: ${generatedAt}

| Dato | Valor |
|---|---|
| Paquete | \`@synapse-ve/baileys@${packageVersion}\` |
| Proto | \`${protoVersion ?? 'desconocido'}\` |
| Versión anunciada | \`${advertisedVersion ?? 'desconocida'}\` |
| WhatsApp Web hoy | \`${currentVersion ?? 'no disponible'}\` |
| Proto y versión coinciden | ${yesNo(protoInSync)} |
| Versión anunciada al día | ${yesNo(versionInSync)} |

Generado por \`scripts/protocol-status.mjs\`.
`
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const root = new URL('..', import.meta.url)
	const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
	const proto = await readFile(new URL('WAProto/WAProto.proto', root), 'utf8')
	const versionJson = JSON.parse(await readFile(new URL('src/Defaults/baileys-version.json', root), 'utf8'))

	let currentVersion
	try {
		const response = await fetch('https://web.whatsapp.com/sw.js', {
			headers: { 'user-agent': USER_AGENT, 'sec-fetch-site': 'none' }
		})
		if (response.ok) currentVersion = parseSwVersion(await response.text())
	} catch (error) {
		console.error(`could not fetch the current WhatsApp version: ${error.message}`)
	}

	const status = buildStatus({
		packageVersion: packageJson.version,
		protoVersion: parseProtoVersion(proto),
		advertisedVersion: versionJson.version.join('.'),
		currentVersion,
		generatedAt: new Date().toISOString()
	})

	await writeFile(new URL('docs/protocol-sync/status.md', root), status)
	console.log(status)
}
