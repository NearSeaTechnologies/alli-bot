#!/usr/bin/env bash
# Install a per-user launchd agent that keeps the Alli sandbox SSH tunnel up.
set -euo pipefail

LABEL=team.alongside.allibot.sandbox-tunnel
SUPPORT="${ALLI_SANDBOX_SUPPORT_DIR:-$HOME/Library/Application Support/Alli Bot}"
AGENT_DIR="${ALLI_SANDBOX_LAUNCH_AGENT_DIR:-$HOME/Library/LaunchAgents}"
PLIST="$AGENT_DIR/${LABEL}.plist"
SCRIPT="$SUPPORT/sandbox-tunnel.sh"
LOG="$SUPPORT/sandbox-tunnel.log"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_SCRIPT="$REPO_ROOT/alli-sandbox-tunnel.sh"
REPO_HOST_ENV="$REPO_ROOT/alli-sandbox-computer/host.env"
UID_NUM=$(id -u)
DOMAIN="gui/${UID_NUM}"

mkdir -p "$SUPPORT" "$AGENT_DIR"
cp "$REPO_SCRIPT" "$SCRIPT"
chmod 755 "$SCRIPT"
if [[ -f "$REPO_HOST_ENV" ]]; then
  cp "$REPO_HOST_ENV" "$SUPPORT/host.env"
fi
touch "$LOG"
FALLBACK_HOST="root@46.224.83.5"
if [[ -f "$SUPPORT/host.env" ]]; then
  # shellcheck disable=SC1091
  source "$SUPPORT/host.env"
  FALLBACK_HOST=${ALLI_SANDBOX_SSH_FALLBACK:-$FALLBACK_HOST}
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>ALLI_SANDBOX_SSH_FALLBACK</key>
    <string>${FALLBACK_HOST}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>WorkingDirectory</key>
  <string>${HOME}</string>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
EOF

if [[ "${ALLI_SANDBOX_SKIP_LAUNCHCTL:-}" == "1" ]]; then
  echo "Wrote $PLIST (launchctl skipped)"
else
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  launchctl bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "$DOMAIN" "$PLIST"
  launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  launchctl kickstart -k "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
fi

echo "Installed $PLIST"
echo "Tunnel script: $SCRIPT"
echo "Log: $LOG"
echo "Host: $("$SCRIPT" --print-host)"
echo "This agent keeps 127.0.0.1:1340 forwarded at login."
echo "If a matching NetBird peer is enrolled, SSH uses that WireGuard address; otherwise $("${SCRIPT}" --print-host)."
