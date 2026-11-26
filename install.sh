#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
for cmd in gnome-extensions gnome-shell glib-compile-schemas; do
  command -v "$cmd" >/dev/null || { echo "Missing required existing command: $cmd" >&2; exit 1; }
done
uuid=QuickSketch@local
version=$(gnome-shell --version | awk '{print $NF}' | cut -d. -f1)
case "$version" in 42) ;; *) echo "Unsupported GNOME version: $version" >&2; exit 1;; esac
base="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
dest="$base/$uuid"
mkdir -p "$dest/schemas"
gnome-extensions disable "$uuid" 2>/dev/null || true
cp metadata.json extension.js "$dest/"
cp schemas/*.xml "$dest/schemas/"
glib-compile-schemas --strict "$dest/schemas"
if gnome-extensions enable "$uuid" 2>/dev/null; then
  echo 'Installed. Press Super+Shift+D. If not active, log out and back in.'
else
  echo "Installed. Log out and back in (or reload Gnome), then run: gnome-extensions enable $uuid"
fi
