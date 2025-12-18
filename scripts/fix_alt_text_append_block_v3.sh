#!/usr/bin/env bash
set -euo pipefail

FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path

p = Path("server.js")
lines = p.read_text(encoding="utf-8").splitlines(True)

# Find the line that actually writes alt-text.txt (must include name + alt-text.txt)
target = None
for i, ln in enumerate(lines):
    if 'name: "alt-text.txt"' in ln or "name: 'alt-text.txt'" in ln or "alt-text.txt" in ln and "name:" in ln:
        target = i
        break

if target is None:
    raise SystemExit("❌ No alt-text.txt writer found in server.js (name: \"alt-text.txt\").")

# Walk upward to find the start of the archive.append(...) call that contains it
start = None
for j in range(target, max(-1, target - 40), -1):
    if "archive.append(" in lines[j]:
        start = j
        break

if start is None:
    raise SystemExit("❌ Found alt-text.txt line, but couldn't find archive.append( above it.")

# Walk downward until we hit the end of the statement
end = None
for k in range(target, min(len(lines), target + 40)):
    if ");" in lines[k]:
        end = k
        break

if end is None:
    raise SystemExit("❌ Found archive.append( start, but couldn't find statement end ');'.")

replacement = '      archive.append(Buffer.from(makeAltTextFor(packFiles[0], baseAlt) + "\\n", "utf8"), { name: "alt-text.txt" });\n'
new_lines = lines[:start] + [replacement] + lines[end+1:]

p.write_text("".join(new_lines), encoding="utf-8")
print(f"✅ Replaced alt-text.txt archive.append block (lines {start+1}-{end+1}) with clean one-liner.")
PY
