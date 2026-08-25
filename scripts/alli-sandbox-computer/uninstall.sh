#!/usr/bin/env bash
# Remove the Alli sandbox container and files from this host.
# Does not delete the VM itself or other Docker workloads.
set -euo pipefail

NAME=grok-bot-local-vm
IMAGE=public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest
ROOT=/opt/alli-bot

if command -v docker >/dev/null 2>&1; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm grok-bot-local-vm-workspace grok-bot-local-vm-data >/dev/null 2>&1 || true
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  echo "Removed container $NAME, its volumes, and the sandbox image if present."
else
  echo "Docker is not installed; skipped container cleanup."
fi

rm -rf "$ROOT" /root/alli-sandbox-computer.tgz /root/join-alli-netbird.sh
echo "Removed $ROOT and copied install tarball."
echo "This script does not delete SSH keys or the server."
