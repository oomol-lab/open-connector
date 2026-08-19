#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  set -- serve
fi

case "$1" in
serve)
  shift
  exec node src/server/index.ts "$@"
  ;;
migrate)
  shift
  exec node scripts/runtime-data.ts migrate "$@"
  ;;
*)
  exec "$@"
  ;;
esac
