const [major, minor, patch] = process.versions.node.split('.').map(Number)

// Node 20 is EOL and missed the October 2026 security releases (26.12.1,
// 24.22.1, 22.23.4). Require a patched line instead of an open door.
const outdated =
	major < 22 || (major === 22 && (minor < 23 || (minor === 23 && patch < 4)))

if (outdated) {
	console.error(
		`\n❌ This package requires Node.js 22.23.4+, 24.22.1+ or 26.13.0+ to run safely.\n` +
			`   You are using Node.js ${process.versions.node}.\n` +
			`   Please upgrade to a patched LTS release.\n`
	)
	process.exit(1)
}
