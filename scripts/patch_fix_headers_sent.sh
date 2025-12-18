#!/usr/bin/env bash
set -euo pipefail
FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

def patch_catch(tag):
    # tag should be "PREVIEW" or "GENERATE"
    pat = re.compile(rf'''
catch\s*\(\s*err\s*\)\s*\{{      # catch (err) {{
(?:(?!\n\}}).)*?                 # anything up to closing }}
\}}                              # }}
''', re.X | re.S)

    # Only patch the specific block that logs "<TAG> ERROR:"
    m = re.search(rf'catch\s*\(\s*err\s*\)\s*\{{.*?console\.error\(\s*"{tag}\s+ERROR:"\s*,\s*err\s*\)\s*;.*?\n\}}', s, re.S)
    if not m:
        return False

    repl = f'''catch (err) {{
      console.error("{tag} ERROR:", err);
      // If response already started streaming, don't try to send JSON
      if (res.headersSent) {{
        try {{ res.end(); }} catch {{}}
        return;
      }}
      return res.status(500).json({{ error: String(err?.message || err) }});
    }}'''

    new = s[:m.start()] + repl + s[m.end():]
    return new

changed = False

new_s = patch_catch("PREVIEW")
if new_s:
    s = new_s
    changed = True

new_s = patch_catch("GENERATE")
if new_s:
    s = new_s
    changed = True

if not changed:
    print("⚠️ Did not find PREVIEW/GENERATE catch blocks to patch automatically.")
    print("   Run: grep -n 'PREVIEW ERROR' -n server.js && grep -n 'GENERATE ERROR' -n server.js")
else:
    p.write_text(s, encoding="utf-8")
    print("✅ Patched catch blocks to avoid ERR_HTTP_HEADERS_SENT / chunked failures.")
PY
