# Alli Bot production

Internal Alongside cut. Not an App Store build and not a public download.

## What ships

- macOS arm64 app: `dist/Alli Bot.app`
- Disk image: `dist/Alli Bot.dmg` plus `dist/Alli Bot.dmg.sha256`
- Bundle ID: `team.alongside.allibot`
- Product version: `1.0.0` (the 0.18 renderer is a pinned build input, not the product version)
- Computer: Hetzner `sandbox-cheap-01` through the launchd SSH tunnel on localhost

Official `/Applications/Grok Bot.app` is never overwritten. Do not run both apps at the same time.

## Release command

```sh
PATH="/opt/homebrew/opt/node/bin:$PATH" npm run ship
```

That packages with Node 26, fails the pack if the asar is missing the teammate catalog / Alli identity, writes the DMG checksum, replaces `/Applications/Alli Bot.app` by copy (not asar-swap), and installs the launchd Computer tunnel.

Developer ID signing and notarization run when:

- a single `Developer ID Application` identity is in the keychain, or `ALLI_CODESIGN_IDENTITY` is set
- `ALLI_NOTARY_PROFILE` is a `notarytool` keychain profile

```sh
xcrun notarytool store-credentials
export ALLI_NOTARY_PROFILE=alongside
```

Ad-hoc builds are for this machine only. Gatekeeper will block them on a clean Mac.

## Data root

Packaged Alli Bot stores host settings in:

`~/Library/Application Support/Alli Bot/sand-data`

On first launch it migrates `~/.grokbot` (and older `~/.cursor/sand`) into that directory when the canonical root is empty. Do not keep a second settings tree.

## Computer

```sh
npm run sandbox:tunnel:install
```

NetBird on the VPS is optional but preferred. It needs a one-time setup key and is not baked into the DMG:

```sh
NETBIRD_SETUP_KEY=... bash scripts/alli-sandbox-computer/join-netbird.sh
```

Until that exists, the Mac tunnel falls back to `root@46.224.83.5`.

## Rights

This tree is a reconstruction of a public Grok Bot 0.18 artifact plus Alongside patches. Internal use on Alongside Macs is the production scope. Public redistribution needs an independent rights review. See `PROVENANCE.md` and `NOTICE.md`.
