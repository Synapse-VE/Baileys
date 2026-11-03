# Seguridad de dependencias y runtime

## Node.js

La línea 20 está EOL y no recibió el security release del 21-oct-2026. Los
parches de octubre salieron en 22.23.4, 24.22.1 y 26.12.1+ (26.13.0 es la
última LTS). CVEs cubiertos en esa tanda: CVE-2026-105482, CVE-2026-105483,
CVE-2026-106069, CVE-2026-111497 (Brotli RCE), CVE-2026-105481,
CVE-2026-106072, CVE-2026-106074, CVE-2026-106070, CVE-2026-106071 y
CVE-2026-106073.

Política del fork:

- `engines.node: >=22.23.4` y `preinstall` rechaza líneas sin parchear.
- CI usa 22.23.4, 24.22.1 y 26.13.0 en la matriz de tests.
- El runner local actual es 26.13.0, que incluye los parches de octubre.

## Dependencias de producción

Auditoría limpia: `yarn npm audit --recursive --environment production` no
reporta sugerencias.

Cambios de esta ronda:

- `ws` 8.18.3 → 8.22.1: DoS de memoria por fragmentos diminutos
  (GHSA-96hv-2xvq-fx4p, high) y disclosure de memoria sin inicializar
  (GHSA-58qx-3vcg-4xpx).
- `protobufjs` 7.5.x → 7.6.6: DoS por `Any` sin límite, shadowing de
  propiedades y loop infinito en opciones.
- `music-metadata` 11.x → 12.3.4: varios DoS en parsers de audio.
- `link-preview-js` 3.x → 5.0.1: SSRF por IPv6/loopback y DNS rebinding.
- Resoluciones: `handlebars` 4.7.10, `tar` 7.5.22, `tmp` 0.2.7,
  `js-yaml` 3.15.2/4.3.2, `markdown-it` 14.3.3, `brace-expansion`
  1.1.21/2.1.7, `browserslist`, `ip-address`, `lodash`, `zod`.
- `release-it` eliminado: no se usa y arrastraba `undici`, `socks` y
  `ip-address` vulnerables.

## Deuda conocida (solo desarrollo)

`protobufjs-cli@1.2.0` tiene advisories de inyección de código/comando al
procesar esquemas no confiables. Solo corre en CI/local sobre el bundle de
WhatsApp, nunca sobre input de usuario, y la versión 2.x cambió el output de
los estáticos y rompió la suite: se mantiene 1.2.0 hasta adaptar el pipeline.
Dependabot lo va a reportar; no afecta al paquete publicado.

`zod` quedó forzado a 4.6.7 para el árbol de `jimp` (peer opcional de
miniaturas); los tests de media pasan.

## Automatización

- `.github/dependabot.yml`: npm, proto-extract y GitHub Actions, semanal.
- Dependabot alerts y security updates habilitados en el repositorio.
- CI falla si la auditoría de producción encuentra algo.
- `publish.yml` instala el paquete recién publicado desde GitHub Packages y
  verifica que exporte `makeWASocket`.
