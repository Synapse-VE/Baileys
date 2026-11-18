#!/usr/bin/env python3
"""Summarize pcap flows from tcpdump text output without printing payload."""
import re
import subprocess
import sys
from collections import defaultdict

LINE = re.compile(
    r"^(?P<ts>\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) IP (?P<src>\S+) > (?P<dst>\S+): Flags \[(?P<flags>[^\]]*)\]"
)

def main(paths):
    flows = {}
    for path in paths:
        proc = subprocess.run(
            ["tcpdump", "-nn", "-tttt", "-r", path],
            capture_output=True,
            text=True,
            check=False,
        )
        for line in proc.stdout.splitlines():
            match = LINE.match(line)
            if not match:
                continue
            src, dst = match.group("src"), match.group("dst")
            key = tuple(sorted((src, dst)))
            entry = flows.setdefault(
                key,
                {
                    "first": line[:23],
                    "last": line[:23],
                    "packets": 0,
                    "syn": 0,
                    "fin": 0,
                    "rst": 0,
                    "flags": set(),
                },
            )
            entry["last"] = line[:23]
            entry["packets"] += 1
            flags = match.group("flags")
            entry["flags"].update(flags)
            if "S" in flags:
                entry["syn"] += 1
            if "F" in flags:
                entry["fin"] += 1
            if "R" in flags:
                entry["rst"] += 1

    print("flow\tpackets\tfirst\tlast\tsyn\tfin\trst\tflags")
    for (src, dst), entry in sorted(flows.items(), key=lambda item: item[1]["packets"], reverse=True):
        print(
            f"{src}>{dst}\t{entry['packets']}\t{entry['first']}\t{entry['last']}\t"
            f"{entry['syn']}\t{entry['fin']}\t{entry['rst']}\t{''.join(sorted(entry['flags']))}"
        )

if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: summarize-flows.py pcap...")
    main(sys.argv[1:])
