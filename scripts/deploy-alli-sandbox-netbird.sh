#!/usr/bin/env bash
# Copy join-netbird.sh to the public SSH address and enroll the computer in NetBird.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/alli-sandbox-computer/host.env"
HOST=${ALLI_SANDBOX_SSH:-$ALLI_SANDBOX_SSH_FALLBACK}
KEY=${ALLI_SANDBOX_SSH_KEY:-$HOME/.ssh/id_ed25519}
SETUP_KEY=${NETBIRD_SETUP_KEY:?Set NETBIRD_SETUP_KEY to a one-time setup key from vpn.alongside.team}
REMOTE_SCRIPT=/root/join-alli-netbird.sh
LOCAL_SCRIPT="$ROOT/alli-sandbox-computer/join-netbird.sh"

SSH=(ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$KEY" "$HOST")
SCP=(scp -o BatchMode=yes -o IdentitiesOnly=yes -i "$KEY")

"${SCP[@]}" "$LOCAL_SCRIPT" "$HOST:$REMOTE_SCRIPT"
"${SSH[@]}" "chmod 700 $REMOTE_SCRIPT && NETBIRD_SETUP_KEY=$(printf '%q' "$SETUP_KEY") NETBIRD_HOSTNAME=${NETBIRD_HOSTNAME:-alli-sandbox} NETBIRD_MANAGEMENT_URL=${NETBIRD_MANAGEMENT_URL:-https://vpn.alongside.team:443} $REMOTE_SCRIPT"
echo
echo "If enrollment succeeded, restart the Mac tunnel:"
echo "  bash $(cd "$(dirname "$0")" && pwd)/install-alli-sandbox-tunnel.sh"
echo "  $HOME/Library/Application\\ Support/Alli\\ Bot/sandbox-tunnel.sh --print-host"
