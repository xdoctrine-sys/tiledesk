#!/bin/sh
# Refreshes ./files and ./monitor-v2.patch from a local clone of the dashboard on branch feature/monitor-v2
# (the working tree where Monitor V2 is developed), diffed against its `main` (= the tag of the production dashboard).
#   usage: ./sync-from-dashboard.sh /path/to/tiledesk-dashboard
set -eu
SRC="${1:?path of the tiledesk-dashboard clone}"
HERE="$(cd "$(dirname "$0")" && pwd)"
rsync -a --delete "$SRC/src/app/monitor-v2/" "$HERE/files/src/app/monitor-v2/"
rsync -a --delete "$SRC/src/assets/monitor-v2/" "$HERE/files/src/assets/monitor-v2/"
git -C "$SRC" diff main -- src/app/app.routing.ts src/app/components/sidebar/sidebar.component.html > "$HERE/monitor-v2.patch"
echo "synced: $(find "$HERE/files" -type f | wc -l | tr -d ' ') files, patch $(wc -l < "$HERE/monitor-v2.patch" | tr -d ' ') lines"
