#!/bin/sh
set -eu

log_dir=/var/log/baileys-soak
evidence_dir="$log_dir/evidence"
mkdir -p "$evidence_dir"

# Guarda una copia del pcap y del contexto para cada cierre o error.
journalctl -t baileys-wasm-soak -f -o cat | while IFS= read -r line; do
	case "$line" in
		*'"connection":"close"'*)
			case "$line" in
				*'soak stopped by SIGTERM'*|*'soak stopped by SIGINT'*) continue ;;
			esac
			kind=close
			;;
		*'"level":50'*)
			kind=error
			;;
		*) continue ;;
	esac

	ts=$(date -u +%Y%m%dT%H%M%S%NZ)
	out="$evidence_dir/$ts"
	mkdir -p "$out"
	cp "$log_dir"/capture.pcap* "$out"/ 2>/dev/null || true
	journalctl -t baileys-wasm-soak -n 500 --no-pager -o cat >"$out/soak.log"
	printf '%s\n' "$line" >"$out/event.json"
	if [ "$kind" = close ]; then
		cp "$out/event.json" "$out/close.json"
	fi
	/opt/baileys-wasm/deploy/soak/analyze-capture.sh "$out" >>"$out/analysis.log" 2>&1 || true
	printf 'captured %s (%s)\n' "$out" "$kind"
done
