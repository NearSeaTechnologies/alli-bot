#!/usr/bin/env bash
# Boot-time helper: start the existing Alli container, or create it.
set -euo pipefail

ROOT=/opt/alli-bot
NAME=grok-bot-local-vm

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required on this host." >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl start docker >/dev/null 2>&1 || true
fi

if docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null | grep -qx true; then
  echo "$NAME is already running."
  exit 0
fi

if docker inspect "$NAME" >/dev/null 2>&1; then
  docker start "$NAME"
  echo "Started existing $NAME."
  exit 0
fi

exec bash "$ROOT/install.sh"
