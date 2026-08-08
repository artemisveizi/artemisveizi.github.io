#!/bin/sh
# Run every suite. Needs only node — no framework, no dependencies.
#
#   sh test/run.sh
#
set -e
cd "$(dirname "$0")/.."
for t in test/*.test.js; do
  echo "=== $t"
  node "$t"
done
