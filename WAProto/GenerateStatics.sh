#!/bin/sh
# yarn runs this from the repository root; move here so the relative paths
# below always resolve to the proto directory.
set -eu

cd "$(dirname "$0")"

yarn pbjs -t static-module --no-beautify -w es6 --no-bundle --no-delimited --no-verify --no-comments -o ./index.js ./WAProto.proto
yarn pbjs -t static-module --no-beautify -w es6 --no-bundle --no-delimited --no-verify ./WAProto.proto | yarn pbts --no-comments -o ./index.d.ts -
node ./fix-imports.js
