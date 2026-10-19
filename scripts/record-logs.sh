#!/bin/sh
# Streams the live app's logs to the terminal and records them at the same
# time, one file per day under docs/testing/logs/. Stop with Ctrl+C; run it
# again and it appends. Colour stays on screen and is stripped from the file.
#
#   scripts/record-logs.sh            # everything
#   scripts/record-logs.sh REJECT     # only lines matching a pattern
set -eu
cd "$(dirname "$0")/.."
app=comp4020-final-mayrhee218
mkdir -p docs/testing/logs
file="docs/testing/logs/$(date +%Y-%m-%d).log"
echo "recording $app logs to $file (Ctrl+C to stop)"
mise exec -- flyctl logs -a "$app" 2>&1 |
  grep --line-buffered -E "${1:-.}" |
  tee /dev/tty |
  sed -u -E 's/\x1b\[[0-9;]*m//g' >> "$file"
