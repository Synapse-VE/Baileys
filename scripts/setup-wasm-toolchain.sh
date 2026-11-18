#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.tools"
export HOME="$TOOLS/home"
export CARGO_HOME="$TOOLS/cargo"
export RUSTUP_HOME="$TOOLS/rustup"

mkdir -p "$TOOLS/home" "$CARGO_HOME" "$RUSTUP_HOME"

if ! command -v rustup >/dev/null 2>&1; then
  curl -sSf --max-time 120 https://sh.rustup.rs -o "$TOOLS/rustup-init.sh"
  chmod +x "$TOOLS/rustup-init.sh"
  "$TOOLS/rustup-init.sh" -y --profile minimal --default-toolchain stable --target wasm32-unknown-unknown
fi

export PATH="$CARGO_HOME/bin:$PATH"
rustup target add wasm32-unknown-unknown

rustc --version
cargo --version
rustup target list --installed

# wasm-pack download the matching wasm-bindgen; keep it in npx's cache and
# expose the exact version used by the bridge build.
npx --yes wasm-pack@0.15.1 --version

echo "WASM toolchain ready. Add $CARGO_HOME/bin to PATH for cargo/rustup."
