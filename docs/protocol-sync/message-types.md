# Tipos de mensaje nuevos de WhatsApp

Estado en el fork tras sincronizar el proto a `2.3000.1052769028`. La columna
"Soporte" describe lo que hace la librería hoy, no lo que hace la app oficial.

| Tipo | Naturaleza | Soporte en el fork | Notas |
|---|---|---|---|
| `spoilerMessage` | Envoltorio `FutureProofMessage` | Decodifica, desempaqueta y expone el contenido interno | El texto con spoilers usa marcado en el contenido; no hay envío propio |
| `conditionalRevealMessage` | Cifrado (`encPayload`, `encIv`, `revealKeyId`) | Solo decodifica | Mensajes programados que se revelan con una clave; no se descifra |
| `eventInviteMessage` | Invitación a evento | Solo decodifica | Campos de evento, hora, portada y enlace de llamada |
| `musicMessage` | Música con letras | Solo decodifica | Requiere `EmbeddedMusic`; no hay envío |
| `pollCreationMessageV6` | Encuesta | Decodifica y agrega votos | El envío sigue usando V1/V2/V3 |
| `pollAddOptionMessage` | Agregar opción a encuesta | Solo decodifica | Vinculada a la clave de la encuesta original |
| `requestLocationMessage` | Pedido de ubicación | Solo decodifica | |
| `requestLocationUpdateMessage` | Actualización de pedido de ubicación | Solo decodifica | |
| `audioStickerMessage` | Envoltorio `FutureProofMessage` | Decodifica y desempaqueta | |
| `instantImageMessage` | Imagen | Decodifica y se expone como `imageMessage` | Compatible con `downloadMediaMessage` |
| `newsletterScheduledMessage` | Envoltorio `FutureProofMessage` | Decodifica y desempaqueta | Publicación programada de canal |
| `newsletterAdminProfileMessage` | Perfil de administrador de canal | Solo decodifica | |
| `newsletterAdminProfileStatusMessage` | Estado de perfil de administrador | Solo decodifica | |
| `paymentReminderMessage` | Recordatorio de pago | Solo decodifica | |
| `splitPaymentMessage` | Pago dividido | Solo decodifica | |
| `splitPaymentUpdateMessage` | Actualización de pago dividido | Solo decodifica | |
| `acp2SettingMessage` | Envoltorio `FutureProofMessage` | Decodifica y desempaqueta | Ajuste de privacidad de chat |
| `botGroupParticipantMessage` | Bot en grupo | Solo decodifica | |
| `botPlatformRegistrationSuccessMessage` | Registro de bot | Solo decodifica | |
| `groupRootKeyShare` | Material criptográfico de grupo | Solo decodifica | No enviar sin analizar el flujo de claves |
| `rootSecretDistributeMessage` | Distribución de secreto raíz | Solo decodifica | Cripto-sensible; no enviar |
| `statusLinkPreviewMetadata` | Metadatos de vista previa de estado | Solo decodifica | No lleva el sufijo `Message`; `getContentType` lo reconoce igual |

## Reglas

- Los envoltorios `FutureProofMessage` se desempaquetan en `normalizeMessageContent`
  para que el contenido real quede en `message.message`.
- Los tipos que no son `FutureProofMessage` se exponen tal cual; el consumidor
  debe leer el campo por nombre.
- `getContentType` reconoce los campos nuevos, incluidos los que no terminan en
  `Message` (`groupRootKeyShare`, `statusLinkPreviewMetadata`).
- No se implementa envío para tipos cuyo flujo no está verificado contra
  WhatsApp. Inventar el payload rompe el protocolo; primero se documenta y se
  agrega cuando haya una captura real o una prueba E2E concluyente.
