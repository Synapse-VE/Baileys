# Brecha frente a la auditoría de `develop` (v8)

Upstream mantiene en `develop` una serie de auditoría de concurrencia
(Stages 0–10, PRs #2570–#2588) y un monorepo pnpm con Rust bridge. Nuestra
línea es v7 (`master`/rc14), así que nada de eso se puede cherry-pickear
directo. Este documento registra qué está cubierto, qué se porteó y qué queda.

## Portado en la línea v7

- **H9 — contador de retry**: los caminos entrante y de reenvío hacían
  get→+1→set sin lock por mensaje. Ahora usan `makeKeyedMutex` y
  `incrementRetryCount`/`incrementSendAgainCount` con tests de concurrencia.
- **M6 — flush del event-buffer**: el puntero de datos se cambiaba después de
  emitir, así que un listener re-entrante escribía en el buffer descartado.
  Ahora se cambia antes; test de re-entrada que falla con el orden viejo.
- **#2751 — firma y dominios**: `Curve.verify` honra el resultado de
  `verifySignature` y `domainType` se deriva por dispositivo.
- **H7 parcial**: `useMultiFileAuthState` ya usa tmp + rename atómico.

## No portado (y por qué)

- **H0/H2/H4/H10 — transacciones y locks**: requieren el `transactWith` y el
  `LockManager` del rewrite; portarlo a v7 es un cambio estructural grande.
- **H1/H3/H8/M11 — carreras de sesión/identidad**: dependen de H0 y del
  `transactWith`; no se tocan sin ese sustrato.
- **H6 — cache write-through**: invierte el orden cache/store; conviene
  hacerlo junto con el rewrite de auth para no romper stores existentes.
- **M7/M8/M9**: LTHash, idempotencia de processMessage y timeouts de query
  cambian contratos observables; necesitan análisis separado.
- **M10 — Noise**: el IV compartido es seguro mientras encrypt/decrypt sean
  síncronos, pero falta serializar `decodeFrame`; queda como hardening.
- **M2 — contador de prekeys**: sigue avanzando antes de la confirmación del
  upload. El reoffer de #57 evita el crecimiento en cuentas grandes, pero un
  upload fallido aún puede dejar IDs avanzados.
- **Stage 10 — tc-token index transactWith**: ya sacamos la emisión fuera de
  la transacción de relay (#50); falta la escritura atómica del índice.
- **Media host por socket**: seguimos usando el host por defecto en descargas;
  portarlo requiere tocar todos los call sites de media.

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
