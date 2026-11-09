# Fallback version test

`fetchLatestBaileysVersion` falls back to the version bundled in
`src/Defaults/baileys-version.json` when WhatsApp Web cannot be queried.

The regression test reads that JSON file at runtime instead of hardcoding a
revision. `Protocol Watch` updates the bundled version and the generated
`Defaults` constants together; the test therefore follows the bump and does
not fail with a stale expected number.

This keeps a failed scheduled refresh meaningful: a red run now means the
schema, build or tests failed, not that the test expected yesterday's version.
