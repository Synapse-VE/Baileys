# Brecha frente a la auditoría de `develop` (v8)

Upstream mantiene en `develop` una serie de auditoría de concurrencia
(Stages 0–10, PRs #2570–#2588) y un monorepo pnpm con Rust bridge. Nuestra
línea es v7 (`master`/rc14), así que nada de eso se puede cherry-pickear
directo. Este documento registra qué está cubierto, qué se porteó y qué queda.

## Portado en la línea v7 (2026-11-04)

La brecha de auditoría quedó cerrada en las rondas 4–11 y publicada en
`sync.18`–`sync.22`:

- **M2 — contador de prekeys**: `getNextPreKeysNode` separa `nextPreKeyId`
  (alloc, antes del upload) de `firstUnuploadedPreKeyId` (commit, solo tras la
  confirmación). El batch se genera una vez y se reusa en los retries.
- **M10 — Noise**: IV AES-GCM fresco por llamada y `decodeFrame` serializado
  con mutex (incluido el drain de `finishInit`).
- **M9 — query timeout**: `waitForMessage` lanza Boom 408 tipado, rechaza tags
  duplicados con 409 y descarta respuestas duplicadas con warning.
- **M7 — LTHash**: `decodePatches` lanza `LTHashMismatchError` en vez de
  cortar con estado parcial; el caller ya fuerza snapshot retry.
- **M8 — idempotencia**: `processMessage` deduplica `(msgId, sender)` con
  cache de 10 min, check-and-set atómico y rollback en error.
- **H0/H2/H4/H10 — transacciones**: `LockManager`, `transactWith(scope)`,
  locks por registro, commit retry y aislamiento por store. La API legacy
  `transaction(work, key)` sigue disponible y ya no reutiliza el contexto
  externo para otra key.
- **H1/H3/H8/M11 — sesiones/identidad**: encrypt/decrypt/storeSession/
  saveIdentity usan `transactWith` sobre el wire address resuelto y pinned;
  `saveIdentity` commitea session + identity-key juntos; sender-key por
  registro; se quitó la transacción legacy externa de `relayMessage`.
- **H6 — cache write-through**: `makeCacheableSignalKeyStore` escribe al store
  primero y actualiza cache después, con locks por registro.
- **H7 parcial**: `useMultiFileAuthState` ya usa tmp + rename atómico.
- **tc-token index**: `commitTcTokenWithIndex` hace read-merge-write bajo
  `transactWith`; send y recv lo usan.
- **Media host por socket**: `selectMediaHost`, `getMediaHost` y
  `getMediaUrl`; el host se actualiza en el socket base y se pasa a media
  retry, history sync y descargas de app-state.
- **H9/M6/#2751** siguen cubiertos desde las rondas previas.

## Restante (no bloquea v7)

- **H7 completo / SQLite auth store**: el store multi-file endurecido y el
  store SQLite de `develop` no se portaron; el bot usa su propio store y el
  paquete mantiene multi-file compatible.
- **Monorepo pnpm + Rust bridge**: línea v8, no se adopta en v7.
- **PQXDH/Kyber**: libsignal 6 no lo soporta; sigue fuera de alcance.

## Estado de la suite

- 611 tests (610 pass, 1 todo) al cierre de `sync.22`.
- Build, lint, proto-check y publish/smoke verdes en CI.
- Soak/E2E con teléfono: smoke de publish ejecutado; el soak largo sigue
  siendo una corrida manual, no un gate de CI.

## Forks evaluados

- **juniorsereno/Baileys**: backport de #2751; es el hallazgo crítico y ya
  está aplicado con sus tests.
- **prabathLK/Baileys-Latest**: auto-resend tras recuperar token. El parche
  bloquea el envío con un IQ síncrono y trae un brace roto; no se porta.
- **Vkazee/Baileys**: album ya está soportado; groupStatusMessageV2 e
  interactive biz node quedan como features opcionales.
- **TobyG74/Baileys**: split de WAProto por namespace; incompatible con
  nuestro pipeline de generación estática, no se porta.
- **zapitu/libzapitu, iamrony777, KING-DAVIDX**: bases viejas o features de
  infraestructura; no aportan al hardening de v7.

## Regla

No se porta un Stage sin sus tests y sin verificar que no rompa la línea v7.
La brecha es de arquitectura (v8), no de parches sueltos.
