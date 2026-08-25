#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/alli-bot
IMAGE=public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest
NAME=grok-bot-local-vm
TOKEN_FILE="$ROOT/gateway.token"

if [[ ! -f "$ROOT/host-main.cjs" || ! -d "$ROOT/box-exec-daemon" || ! -f "$TOKEN_FILE" ]]; then
  echo "Unpack the Alli sandbox tarball into $ROOT first." >&2
  exit 1
fi

TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
if [[ ${#TOKEN} -lt 32 ]]; then
  echo "gateway.token is missing or too short." >&2
  exit 1
fi

if docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null | grep -qx true; then
  echo "Container $NAME is already running."
  exit 0
fi
if docker inspect "$NAME" >/dev/null 2>&1; then
  docker start "$NAME"
  echo "Started existing container $NAME."
  exit 0
fi

docker pull "$IMAGE"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker volume create grok-bot-local-vm-workspace >/dev/null
docker volume create grok-bot-local-vm-data >/dev/null

docker run --detach --name "$NAME" \
  --label com.grok-bot.local-vm=1 \
  --platform linux/amd64 \
  --restart unless-stopped \
  --env SAND_SUPERVISOR_ENABLED=1 \
  --env SAND_BOX_AUTO_UPDATE=0 \
  --env SAND_USE_EXISTING_BOX_EXEC_DAEMON=1 \
  --env SAND_TREE_SITTER_NODE_DEPS=/home/box/deps \
  --env NODE_PATH=/home/box/deps \
  --env SAND_GATEWAY_BIND_HOST=0.0.0.0 \
  --env SAND_HOST_PORT=1340 \
  --env "SAND_GATEWAY_TOKEN=${TOKEN}" \
  --publish 127.0.0.1:1337:1337 \
  --publish 127.0.0.1:1339:1339 \
  --publish 127.0.0.1:1340:1340 \
  --publish 127.0.0.1:6080:6080 \
  --publish 127.0.0.1:6081:6081 \
  --publish 127.0.0.1:8790:8790 \
  --volume grok-bot-local-vm-workspace:/workspace \
  --volume grok-bot-local-vm-data:/home/box/sand-data \
  --mount "type=bind,src=${ROOT}/host-main.cjs,dst=/home/box/sand-host/host-main.cjs,readonly" \
  --mount "type=bind,src=${ROOT}/box-exec-daemon,dst=/home/box/box-exec-daemon,readonly" \
  "$IMAGE"

echo "Container $NAME is starting. Gateway is bound to 127.0.0.1:1340 on this host."
echo "On the Mac, keep the launchd tunnel loaded:"
echo "  npm run sandbox:tunnel:install"
