#!/bin/sh
# Fail-open Litestream supervision (P1.0): the app must never stay down
# because the backup layer is unconfigured. With R2 credentials present,
# Litestream supervises the server and owns WAL checkpointing (the app
# disables autocheckpoint via LITESTREAM_ENABLED); without them we boot
# plain and log loudly so the gap is visible in deploy logs.
set -eu

if [ -n "${LITESTREAM_R2_BUCKET:-}" ] && [ -n "${LITESTREAM_R2_ACCESS_KEY_ID:-}" ] && [ -n "${LITESTREAM_R2_SECRET_ACCESS_KEY:-}" ]; then
	echo "[start] litestream supervision enabled (replica: r2://${LITESTREAM_R2_BUCKET}/v2)"
	export LITESTREAM_ENABLED=1
	exec litestream replicate -exec "node build"
else
	echo "[start] WARNING: litestream NOT configured (missing LITESTREAM_R2_* vars) - running without streaming backup"
	exec node build
fi
