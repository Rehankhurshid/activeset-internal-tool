#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "ActiveSet Local Screenshot Runner Installer"
echo "-------------------------------------------"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (v20+). Install it first: https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js with npm included."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js v20+ is required. Current: $(node -v)"
  exit 1
fi

echo "Installing dependencies..."
npm install

chmod +x "$SCRIPT_DIR/activeset-capture"

USER_BIN="$HOME/.local/bin"
mkdir -p "$USER_BIN"
ln -sf "$SCRIPT_DIR/activeset-capture" "$USER_BIN/activeset-capture"

echo ""
echo "Installed."
echo ""
echo "Next steps:"
echo "1) Open a new terminal"
echo "2) Run: activeset-capture"
echo ""

if [[ ":$PATH:" != *":$USER_BIN:"* ]]; then
  echo "Your PATH does not include $USER_BIN"
  echo "Add this line to your shell profile (~/.zshrc or ~/.bashrc):"
  echo "  export PATH=\"$USER_BIN:\$PATH\""
  echo ""
  echo "Then reopen terminal and run: activeset-capture"
fi
