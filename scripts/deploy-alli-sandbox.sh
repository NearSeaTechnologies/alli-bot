#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/alli-sandbox-computer/host.env"
HOST=${ALLI_SANDBOX_SSH:-$ALLI_SANDBOX_SSH_FALLBACK}
KEY=${ALLI_SANDBOX_SSH_KEY:-$HOME/.ssh/id_ed25519}
TGZ=${ALLI_SANDBOX_TGZ:-$(cd "$ROOT/.." && pwd)/dist/alli-sandbox-computer.tgz}

if [[ ! -f "$TGZ" ]]; then
  echo "Missing $TGZ — build it with: node scripts/pack-alli-sandbox.mjs" >&2
  exit 1
fi
if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key $KEY" >&2
  exit 1
fi

SSH=(ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$KEY" "$HOST")
SCP=(scp -o BatchMode=yes -o IdentitiesOnly=yes -i "$KEY")

echo "Copying $(basename "$TGZ") to $HOST ..."
"${SCP[@]}" "$TGZ" "$HOST:/root/alli-sandbox-computer.tgz"

echo "Installing Alli computer container and enabling it on boot ..."
"${SSH[@]}" 'set -euo pipefail
  mkdir -p /opt/alli-bot
  tar -xzf /root/alli-sandbox-computer.tgz -C /opt/alli-bot
  chmod 755 /opt/alli-bot/*.sh
  bash /opt/alli-bot/bootstrap.sh
  docker ps --filter name=grok-bot-local-vm --format "{{.Names}} {{.Status}}"
'

echo
echo "Mac tunnel is owned by launchd. Reload it with:"
echo "  bash $ROOT/install-alli-sandbox-tunnel.sh"
echo "Then in Alli Bot: Settings → Router → Use sandbox computer"
