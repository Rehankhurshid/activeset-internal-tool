#!/bin/bash
# Builds "ActiveSet Bar.app" into ./build. Pass --install to copy it to
# ~/Applications and launch it.
set -euo pipefail
cd "$(dirname "$0")"

swift build -c release

APP="build/ActiveSet Bar.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/ActiveSetBar "$APP/Contents/MacOS/"
cp Info.plist "$APP/Contents/"

# App icon from the Raycast extension's icon.
ICONSET="build/AppIcon.iconset"
rm -rf "$ICONSET" && mkdir -p "$ICONSET"
SRC=../raycast/assets/extension-icon.png
for size in 16 32 128 256; do
  sips -z $size $size "$SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$SRC" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
cp "$SRC" "$ICONSET/icon_512x512.png"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

codesign --force --sign - "$APP"
echo "Built $APP"

if [[ "${1:-}" == "--install" ]]; then
  pkill -x ActiveSetBar 2>/dev/null || true
  mkdir -p ~/Applications
  rm -rf ~/Applications/"ActiveSet Bar.app"
  cp -R "$APP" ~/Applications/
  open ~/Applications/"ActiveSet Bar.app"
  echo "Installed to ~/Applications and launched"
fi
