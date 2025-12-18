#!/usr/bin/env bash
set -euo pipefail

FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

# Replace the broken two-line Buffer.from(" ... + "<newline> ... ") with a correct "\n"
pattern = re.compile(
    r'archive\.append\(Buffer\.from\(makeAltTextFor\(packFiles\[0\], baseAlt\)\s*\+\s*"\s*\n\s*",\s*"utf8"\)\s*,\s*\{\s*name:\s*"alt-text\.txt"\s*\}\s*\);\s*',
    re.M
)

replacement = 'archive.append(Buffer.from(makeAltTextFor(packFiles[0], baseAlt) + "\\n", "utf8"), { name: "alt-text.txt" });\n'

new_s, n = pattern.subn(replacement, s)
if n == 0:
    raise SystemExit("❌ Could not find the broken alt-text.txt append block. Paste lines 465-475 again.")
p.write_text(new_s, encoding="utf-8")
print("✅ Fixed broken alt-text.txt newline append")
PY
