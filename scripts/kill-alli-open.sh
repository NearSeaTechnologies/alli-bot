#!/bin/bash
# Quit every Alli Bot / leftover Grok Bot.app copy from this project so a fresh
# install is not confused with official Grok Bot or a mounted DMG.
set -u

quit_app() {
  osascript -e "tell application \"$1\" to quit" >/dev/null 2>&1 || true
}

echo "Quitting Alli Bot and Grok Bot..."
quit_app "Alli Bot"
quit_app "Grok Bot"
sleep 1

echo "Killing leftover app processes..."
pkill -f "/Applications/Alli Bot.app" >/dev/null 2>&1 || true
pkill -f "/Volumes/Alli Bot" >/dev/null 2>&1 || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pkill -f "$ROOT/dist/Alli Bot.app" >/dev/null 2>&1 || true
pkill -f "/Applications/Grok Bot.app" >/dev/null 2>&1 || true
pkill -f "Alli Bot.app/Contents/Resources/app.asar/dist/local-exec-daemon" >/dev/null 2>&1 || true
pkill -f "Grok Bot.app/Contents/Resources/app.asar/dist/local-exec-daemon" >/dev/null 2>&1 || true
sleep 1
pkill -9 -f "/Applications/Alli Bot.app" >/dev/null 2>&1 || true
pkill -9 -f "/Volumes/Alli Bot" >/dev/null 2>&1 || true
pkill -9 -f "$ROOT/dist/Alli Bot.app" >/dev/null 2>&1 || true
pkill -9 -f "/Applications/Grok Bot.app" >/dev/null 2>&1 || true
sleep 1

if [[ -d "/Volumes/Alli Bot" ]]; then
  echo "Ejecting Alli Bot disk image..."
  hdiutil detach "/Volumes/Alli Bot" -force >/dev/null 2>&1 || true
fi

echo "Remaining related processes:"
pgrep -lf "Alli Bot.app|Grok Bot.app" || echo "(none)"
echo "Done. SSH computer tunnel was left running."
echo "To stop the tunnel: launchctl unload ~/Library/LaunchAgents/team.alongside.allibot.sandbox-tunnel.plist"
