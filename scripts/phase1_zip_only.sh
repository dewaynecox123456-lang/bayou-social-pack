#!/usr/bin/env bash
set -euo pipefail
FILE="server.js"
cp -av "$FILE" "$FILE.bak.ziponly.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

# 1) Disable preview route block (best-effort)
# Comment out the entire app.post("/api/preview", ...) block if present
preview_pat = re.compile(r'(app\.post\(\s*"/api/preview"[\s\S]*?\n\);\s*\n)', re.M)
if preview_pat.search(s):
    s = preview_pat.sub(lambda m: "/* PREVIEW DISABLED (ZIP-only mode)\n" + m.group(0) + "*/\n", s)

# 2) Remove metadata file appends (seo/alt/captions). Keep images + license + readme.
# Comment out any archive.append writing these files
def comment_append(filename):
    nonlocal_s = []
    return re.sub(
        rf'^\s*archive\.append\([\s\S]*?name:\s*"{re.escape(filename)}"[\s\S]*?\);\s*$',
        f'      // [ZIP-only] removed {filename}',
        s,
        flags=re.M
    )

for fn in ["seo.txt", "alt-text.txt", "captions.txt"]:
    s = re.sub(
        rf'^\s*archive\.append\([\s\S]*?name:\s*"{re.escape(fn)}"[\s\S]*?\);\s*$',
        f'      // [ZIP-only] removed {fn}',
        s,
        flags=re.M
    )

# If there are multiple manifest.json appends, keep only the LAST one.
lines = s.splitlines(True)
manifest_idxs = [i for i,ln in enumerate(lines) if 'name: "manifest.json"' in ln]
if len(manifest_idxs) > 1:
    # remove all but last
    keep = manifest_idxs[-1]
    for idx in manifest_idxs[:-1]:
        # comment that line (usually a single-line append)
        lines[idx] = re.sub(r'^(\s*)', r'\1// [ZIP-only] removed duplicate ', lines[idx])
    s = "".join(lines)

# 3) Force built-in signature OFF by default (only uploaded logo should show)
# Replace "let sigOff = ... === '1';" with "let sigOff = true;"
s = re.sub(
    r'let\s+sigOff\s*=\s*String\(req\.body\.signature_off\s*\|\|\s*""\)\.trim\(\)\s*===\s*"1"\s*;',
    'let sigOff = true; // ZIP-only: built-in signature OFF by default',
    s
)

p.write_text(s, encoding="utf-8")
print("✅ ZIP-only patch applied (preview disabled, metadata stripped, signature default OFF)")
PY
