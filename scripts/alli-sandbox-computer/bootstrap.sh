#!/usr/bin/env bash
# Run on the GrokBot computer after the tarball is unpacked into /opt/alli-bot.
set -euo pipefail

ROOT=/opt/alli-bot
UNIT_SRC="$ROOT/alli-sandbox.service"
UNIT_DST=/etc/systemd/system/alli-sandbox.service

if [[ ! -x "$ROOT/ensure.sh" || ! -f "$UNIT_SRC" ]]; then
  echo "Unpack the Alli sandbox tarball into $ROOT first." >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable docker >/dev/null 2>&1 || true
  systemctl start docker >/dev/null 2>&1 || true
fi

bash "$ROOT/ensure.sh"

if command -v systemctl >/dev/null 2>&1; then
  cp "$UNIT_SRC" "$UNIT_DST"
  systemctl daemon-reload
  systemctl enable --now alli-sandbox.service
  systemctl --no-pager --full status alli-sandbox.service || true
fi

echo "Alli sandbox computer is enabled on boot."
echo "Gateway remains on 127.0.0.1:1340. Reach it from the Mac through the launchd SSH tunnel."
if [[ -f /opt/alli-bot/netbird.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /opt/alli-bot/netbird.env
  set +a
  if [[ -n "${NETBIRD_SETUP_KEY:-}" ]]; then
    bash "$ROOT/join-netbird.sh" || true
  fi
fi
