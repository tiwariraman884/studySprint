#!/usr/bin/env bash
set -euo pipefail
for f in /tmp/migrations/*.sql; do
  echo "APPLY $f"
  psql -U postgres -d study -v ON_ERROR_STOP=1 -q -f "$f" || exit 1
done
echo "MIGRATIONS OK"
