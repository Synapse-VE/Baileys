# Bridge WASM vendorizado

Artefacto de Fase 1 para validar el adaptador sin depender de una compilacion
Rust en cada job de CI.

- Fuente: `WhiskeySockets/Baileys` PR #2067, head `3a788d3d6dae1016e925ce95c2650f19c1208ebb`
- Paquete: `packages/whatsapp-rust-bridge`
- Core: `oxidezap/whatsapp-rust@9649af098260cf53b6b1d7c2434b1a21cd6378b3`
- Build: `npx wasm-pack build --target web --out-dir pkg --no-pack --no-opt`
- Rust: nightly-2026-01-30, wasm32-unknown-unknown

No se publica ni se usa como dependencia de produccion hasta que el adaptador
este integrado y probado. Es un artefacto de investigacion de la rama
`feat/libsignal-wasm`.
