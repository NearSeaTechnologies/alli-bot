#!/usr/bin/env bash
# Keep Alli's sandbox gateway on 127.0.0.1 by SSH-forwarding the Hetzner computer.
# Prefers the NetBird (WireGuard) peer when it is enrolled; otherwise the public IP.
set -euo pipefail

HOST_ENV_CANDIDATES=(
  "${ALLI_SANDBOX_HOST_ENV:-}"
  "$(cd "$(dirname "$0")" && pwd)/host.env"
  "${HOME}/Library/Application Support/Alli Bot/host.env"
  "$(cd "$(dirname "$0")" && pwd)/alli-sandbox-computer/host.env"
)
for candidate in "${HOST_ENV_CANDIDATES[@]}"; do
  if [[ -n "$candidate" && -f "$candidate" ]]; then
    # shellcheck disable=SC1090
    source "$candidate"
    break
  fi
done

PUBLIC_HOST=${ALLI_SANDBOX_SSH_FALLBACK:-root@46.224.83.5}
KEY=${ALLI_SANDBOX_SSH_KEY:-$HOME/.ssh/id_ed25519}
MATCH=${ALLI_SANDBOX_NETBIRD_MATCH:-sandbox|alli-sandbox|alli-bot}
HEALTH_URL=${ALLI_SANDBOX_HEALTH_URL:-http://127.0.0.1:1340/health}

python_bin() {
  if [[ -x /opt/homebrew/bin/python3 ]]; then
    echo /opt/homebrew/bin/python3
  elif [[ -x /usr/bin/python3 ]]; then
    echo /usr/bin/python3
  else
    command -v python3
  fi
}

netbird_host() {
  command -v netbird >/dev/null 2>&1 || return 1
  local py json
  py=$(python_bin) || return 1
  json=$(netbird status --json 2>/dev/null) || return 1
  ALLI_SANDBOX_NETBIRD_MATCH="$MATCH" "$py" -c '
import json, os, re, sys
pat = re.compile(os.environ.get("ALLI_SANDBOX_NETBIRD_MATCH", "sandbox|alli-sandbox|alli-bot"), re.I)
try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit(0)
for peer in ((data.get("peers") or {}).get("details") or []):
    blob = " ".join(str(peer.get(key) or "") for key in ("fqdn", "hostname", "dns_name", "name"))
    ip = str(peer.get("netbirdIp") or "").split("/", 1)[0]
    if ip and pat.search(blob):
        print("root@" + ip)
        raise SystemExit(0)
' <<<"$json"
}

resolve_host() {
  if [[ -n "${ALLI_SANDBOX_SSH:-}" ]]; then
    echo "$ALLI_SANDBOX_SSH"
    return
  fi
  local peer
  peer=$(netbird_host || true)
  if [[ -n "$peer" ]]; then
    echo "$peer"
    return
  fi
  echo "$PUBLIC_HOST"
}

gateway_up() {
  local code
  code=$(curl -sS -m 2 -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)
  [[ "$code" =~ ^2[0-9][0-9]$ ]]
}

print_host() {
  resolve_host
}

if [[ "${1:-}" == "--print-host" ]]; then
  print_host
  exit 0
fi

ARGS=()
if [[ -f "$KEY" ]]; then ARGS+=(-i "$KEY"); fi

while true; do
  if gateway_up; then
    sleep 20
    continue
  fi
  HOST=$(resolve_host)
  ssh -N -4 \
    "${ARGS[@]}" \
    -o ExitOnForwardFailure=yes \
    -o AddressFamily=inet \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ConnectTimeout=10 \
    -L 1337:127.0.0.1:1337 \
    -L 1339:127.0.0.1:1339 \
    -L 1340:127.0.0.1:1340 \
    -L 6080:127.0.0.1:6080 \
    -L 6081:127.0.0.1:6081 \
    -L 8790:127.0.0.1:8790 \
    "$HOST" || true
  sleep 5
done
