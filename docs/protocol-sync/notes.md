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

- `fetchLatestBaileysVersion()` consulta `web.whatsapp.com/sw.js` directamente
  y compara contra la versión local; ya no depende de ningún repositorio.
- `libsignal@6.0.0` volcaba sesiones completas (claves incluidas) por
  `console.info`/`console.warn`. `scripts/patch-libsignal.cjs` corre en
  `postinstall` y las deja detrás de `LIBSIGNAL_DEBUG`. El test
  `libsignal-logging.test.ts` falla si el parche deja de aplicarse.
- `getDisconnectAction` y `getReconnectDelay` centralizan la política de
  reconexión: 440/401/403/411/500 no reconectan, 503 espera y el resto usa
  backoff exponencial con jitter.
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
