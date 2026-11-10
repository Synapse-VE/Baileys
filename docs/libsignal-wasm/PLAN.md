# Migracion del backend Signal a Rust/WASM

Rama de largo recorrido: `feat/libsignal-wasm`.

Regla principal: **no se mergea a `master`**. Al terminar cada fase se deja el
PR abierto para revision. Bot-2.0 y C-A-B no se tocan desde esta rama.

## Decision

Se reemplaza `libsignal-node` (JavaScript) por un adaptador sobre un core
Rust/WASM. No se reescribe Baileys: se mantiene `makeWASocket`, la API publica,
los eventos y el backend legacy como fallback.

Referencias fijadas para el spike:

| Pieza | Referencia |
|---|---|
| PR upstream de referencia | `WhiskeySockets/Baileys#2067` |
| Head del PR | `3a788d3d6dae1016e925ce95c2650f19c1208ebb` |
| Base del PR | `fe0fcabfe92c3a30e934a520cc1eeeec4cb2a3b3` |
| Core `whatsapp-rust` | `9649af098260cf53b6b1d7c2434b1a21cd6378b3` |
| Bridge prebuilt probado | `whatsapp-rust-bridge@0.6.0-alpha.44` |

El PR upstream es un monorepo (`packages/baileys` + `packages/whatsapp-rust-bridge`).
Nuestro fork es un paquete unico. Se extraen las piezas necesarias; no se
mergea el monorepo completo.

El bridge prebuilt cargo y expuso 44 exports en Node 26. La compilacion desde
fuente queda para la fase de build reproducible.

## Arquitectura objetivo

```text
makeWASocket
    |
    v
SignalRepository
    |
    +--> backend legacy: libsignal-node
    |
    +--> backend wasm: adapter
             |
             v
        core Rust/WASM
             |
             v
        snapshot/changeset
             |
             v
        auth state atomico
```

Reglas:

- `signalBackend: 'legacy' | 'wasm'` selecciona el motor.
- La API publica no cambia.
- El estado de sesion se persiste antes de devolver ciphertext.
- Las operaciones de sesion e identidad comparten el lock PN/LID resuelto.
- El estado legacy se puede leer; la migracion no debe pedir QR.
- El backend legacy queda disponible para rollback.
- El core se fija por commit; el `.wasm` se construye de forma reproducible.
- No se mezcla con actualizaciones de proto ni de version de WhatsApp Web.

## Fases y puertas

Cada fase tiene una puerta de salida. Si la puerta no pasa, no se avanza.

### Fase 0 - Base tecnica

- Revisar PR #2067 completo.
- Fijar commit del core y version del bridge.
- Verificar licencia y cadena de suministro.
- Cargar el WASM prebuilt en Node.
- Documentar arquitectura, fases y criterios.
- Correr baseline de tests actuales.

Puerta:

```text
WASM carga
baseline verde
arquitectura documentada
```

No requiere QR.

### Fase 1 - PoC 1:1

- Crear auth dir de prueba separado.
- Generar QR y vincular el telefono de prueba.
- Cifrar/descifrar un mensaje 1:1.
- Probar snapshot/changeset.
- Reiniciar y continuar la sesion.
- Comparar con legacy.

Puerta:

```text
1:1 ida y vuelta
persistencia tras reinicio
sin tocar auth de produccion
```

### Fase 2 - Sesiones 1:1 completas

- Prekeys, identidad y sesiones.
- LID/PN y multi-dispositivo.
- Migracion de auth state legacy.
- Rollback a legacy.

Puerta:

```text
sesion legacy migra sin QR
rollback sin perdida
mensajes 1:1 reales
```

### Fase 3 - Prekeys e identidad

- One-time prekeys.
- Signed prekeys.
- Cambios de identidad.
- Prekey agotada y reposicion.
- Dispositivo nuevo.

Puerta:

```text
prekeys estables
sin re-link por perdida de sesion
```

### Fase 4 - Grupos

- SKDM y sender keys.
- Sender-key-memory.
- Retry receipts de grupo.
- Dispositivo que falla cifrado.
- Miembro nuevo o retirado.
- Base para #2884.

Puerta:

```text
grupo de 3 dispositivos
fallo parcial recuperado
sin "Waiting for this message"
```

### Fase 5 - Integracion completa

- `SignalRepository`.
- `messages-send`.
- `messages-recv`.
- Retry.
- `auth-utils`.
- `libsignal.ts`.
- Backend dual y flag.

Puerta:

```text
suite completa con legacy y wasm
build, lint y proto verdes
```

### Fase 6 - Pruebas vivas

- Telefono de prueba separado.
- Bot `584248899924` solo como receptor.
- Texto, media, edicion, reaccion, recibo y retry.
- 1:1 y grupo.
- LID y PN.

Puerta:

```text
flujo vivo completo
sin usar auth real del bot
```

### Fase 7 - Rendimiento y soak

- Event loop delay.
- CPU y memoria.
- Latencia y throughput.
- 24 a 72 horas de soak.
- Reconexiones y sesiones corruptas.

Puerta:

```text
sin bloqueos largos
sin reconexiones en cascada
sin perdida de sesion
```

### Fase 8 - Migracion y rollback

- Copiar auth de prueba.
- Abrir con wasm.
- Verificar que no pide QR.
- Volver a legacy.
- Volver a wasm.
- Confirmar que no se pierde estado.

Puerta:

```text
migracion y rollback sin re-link
```

### Fase 9 - Release experimental

Solo con autorizacion explicita:

```text
version: 7.0.0-rc14.wasm.1
dist-tag: wasm
```

No se usa `next` ni `latest` hasta validacion. El PR sigue abierto; no se
mergea automaticamente.

## Pruebas

Matriz minima:

```text
1:1 entrante
1:1 saliente
grupo entrante
grupo saliente
LID
PN
multi-dispositivo
offline
reconexion
reinicio
retry
media
edicion
reaccion
```

Cada bug de produccion debe dejar un test de regresion que falle antes del fix.
La suite existente debe seguir verde con ambos backends.

## Aislamiento

- Auth dir de prueba: `.tools/auth-wasm` (ignorado por git).
- Nunca copiar el auth de produccion.
- Nunca usar el QR del telefono oficial del bot.
- El telefono de prueba es aparte.
- El bot oficial solo recibe mensajes de prueba; no se cambia su dependencia.
- El core se fija por commit y el `.wasm` se verifica por hash.

## Despues del core

Con WASM estable, seguir con:

- #2884: phash y recuperacion de sender keys.
- API publica para pedir redistribucion de sender keys.
- Prekey low-water.
- Observabilidad y metricas de sesiones.
- Rendimiento y reconexion.

## Evidencia Fase 1 inicial

El bridge se construyo desde el codigo del PR, no solo desde el paquete
prebuilt:

```text
wasm-pack build --target web --no-pack --no-opt
duracion: 4m 37s
wasm: 1.1 MB
exports: 46
```

PoC de snapshot 1:1:

```text
mensaje: hola desde wasm
respuesta: respuesta wasm
messageType: 3
ciphertext: 146 bytes
removedPreKeyId: 1
session: 379 bytes
```

Esto valida cifrado, descifrado de prekey, respuesta y persistencia por
changeset. Tambien existe un store 1:1 minimo sobre el bridge, con prueba de
reinicio, y una fachada `SignalRepository` minima para 1:1 por JID. Todavia no
valida el socket real ni el QR.

El bridge construido quedo vendorizado en `vendor/whatsapp-rust-bridge` con su
procedencia y una prueba real en `src/__tests__/Signal/wasm-snapshot.test.ts`.
Esa prueba corre en CI sin compilar Rust.

## Estado

```text
Fase actual: 3/4 (1:1 y grupo basico validados; multi-device y retries pendientes)
Bridge:      construido desde fuente
QR:          pendiente
Merge:       prohibido
Produccion:  intacta
```

## Baseline de Fase 0 (2026-11-09)

```text
Suites:    75/75
Tests:     640/640
Proto:     9/9
Lint:      0 errores
Build:     OK
```

Bridge prebuilt:

```text
whatsapp-rust-bridge@0.6.0-alpha.44
2.2 MB
44 exports cargados en Node 26
initWasmEngine requiere logger/crypto
```

Toolchain local (instalada en `.tools/`, fuera de git):

```text
rustc 1.99.1
cargo 1.99.1
wasm32-unknown-unknown: instalado
wasm-pack 0.15.1: via npx
```

Setup reproducible: `scripts/setup-wasm-toolchain.sh` (instala rustup, target y wasm-pack en `.tools/`).

Smoke de compilacion:

```text
crate Rust -> .wasm de 325 bytes
WebAssembly.Module carga en Node
export: add, memory
```

Decision de Fase 0: usar el bridge prebuilt para el PoC 1:1 y construir el
bridge desde fuente en la fase de build reproducible. No se agrega el bridge
como dependencia de produccion hasta que el adaptador y las pruebas de
compatibilidad esten listos.
