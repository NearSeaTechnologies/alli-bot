#!/usr/bin/env bash
# Run on the Hetzner Alli computer. Joins Alongside NetBird (WireGuard) so the
# Mac can SSH to the box over 100.x instead of the public IP.
set -euo pipefail

MGMT=${NETBIRD_MANAGEMENT_URL:-https://vpn.alongside.team:443}
HOSTNAME_VALUE=${NETBIRD_HOSTNAME:-alli-sandbox}
KEY=${NETBIRD_SETUP_KEY:?Set NETBIRD_SETUP_KEY to a one-time NetBird setup key from vpn.alongside.team}

if ! command -v netbird >/dev/null 2>&1; then
  curl -fsSL https://pkgs.netbird.io/install.sh | sh
fi

netbird up --management-url "$MGMT" --setup-key "$KEY" --hostname "$HOSTNAME_VALUE"
netbird status
echo
echo "Mac tunnel will pick this peer up as hostname ${HOSTNAME_VALUE}.netbird.selfhosted"
echo "Keep the Docker gateway published on 127.0.0.1 only; the launchd SSH tunnel forwards it."
