#!/bin/bash
# Rebuilds Alli Bot, replaces /Applications/Alli Bot.app, and launches it.
# Same as: npm run reload
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/opt/node/bin:/opt/homebrew/opt/node@26/bin:$PATH"
exec node "$ROOT/scripts/reload-alli-bot.mjs" "$@"
