# Plan de actualización y vigilancia del protocolo de WhatsApp

Documento de trabajo del fork `Synapse-VE/Baileys`. El objetivo es mantener la librería
alineada con el protocolo que habla WhatsApp Web hoy, y enterarnos de los cambios antes
de que rompan el flujo normal de un usuario.

## Estado de ejecución (2026-11-03)

| Fase | PR | Estado | Evidencia |
|---|---|---|---|
| 0 | #1 | mergeada | `.env*` ignorado, plan versionado, CI verde |
| 1 | #2 | mergeada | tests de regresión red/green, `proto-check` verde |
| 2 | #3 | mergeada | proto `2.3000.1052769028`, 604 mensajes, compat legacy, 409 tests |
| 3 | #4 | mergeada | versión `2.3000.1052769028`, E2E con `ACK 2` y `ACK 3` |
| 4 | #6 | mergeada | 22 tipos nuevos documentados; envoltorios, imagen instantánea y encuestas V6 |
| 5 | #7 | mergeada | política de reconexión, versión independiente, logs de libsignal |
| 6 | #8, #9 | #8 mergeada; #9 en revisión | paquete `@synapse-ve/baileys` en GitHub Packages + vigilancia diaria |

Pendientes: validar los workflows de vigilancia en producción y cubrir los tipos
nuevos que quedaron solo en decodificación.


## Estado medido (2026-11-03)

- `master` del fork idéntico a `WhiskeySockets/Baileys` (`81345beb`, 26-oct-2026).
- Paquete `7.0.0-rc14`, última release publicada en npm (tag 29-jul-2026).
- Versión de WhatsApp anunciada: `2.3000.1043857760` (bump 26-jul-2026), 100 días de atraso.
- WhatsApp Web real: `2.3000.1052747707` (se mueve cerca de 94k revisiones por día).
- Proto del repo: `2.3000.1029496320` (6-nov-2025), 362 días de atraso.
- Diff del proto actual: 489 a 604 mensajes (+118, -3), 150 a 184 enums, 22 content types
  nuevos, 12 campos eliminados y 1 campo renumerado (`pollResultSnapshotMessageV3`, 114 a 115).
- Workflow `update-proto`: 100 de 100 corridas fallidas en los últimos 100 días.

Causas reproducidas localmente:

1. `WAProto/GenerateStatics.sh` usa rutas relativas y `yarn gen:protobuf` lo ejecuta desde
   la raíz del repo, así que `./WAProto.proto` no existe.
2. `proto-extract` emite 25 campos `required` (proto2) y `pbjs` los rechaza en un archivo
   declarado como `proto3`.

Protocolo nuevo detectado en el bundle actual:

- Handshake post-cuántico definido pero inactivo (`pqMode`, `XXKEM`, `simulateXxkemFs`:
  una sola ocurrencia, la definición del protobuf).
- PQXDH/Kyber activo en el cliente de WhatsApp (22 referencias a `kyberPreKeyId`), sin
  soporte en `libsignal@6.0.0`.
- 22 tipos de mensaje nuevos (spoiler, eventos, música, pagos divididos, encuestas V6,
  canales programados, ubicación bajo demanda, stickers de audio, entre otros).
- `HistorySync` con `nctSalt`, `inlineContacts`, `reverseHistorySync`,
  `omittedConversationMetadata` y `favoriteStickers`.
- Eliminados los mensajes de migración LID; el wrapper sigue existiendo pero el payload no.

## Decisiones tomadas

- Todo el trabajo queda en el fork `Synapse-VE/Baileys`. No se envían PRs al repositorio
  oficial de WhiskeySockets.
- Rama + PR por fase. Nunca push directo a `master`.
- Un cambio por PR: pipeline, esquema, versión y features van separados.
- Regenerar el proto no cambia lo que el servidor nos manda; cambiar la versión anunciada
  sí. Por eso van en fases distintas.
- Todo bug corregido lleva test de regresión que falla antes del fix.
- El proto regenerado debe conservar la capacidad de decodificar mensajes históricos
  (capa de compatibilidad legacy).
- Distribución del fork: tags propios `v7.0.0-rc14.sync.N` cuando haya cambios publicables.

## Fases

### Fase 0: baseline y red de seguridad (0.5 día)

- `.gitignore` con `.env*` y excepción para `docs/protocol-sync/`.
- Plan y runbook versionados.
- Plantilla de PR con checklist de tests, E2E, rollback y secretos.
- CI del fork verificada en cada PR.

Aceptación: CI verde, `git status` limpio, ningún secreto trackeado.

### Fase 1: reparar el pipeline de protocolo (1-2 días)

- `GenerateStatics.sh`: `cd` al directorio del script, `set -eu`, fallo temprano.
- `proto-extract`: ignorar el flag `REQUIRED`, que no existe en proto3.
- Test de regresión del extractor (normalización de flags).
- Test de regresión de invocación: generar desde la raíz y desde `WAProto/`.
- Workflow `proto-check` en PRs que toquen proto o extractor.

Aceptación: generación determinista desde cualquier directorio; tests nuevos fallan
contra el código anterior y pasan con el fix.

### Fase 2: esquema al día (2-3 días)

- Regenerar `WAProto/WAProto.proto` con el pipeline arreglado.
- Post-proceso de compatibilidad legacy: re-agregar `LIDMigrationMappingSyncPayload` y
  `LIDMigrationMapping`, y el alias del campo 114 para `pollResultSnapshotMessageV3`.
- Regenerar `WAProto/index.js` e `index.d.ts`.
- Tests de roundtrip y de compatibilidad con bytes de fixture.
- E2E con la sesión vinculada: texto, media, recibos, presencia e history sync.
- Gate de CI: los estáticos generados deben coincidir con el `.proto`.

Aceptación: build, lint y tests verdes; E2E verde; mensajes viejos siguen decodificando.

### Fase 3: versión al día (1 día más soak)

- `yarn update:version` a la versión vigente; commit solo de los tres archivos de versión.
- E2E completo antes y después, comparación de logs de conexión.
- Soak corto y plan de rollback de un commit.

Aceptación: E2E verde, sin nuevos códigos de error, bot de producción estable.

### Fase 4: capacidades nuevas (5-8 días)

Prioridad según uso real en el bundle:

1. `spoilerMessage` y `conditionalRevealMessage`.
2. `pollCreationMessageV6`, `pollAddOptionMessage` y renumeración de resultados de encuesta.
3. `newsletterAdminProfileMessage` y `newsletterScheduledMessage`.
4. `audioStickerMessage`, `eventInviteMessage`, `musicMessage`, `groupRootKeyShare`.
5. Ubicación bajo demanda, imagen instantánea, pagos divididos, `acp2SettingMessage`.
6. `rootSecretDistributeMessage`: analizar como cripto-sensible antes de tocar.

Transversal: telemetría de tipos desconocidos, `mediaDomainInfo` para host de media,
`nctSalt` y `cstoken-fallback`, extras de history sync.

### Fase 5: resiliencia del bot (2-3 días)

- Helper de política de reconexión por `statusCode`: en 440 no reconectar, en 515
  reconectar ya, en 503 esperar con jitter, en 401/403 terminar.
- Instancia única o lock distribuido; `maxSurge: 0` para evitar solape de deploys.
- Métricas por código de cierre, uptime y tiempo de handshake.
- Soak de 72 horas.

### Fase 6: vigilancia (3-4 días, luego automático)

- `protocol-watch`: diario, detecta versión nueva, extrae proto, abre PR con el diff.
- `feature-watch`: cuenta ocurrencias de la watchlist (`pqMode`, `kyberPreKeyId`, tipos
  nuevos) y alerta cuando pasan de definición a uso real.
- `version-watch`: bump diario con auto-merge si solo cambian los tres archivos de versión.
- `e2e-live`: nocturno contra la sesión de pruebas.
- `PROTOCOL_STATUS.md` autogenerado con la edad del proto, la versión y el último diff.

## Operación

- Toolchain local: Node 26 sin corepack y `$HOME` read-only; Yarn 4 se ejecuta desde
  `.tools/yarn`, que fija `HOME` y `COREPACK_HOME` dentro del workspace.
- El token de GitHub se lee de `.env.local` en el momento y se pasa por variable de
  entorno; nunca se escribe en `.git/config` ni en archivos del repo.
- Sesión E2E: número de prueba vinculado en `.tools/auth-smoke`; el número del bot de
  producción es solo destino de mensajes de prueba cuando haga falta.

## Métricas de éxito

- Edad del proto y de la versión anunciada menor o igual a 2 días.
- E2E nocturno verde 7 de 7 días.
- Cero tipos de mensaje desconocidos entre los 10 más usados.
- Cero tormentas de 440 en producción.
- PR de cambio de protocolo revisado y mergeado en menos de 48 horas.

## Riesgos y mitigaciones

- El extractor se rompe con un bundle nuevo: fallback manual y issue el mismo día.
- Normalizar `required` cambia semántica: en proto3 todos los campos son opcionales al
  decodificar, así que es seguro.
- WhatsApp renumera campos: capa legacy y fixtures históricos.
- El bump de versión habilita flujos nuevos: fase separada, soak y rollback de un commit.
- PQXDH obligatorio: riesgo estructural; vigilar y preparar spike.
- Divergencia con upstream: rebase semanal y commits de vigilancia separados.

## Estado F7-F11 (2026-11-03)

| Fase | Estado | PRs / notas |
|---|---|---|
| 7 | Casi completa | #16 consolidación watchers, #17 status ACK/auth atómica/cierre/view-once, #18 ALS+offline, #19 retry 1:1. Pendiente: prekeys #2797, cache retry #2802 y watchdog de sesiones sordas #2491 |
| 8 | Parcial | #26 history on-demand. Pendiente: media 403/404 (#2834/#2835), PN→LID (#2711), TC tokens (#2873) |
| 9 | Parcial | #27 communities + retry receipts. Pendiente: edits cifrados (#2743), recibos (#2804/#2879), polls (#2870), presencia (#2789), pairing (#2872) |
| 10 | Completa según alcance | #21: runtime audit limpio, ws/protobufjs/music-metadata/link-preview, Node 22/24/26, Dependabot, smoke del paquete. E2E/alertas/backups quedaron fuera por decisión |
| 11 | Documentada | `pqxdh-spike.md`: opciones, plan y riesgos; passkey/msmsg/cstoken evaluados |

Deuda conocida: `protobufjs-cli@1.2.0` (build-time, esquema confiable) y
advisories de herramientas de desarrollo; la auditoría de producción está limpia.
