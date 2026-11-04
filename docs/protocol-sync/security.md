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

`protobufjs-cli` se actualizó de 1.2.0 a 1.3.3: cierra las tres alertas
high (GHSA-f84p-cvgm-xgjj, GHSA-6r35-46g8-jcw9, GHSA-pr59-h9ph-3fr8). La
generación estática quedó byte-idéntica y `test:proto`/`test:scripts` siguen
verdes. No se subió a 2.x porque cambia el output y rompe el pipeline.

Alertas de desarrollo aceptadas y cerradas en Dependabot:

- `minimatch` GHSA-g3hv-75wg-m249 (medium): el parche es 11.0.1, pero ESLint
  10 sigue dependiendo de `^10.2.x` y forzar 11 rompe su API. Solo se usa con
  globs fijos del tooling; se revisa cuando ESLint actualice.
- `deepmerge` GHSA-gcqx-w48m-w2h4 (low): no existe versión parcheada (4.3.1
  está dentro del rango vulnerable). Lo usa `jest-config` con configuración
  propia, no input de usuario; se revisa cuando haya fix.

## Backport de seguridad #2751

La línea v7 heredó dos bugs que upstream solo corrigió en `develop`:

- `Curve.verify` descartaba el boolean de `curve.verifySignature`, así que una
  firma bien formada pero inválida se aceptaba (certificados Noise y firma de
  cuenta del pairing).
- `extractDeviceJids` reutilizaba `domainType` entre dispositivos, y un
  dispositivo hosted contaminaba los siguientes.

Backport con tests en `curve-verify.test.ts` y
`signal.device-domain.test.ts`. Ver el PR upstream #2751.

`zod` quedó forzado a 4.6.7 para el árbol de `jimp` (peer opcional de
miniaturas); los tests de media pasan.

## Automatización

- `.github/dependabot.yml`: npm, proto-extract y GitHub Actions, semanal.
- Dependabot alerts y security updates habilitados en el repositorio.
- CI falla si la auditoría de producción encuentra algo.
- `publish.yml` instala el paquete recién publicado desde GitHub Packages y
  verifica que exporte `makeWASocket`.
