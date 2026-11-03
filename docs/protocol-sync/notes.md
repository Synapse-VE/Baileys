# Notas operativas

## Refrescar el proto

1. Instalar dependencias del extractor: `cd proto-extract && npm ci` (o `yarn install`).
2. Extraer: `node proto-extract/index.js` (escribe `WAProto/WAProto.proto`).
3. Aplicar compatibilidad legacy: `node scripts/proto-compat.mjs`.
4. Regenerar estáticos desde la raíz: `yarn gen:protobuf`.
5. Verificar: `yarn test:proto`, `yarn build`, `yarn lint`, `yarn test`.
6. Revisar el header `/// WhatsApp Version` y el `git diff --stat`.

El paso 3 es obligatorio: el extractor ya no emite `LIDMigrationMapping` ni
`LIDMigrationMappingSyncPayload`, que Baileys todavía decodifica desde history
sync, y WhatsApp renumeró `pollResultSnapshotMessageV3` de 114 a 115.

## Gate de CI

`proto-check` corre en PRs que tocan `WAProto/`, `proto-extract/` o `scripts/`:

- Tests de regresión del extractor y del generador.
- Generación de estáticos desde la raíz.
- Rechazo de campos `required` (inválidos en proto3).
- Falla si los estáticos commiteados no coinciden con el `.proto`.

Si falla el último punto, regenerar y commitear el resultado.

## E2E

- La sesión de prueba vive en `.tools/auth-smoke`, fuera de git.
- `.tools/e2e.mjs` conecta, envía un mensaje al número del bot y espera acks.
- Un solo proceso por sesión: dos conexiones con las mismas credenciales
  producen `440 conflict / replaced`.
- `.tools/soak.mjs` mantiene la conexión abierta sin enviar nada.

## Advertencias

- `fetchLatestBaileysVersion()` lee el `master` de `WhiskeySockets/Baileys`, no
  WhatsApp ni este fork. Si un bot la llama, sobrescribe la versión del fork con
  la de upstream, que puede ser vieja. Usar `fetchLatestWaWebVersion()` o fijar
  la versión.
- `libsignal@6.0.0` ejecuta `console.info('Closing session:', session)` y
  `console.warn('Session already closed', session)`, lo que vuelca material de
  claves (`rootKey`, `chainKey`, claves efímeras) a stdout. En producción eso
  termina en los logs del hosting. Mitigación: filtrar esos `console` en el bot
  o parchear la dependencia.
- El workflow `PR Comment` está deshabilitado en el fork porque depende del
  secret `PERSONAL_TOKEN`.
- El workflow `E2E Tests` corre en push a `master` y falla en el fork por el
  servicio bartender; no bloquea PRs.
- Todo el trabajo queda en el fork. No se abren PRs en WhiskeySockets.

## Seguridad

- El token de GitHub se lee de `.env.local` (ignorado por git) y se pasa por
  variable de entorno en cada operación.
- `.tools/` contiene toolchain, sesiones y scripts locales; no se versiona.
- La sesión de prueba puede desvincularse desde WhatsApp en cualquier momento;
  volver a vincularla requiere un QR nuevo.
