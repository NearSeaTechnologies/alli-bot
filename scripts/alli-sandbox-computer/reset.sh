#!/usr/bin/env bash
# Wipe the Alli computer container and its volumes, then recreate it.
set -euo pipefail
ROOT=/opt/alli-bot
NAME=grok-bot-local-vm
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker volume rm grok-bot-local-vm-workspace grok-bot-local-vm-data >/dev/null 2>&1 || true
exec bash "$ROOT/install.sh"
