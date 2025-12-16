#!/usr/bin/env python3
import re
from pathlib import Path

p = Path("server.js")
s = p.read_text(encoding="utf-8")

if "applyPreset(req.body" in s:
  print("[patch_apply_preset] applyPreset already wired. No changes.")
  raise SystemExit(0)

# Anchor: right after sigText2 definition
anchor = r'const sigText2 = \(req\.body\.signature_text2 \|\| "bayoufinds\.com"\)\.toString\(\)\.trim\(\);\s*\n'
m = re.search(anchor, s)
if not m:
  raise SystemExit("[patch_apply_preset] Could not find sigText2 anchor. Paste lines around sigText1/sigText2 and I'll adjust.")

insert = (
  "\n"
  "      // Apply preset overrides (size/opacity/margin/signature_off)\n"
  "      ({ sizeKey, opacity, margin, sigOff } = applyPreset(req.body, { sizeKey, opacity, margin, sigOff }));\n"
)

s2 = s[:m.end()] + insert + s[m.end():]
p.write_text(s2, encoding="utf-8")
print("[patch_apply_preset] Wired applyPreset into /api/generate.")
