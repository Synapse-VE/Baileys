# Runbook WASM

## Tests

```bash
npm test
npm run lint
npm run build
```

La suite WASM usa el bridge vendorizado en `vendor/whatsapp-rust-bridge` y
verifica sus hashes antes de ejecutar.

## Auth de prueba

El auth de prueba vive en `.tools/auth-wasm` y no se commitea. No usar el auth
del bot de produccion.

## Socket de prueba

El harness local vive en `.tools/wasm-socket.mjs`:

```bash
node .tools/wasm-socket.mjs
```

El QR se escribe en `.tools/wasm-qr.png`. Solo se escanea con el telefono de
prueba, nunca con el telefono oficial del bot.

## Grupo de prueba

```bash
node .tools/wasm-group.mjs
```

Crea un grupo con el bot como participante y envia un mensaje de prueba.
Requiere que el auth de prueba ya este vinculado.

## Soak

```bash
node .tools/wasm-soak.mjs     # 30 minutos
node .tools/wasm-soak-2h.mjs  # 2 horas
```

Logs:

```text
/tmp/wasm-soak.log
/tmp/wasm-soak-2h.log
```

## Rollback

El backend legacy sigue siendo el default. Para volver atras:

```ts
makeWASocket({
  // sin makeSignalRepository: usa makeLibSignalRepository
})
```

Las sesiones escritas por WASM se proyectan al formato legacy y el motor
antiguo puede leerlas. La prueba de rollback esta en
`src/__tests__/Signal/wasm-repository.test.ts`.

## Reglas

- No mergear el PR sin autorizacion explicita.
- No actualizar Bot-2.0 desde esta rama.
- No usar credenciales de produccion.
- No publicar el paquete con backend WASM como default todavia.
