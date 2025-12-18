#!/usr/bin/env bash
set -euo pipefail

FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path

p = Path("server.js")
lines = p.read_text(encoding="utf-8").splitlines(True)

start = None
end = None

# Find a block that:
# - starts at a line containing: archive.append(Buffer.from(makeAltTextFor(
# - ends at a line containing: name: "alt-text.txt"
for i, ln in enumerate(lines):
    if start is None and "archive.append(Buffer.from(makeAltTextFor(" in ln and "alt-text.txt" not in ln:
        start = i
        continue
    if start is not None and 'name: "alt-text.txt"' in ln:
        end = i
        break

if start is None or end is None:
    raise SystemExit("❌ Could not locate the alt-text.txt append block automatically.")

# Replace the whole block with a correct single-line append
replacement = '      archive.append(Buffer.from(makeAltTextFor(packFiles[0], baseAlt) + "\\n", "utf8"), { name: "alt-text.txt" });\n'
new_lines = lines[:start] + [replacement] + lines[end+1:]

p.write_text("".join(new_lines), encoding="utf-8")
print("✅ Replaced alt-text.txt append block with a clean single-line version")
PY
