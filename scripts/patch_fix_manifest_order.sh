#!/usr/bin/env bash
set -euo pipefail
FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

# 1) Find where Option B block starts
optb = s.find("// -------- Option B: Per-image ALT files + manifest --------")
if optb == -1:
    raise SystemExit("❌ Could not find Option B block anchor.")

# 2) Find the manifest declaration (const manifest = ...)
m = re.search(r'^\s*const\s+manifest\s*=\s*\{', s, re.M)
if not m:
    raise SystemExit("❌ Could not find `const manifest = {` declaration.")

manifest_decl_pos = m.start()

# If manifest is declared AFTER Option B, move it BEFORE Option B
if manifest_decl_pos > optb:
    # Grab the full manifest object block by balancing braces (simple, robust enough)
    start = manifest_decl_pos
    i = start
    brace = 0
    in_obj = False
    while i < len(s):
        ch = s[i]
        if ch == '{':
            brace += 1
            in_obj = True
        elif ch == '}':
            brace -= 1
            if in_obj and brace == 0:
                # include trailing semicolon if present
                j = i + 1
                while j < len(s) and s[j] in " \t\r\n":
                    j += 1
                if j < len(s) and s[j] == ';':
                    j += 1
                manifest_block = s[start:j] + "\n"
                # remove from original
                s_removed = s[:start] + s[j:]
                # insert right before Option B anchor
                insert_point = s_removed.find("// -------- Option B: Per-image ALT files + manifest --------")
                s_fixed = s_removed[:insert_point] + manifest_block + s_removed[insert_point:]
                p.write_text(s_fixed, encoding="utf-8")
                print("✅ Moved manifest declaration above Option B block.")
                break
        i += 1
    else:
        raise SystemExit("❌ Failed to extract manifest block safely.")
else:
    print("✅ Manifest already declared before Option B block (no move needed).")

# 3) Remove duplicate manifest.json append if you have two
s = p.read_text(encoding="utf-8")
# Keep the last one by removing earlier ones that append manifest.json
lines = s.splitlines(True)
out = []
seen = 0
for ln in lines:
    if 'name: "manifest.json"' in ln and "archive.append" in ln:
        seen += 1
        # if more than 1, drop earlier ones
        if seen < 2:
            out.append("      // [disabled] duplicate manifest.json append (keep final one)\n")
            continue
    out.append(ln)

p.write_text("".join(out), encoding="utf-8")
print("✅ Ensured only one manifest.json append remains.")
PY
