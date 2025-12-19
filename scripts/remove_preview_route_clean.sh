#!/usr/bin/env bash
set -euo pipefail
FILE="server.js"
cp -av "$FILE" "$FILE.bak.rm_preview.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

# Find preview route start
m_start = re.search(r'app\.post\(\s*"/api/preview"\s*,', s)
if not m_start:
    raise SystemExit("❌ Could not find app.post(\"/api/preview\", ...) in server.js")

start = m_start.start()

# Find the next route after preview (usually generate)
# Prefer /api/generate, but fall back to next app.post("/api/
m_next = re.search(r'app\.post\(\s*"/api/(generate|generate-pack|generate_zip|zip|pack)"\s*,', s[m_start.end():])
if m_next:
    end = m_start.end() + m_next.start()
else:
    # Fallback: next /api route of any kind
    m_any = re.search(r'app\.(get|post)\(\s*"/api/', s[m_start.end():])
    if not m_any:
        raise SystemExit("❌ Could not find a following /api route to anchor removal.")
    end = m_start.end() + m_any.start()

removed = s[start:end]
if removed.count("catch") == 0:
    # still fine; just informational
    pass

replacement = (
    "/* /api/preview removed (ZIP-only mode). Preview was causing instability. */\n\n"
)
s2 = s[:start] + replacement + s[end:]

p.write_text(s2, encoding="utf-8")
print("✅ Removed /api/preview route block cleanly.")
PY
