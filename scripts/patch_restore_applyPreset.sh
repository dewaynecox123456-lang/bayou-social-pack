#!/usr/bin/env bash
set -euo pipefail
FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

if "function applyPreset(" in s:
    print("✅ applyPreset already exists (no change).")
    raise SystemExit(0)

# Insert applyPreset right before the first call to applyPreset(
m = re.search(r'^\s*\(\{\s*sizeKey,\s*opacity,\s*margin,\s*sigOff\s*\}\s*=\s*applyPreset\(', s, re.M)
if not m:
    # fallback: any applyPreset(
    m = re.search(r'^\s*.*applyPreset\(', s, re.M)
if not m:
    raise SystemExit("❌ Could not find applyPreset(...) call site.")

insert_at = m.start()

snippet = r'''
function applyPreset(body, state) {
  // Preset name can come from UI as preset/preset_key
  const preset = String(body.preset || body.preset_key || "").trim().toLowerCase();
  // Expect PRESETS to exist; if not, just no-op safely
  const p = (typeof PRESETS !== "undefined" && PRESETS) ? (PRESETS[preset] || null) : null;
  if (!p) return state;

  const out = { ...state };
  if (p.sizeKey != null) out.sizeKey = p.sizeKey;
  if (p.opacity != null) out.opacity = p.opacity;
  if (p.margin != null) out.margin = p.margin;
  if (p.sigOff != null) out.sigOff = boolish(p.sigOff, out.sigOff);
  return out;
}
'''

s2 = s[:insert_at] + snippet + s[insert_at:]
p.write_text(s2, encoding="utf-8")
print("✅ Inserted applyPreset()")
PY
