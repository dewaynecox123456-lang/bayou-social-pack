#!/usr/bin/env bash
set -euo pipefail

FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path

p = Path("server.js")
lines = p.read_text(encoding="utf-8").splitlines(True)

out = []
i = 0
fixed = False

while i < len(lines):
    line = lines[i]

    # We are looking for THIS broken pattern:
    # archive.append(Buffer.from(makeAltTextFor(packFiles[0], baseAlt) + "
    # ", "utf8"), { name: "alt-text.txt" });
    if (
        'archive.append(Buffer.from(makeAltTextFor(packFiles[0], baseAlt)' in line
        and '+ "' in line
        and i + 1 < len(lines)
        and 'alt-text.txt' in lines[i+1]
        and '", "utf8")' in lines[i+1]
    ):
        out.append('      archive.append(Buffer.from(makeAltTextFor(packFiles[0], baseAlt) + "\\n", "utf8"), { name: "alt-text.txt" });\n')
        i += 2
        fixed = True
        continue

    out.append(line)
    i += 1

if not fixed:
    raise SystemExit("❌ Did not find the split alt-text.txt append. Paste lines 465-475 again.")

p.write_text("".join(out), encoding="utf-8")
print("✅ Fixed split alt-text.txt newline append")
PY
