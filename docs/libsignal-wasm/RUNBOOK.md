# Runbook WASM

## Tests

```bash
npm test
npm run lint
npm run build
```

La suite WASM usa el bridge vendorizado en `vendor/whatsapp-rust-bridge` y
verifica sus hashes antes de ejecutar.

## Seleccionar backend

El factory publico se importa desde el paquete:

```ts
import { makeWasmSignalRepositoryFactory } from '@synapse-ve/baileys'

makeWASocket({
  auth: state,
  makeSignalRepository: makeWasmSignalRepositoryFactory(bridge)
})
```

El backend legacy sigue siendo el default. WASM solo se usa cuando se pasa
`makeSignalRepository`; no hay cambio de comportamiento para quien no lo pase.

## Benchmark

```bash
npm run bench:wasm
```

Mide 5,000 roundtrips 1:1 y escribe el resultado JSON por stdout.

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

Runner reproducible del repo (VPS):

```bash
systemctl status baileys-wasm-soak
journalctl -u baileys-wasm-soak -n 40 --no-pager -o cat
```

Panel de control en el puerto 8080 del VPS; el token se guarda fuera del repo.

Runner:

```bash
npm run soak:wasm -- --auth .tools/auth-wasm --minutes 120
npm run soak:wasm -- --auth .tools/auth-wasm --minutes 1440
```

Reconecta solo, registra mensajes de grupo y no envia mensajes.

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

## VPS updates

`needrestart` esta configurado en modo solo-listar para no reiniciar
`baileys-wasm-soak` ni `baileys-panel` durante upgrades de librerias.
