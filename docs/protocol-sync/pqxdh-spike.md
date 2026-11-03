# Spike PQXDH / Kyber

## Evidencia (2026-11-03)

`feature-watch` sobre el bundle vivo de WhatsApp Web:

- `kyberPreKeyId`: 22 referencias → PQXDH activo en el cliente oficial.
- `pqMode`: 1, `simulateXxkemFs`: 2, `extendedEphemeral`: 1 → handshake
  post-cuántico de Noise definido pero dormido.
- `lightE2Ee`: 1 → atestación AEA apenas referenciada.

`libsignal@6.0.0` (npm, última) no implementa Kyber. Nuestro dispositivo no
publica kyber prekeys, así que los pares negocian X25519 clásico y por eso hoy
funciona. El riesgo aparece si WhatsApp exige PQXDH para sesiones nuevas.

## Opciones evaluadas

1. **`@signalapp/libsignal-client@0.106.1`** (bindings oficiales de Signal,
   publicados y activos). Es la vía más realista, pero exige verificar que
   exponga Kyber/PQXDH y reemplazar la capa de sesiones, prekeys, storage y
   direcciones. Impacto alto, no es un cambio de una semana.
2. **Ambiente JS** (`mlkem@2.7.0`, `@noble/post-quantum@0.7.1`) dentro del flujo
   actual de libsignal. Reimplementar PQXDH a mano es riesgo criptográfico;
   no se recomienda sin auditoría.
3. **Esperar `#2067` (libsignal wasm)**. Lleva 351 días abierto y el upstream
   está congelado; no es un plan.
4. **No hacer nada y monitorear**. Es el estado actual.

## Plan de spike (timebox 2 días)

- Rama aislada, sin publicar.
- Verificar con `@signalapp/libsignal-client`:
  - ¿Expone `kyberPreKey`/`KyberPreKeyRecord` y PQXDH en el bundle de prekeys?
  - ¿Puede convivir con el storage actual (base64/Buffer) sin migración?
  - ¿Compila y corre en Linux x64 (Render) sin toolchain pesada?
- Fixture: crear sesión PQXDH contra un bundle con kyber prekey y cifrar/descifrar
  un mensaje de ida y vuelta.
- Criterio de aceptación: fixture verde + build multiplataforma documentado.
- Si falla, cerrar el spike y mantener el monitoreo de `feature-watch`.

## Riesgos

- Claves de sesión existentes no migran solas; un cambio de backend puede
  invalidar sesiones y forzar re-emparejamiento.
- Un bug criptográfico silencioso rompe descifrado sin error visible.
- Render/Linux x64 necesita binarios nativos o wasm; verificar tamaño y arranque.

## Recomendación

No migrar todavía. Mantener `feature-watch` (alerta si `pqMode` deja de estar
dormido) y hacer el spike con `@signalapp/libsignal-client` cuando haya ventana.
Si WhatsApp exige PQXDH, el spike pasa a P0.

## Otros frentes estratégicos

- **Passkey (#2672)**: el flujo "continuar en WhatsApp Web" con passkey tiene 92
  comentarios; el QR sigue funcionando (vinculamos el 3-nov). Monitorear, no hay
  API pública para emular passkeys.
- **msmsg (#2857)**: mensajería con bots nativos (Meta AI); no es necesario para
  el flujo de usuario habitual. Feature futura.
- **cstoken/NCT (#2438)**: token de privacidad 1:1; Baileys ya emite TC tokens.
  El PR upstream es enorme (7.7k/3.3k) y no está liberado. Vigilar errores 463.
