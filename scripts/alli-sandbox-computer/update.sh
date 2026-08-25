#!/usr/bin/env bash
# Preserve volumes; pull a newer image and recreate the container.
set -euo pipefail
ROOT=/opt/alli-bot
IMAGE=public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest
NAME=grok-bot-local-vm
docker pull "$IMAGE"
docker rm -f "$NAME" >/dev/null 2>&1 || true
exec bash "$ROOT/install.sh"
