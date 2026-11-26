#!/usr/bin/env bash
set -euo pipefail
uuid=QuickSketch@local
gnome-extensions disable "$uuid" 2>/dev/null || true
rm -rf -- "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
echo 'Removed. Log out and back in to refresh GNOME Shell.'
