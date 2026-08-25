#!/bin/bash
# Quit this project's own app copies - installed Alli Bot, a local dist build, a
# mounted Alli Bot DMG, and the older "Grok Bot 0.18 Reconstructed" build - so a
# fresh install is not confused with one of them.
#
# The official Grok Bot (/Applications/Grok Bot.app, com.anysphere.sand) is NEVER
# touched. It is a different app that happens to share a name prefix; killing it
# would take down the user's real Grok Bot alongside ours.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECONSTRUCTED="/Applications/Grok Bot 0.18 Reconstructed.app"

quit_app() {
  osascript -e "tell application \"$1\" to quit" >/dev/null 2>&1 || true
}

# Every pattern below must be unique to this project. "/Applications/Grok Bot.app"
# is deliberately absent.
OURS=(
  "/Applications/Alli Bot.app"
  "/Volumes/Alli Bot"
  "$ROOT/dist/Alli Bot.app"
  "$RECONSTRUCTED"
  "Alli Bot.app/Contents/Resources/app.asar/dist/local-exec-daemon"
  "Grok Bot 0.18 Reconstructed.app/Contents/Resources/app.asar/dist/local-exec-daemon"
)

echo "Quitting Alli Bot..."
quit_app "Alli Bot"
[[ -d "$RECONSTRUCTED" ]] && quit_app "Grok Bot 0.18 Reconstructed"
sleep 1

echo "Killing leftover app processes..."
for pattern in "${OURS[@]}"; do
  pkill -f "$pattern" >/dev/null 2>&1 || true
done
sleep 1
for pattern in "${OURS[@]}"; do
  pkill -9 -f "$pattern" >/dev/null 2>&1 || true
done
sleep 1

if [[ -d "/Volumes/Alli Bot" ]]; then
  echo "Ejecting Alli Bot disk image..."
  hdiutil detach "/Volumes/Alli Bot" -force >/dev/null 2>&1 || true
fi

echo "Remaining related processes:"
pgrep -lf "Alli Bot.app|Grok Bot 0.18 Reconstructed.app" || echo "(none)"

if pgrep -f "/Applications/Grok Bot.app/Contents/MacOS" >/dev/null 2>&1; then
  echo "Note: official Grok Bot is running and was left alone. Running both at once is not supported."
fi

echo "Done. SSH computer tunnel was left running."
echo "To stop the tunnel: launchctl unload ~/Library/LaunchAgents/team.alongside.allibot.sandbox-tunnel.plist"
