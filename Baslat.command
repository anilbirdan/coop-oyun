#!/bin/bash
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  /usr/bin/osascript -e 'display dialog "Coop için önce Node.js 22 veya üstünü kurun. İndirme sayfası açılacak." buttons {"Tamam"} default button "Tamam"'
  /usr/bin/open 'https://nodejs.org/en/download'
  exit 1
fi
if ! node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'; then
  /usr/bin/osascript -e 'display dialog "Node.js sürümü eski. 22 veya üstü gerekiyor." buttons {"Tamam"} default button "Tamam"'
  exit 1
fi
exec node src/server.mjs
