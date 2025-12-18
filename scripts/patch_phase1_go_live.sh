#!/usr/bin/env bash
set -euo pipefail

FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

# ----------------------------
# 1) Ensure PRESETS exists (minimal, safe)
# ----------------------------
if "const PRESETS" not in s:
    # Put PRESETS near DEFAULTS if possible, else near top
    anchor = "const DEFAULTS"
    idx = s.find(anchor)
    insert_at = idx if idx != -1 else 0

    presets = """
// -------- Presets --------
const PRESETS = {
  "custom (manual)": {},
  "holiday / seasonal": { sizeKey: "small", opacity: 0.85, margin: 24, sigOff: 1 },
  "wallpaper / minimal": { sizeKey: "small", opacity: 0.80, margin: 24, sigOff: 1 },
};
"""
    s = s[:insert_at] + presets + "\n" + s[insert_at:]


# ----------------------------
# 2) Ensure applyPreset exists (global helper)
# ----------------------------
if "function applyPreset(" not in s:
    # Insert applyPreset near helpers: after clamp() if present, else after boolish, else near top
    m = re.search(r"(function\s+clamp\([^\)]*\)\s*\{[\s\S]*?\}\n)", s)
    if not m:
        m = re.search(r"(function\s+boolish\([^\)]*\)\s*\{[\s\S]*?\}\n)", s)

    insert_at = m.end(1) if m else 0

    helper = r'''
function applyPreset(body, state) {
  const preset = String(body.preset || body.preset_key || "").trim().toLowerCase();
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
    s = s[:insert_at] + helper + "\n" + s[insert_at:]


# ----------------------------
# 3) Enforce "only uploaded logo" behavior:
#    - signature OFF by default
#    - if user uploads logo => sigOff forced true
# ----------------------------
# In both preview and generate routes, find hasUserLogo and force sigOff.
def enforce_sig_rule(block):
    # Make signature_off default true (sigOff starts true unless user explicitly forces it on)
    block = re.sub(
        r"let\s+sigOff\s*=\s*String\(req\.body\.signature_off\s*\|\|\s*\"\"\)\.trim\(\)\s*===\s*\"1\";",
        "let sigOff = true; // default OFF in Phase 1 (only uploaded logo shows)\n      // If you add a UI toggle later, map it to signature_force=1",
        block
    )

    # Ensure: if hasUserLogo and not forceSig => sigOff true
    if "const forceSig" in block:
        block = re.sub(
            r"if\s*\(\s*hasUserLogo\s*&&\s*!forceSig\s*\)\s*sigOff\s*=\s*true\s*;",
            "if (hasUserLogo && !forceSig) sigOff = true;",
            block
        )
        # If it's missing entirely, add it right after forceSig line
        if "if (hasUserLogo && !forceSig)" not in block:
            block = re.sub(
                r"(const\s+forceSig[^\n]*\n)",
                r"\1      if (hasUserLogo && !forceSig) sigOff = true;\n",
                block
            )
    else:
        # If forceSig isn't present, just force sigOff when logo uploaded
        if "if (hasUserLogo)" not in block:
            block = re.sub(
                r"(const\s+hasUserLogo[^\n]*\n)",
                r"\1      if (hasUserLogo) sigOff = true;\n",
                block
            )
    return block

# Patch preview route block
s = re.sub(
    r"(app\.post\(\s*\"/api/preview\"[\s\S]*?\=\s*applyPreset\([\s\S]*?\)\s*;)",
    lambda m: enforce_sig_rule(m.group(0)),
    s,
    count=1
)

# Patch generate route block (best-effort)
s = re.sub(
    r"(app\.post\(\s*\"/api/generate\"[\s\S]*?\=\s*applyPreset\([\s\S]*?\)\s*;)",
    lambda m: enforce_sig_rule(m.group(0)),
    s,
    count=1
)

p.write_text(s, encoding="utf-8")
print("✅ Phase 1 patch applied: PRESETS + applyPreset + signature OFF-by-default + only-uploaded-logo rule")
PY
