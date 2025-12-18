#!/usr/bin/env bash
set -euo pipefail
FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

def patch(tag):
    # Match: catch (e) { ... console.error("<TAG> ERROR:", e); ... }
    # Replace entire catch block with safe "single response" behavior.
    pat = re.compile(
        rf'catch\s*\(\s*e\s*\)\s*\{{.*?console\.error\(\s*"{tag}\s+ERROR:"\s*,\s*e\s*\)\s*;.*?\n\s*\}}',
        re.S
    )
    m = pat.search(s)
    if not m:
        return False

    repl = (
        'catch (e) {\n'
        f'      console.error("{tag} ERROR:", e);\n'
        '      // If we already started streaming / sending headers, we cannot send JSON.\n'
        '      // Just end/destroy the response to prevent ERR_HTTP_HEADERS_SENT / incomplete chunks.\n'
        '      if (res.headersSent) {\n'
        '        try { res.end(); } catch {}\n'
        '        try { res.destroy(); } catch {}\n'
        '        return;\n'
        '      }\n'
        '      return res.status(500).json({ error: String(e?.message || e) });\n'
        '    }'
    )

    # Keep indentation similar to original by reusing leading spaces from match start line
    # (good enough: we replace block verbatim)
    nonlocal_s = globals().get("_sref")
    return True, (s[:m.start()] + repl + s[m.end():])

# Hack: allow patch() to return updated string
_sref = s

ok1, s = patch("PREVIEW")
ok2, s = patch("GENERATE")

if not ok1 or not ok2:
    print("❌ Could not patch both catch blocks.")
    print(f"   PREVIEW patched: {ok1}")
    print(f"   GENERATE patched: {ok2}")
    raise SystemExit(2)

p.write_text(s, encoding="utf-8")
print("✅ Patched PREVIEW/GENERATE catch blocks: no double-send, no chunked encoding failure.")
PY
