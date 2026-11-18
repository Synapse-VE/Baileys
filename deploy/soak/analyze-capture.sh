#!/bin/sh
set -eu

dir=${1:?usage: analyze-capture.sh EVIDENCE_DIR}
out="$dir/network"
mkdir -p "$out"
flags="$out/tcp-close-flags.txt"
: >"$flags"

for file in "$dir"/capture.pcap*; do
	[ -f "$file" ] || continue
	tcpdump -nn -tttt -r "$file" 'tcp[tcpflags] & (tcp-rst|tcp-fin) != 0' >>"$flags" 2>>"$out/tcpdump.err" || true
done

python3 "$(dirname "$0")/summarize-flows.py" "$dir"/capture.pcap* >"$out/flows.tsv" 2>"$out/flows.err" || true

{
	printf 'fin_rst_lines=%s\n' "$(wc -l <"$flags" | tr -d ' ')"
	printf 'pcap_files=%s\n' "$(find "$dir" -maxdepth 1 -name 'capture.pcap*' | wc -l | tr -d ' ')"
	printf 'snapshot_bytes=%s\n' "$(find "$dir" -maxdepth 1 -name 'capture.pcap*' -printf '%s\n' | awk '{s+=$1} END {print s+0}')"
} >"$out/summary.txt"

cat "$out/summary.txt"
