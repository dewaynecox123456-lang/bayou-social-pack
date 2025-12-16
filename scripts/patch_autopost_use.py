#!/usr/bin/env python3
import re
from pathlib import Path

p = Path("server.js")
s = p.read_text(encoding="utf-8")

if "buildAutoPostPack({" in s:
  print("[patch_autopost_use] already wired")
  raise SystemExit(0)

# Find your metadata block in /api/generate (we look for altText assignment line)
m = re.search(r'const altText\s*=\s*\(req\.body\.alt_text', s)
if not m:
  raise SystemExit("[patch_autopost_use] couldn't find altText assignment in generate metadata block")

inject = r"""      const presetKey = (req.body.preset || "").toString().trim().toLowerCase();
      const topic = (req.body.topic || "").toString().trim();
      const brand = "BayouFinds.com";

      const ap = buildAutoPostPack({ preset: presetKey, topic, brand });

"""

s2 = s[:m.start()] + inject + s[m.start():]

# Now update altText/seoText/captionsText to prefer ap.* if topic/preset provided
s2 = re.sub(
  r'const altText\s*=\s*\([^\n]+\)\.toString\(\)\.trim\(\);\n',
  '      const altText = (topic || presetKey) ? ap.alt : (req.body.alt_text || req.body.alt || "Warm Louisiana bayou scene with a softly lit home, calm water reflections, and a cozy Southern evening atmosphere.").toString().trim();\n',
  s2, count=1
)
s2 = re.sub(
  r'const seoText\s*=\s*\([^\n]+\)\.toString\(\)\.trim\(\);\n',
  '      const seoText = (topic || presetKey) ? ap.seo : (req.body.seo || req.body.tags || "bayou finds, louisiana lifestyle, southern living style, cozy bayou home, farmhouse aesthetic, inspirational wallpaper, daily inspiration, rustic southern, bayou night, warm home lights").toString().trim();\n',
  s2, count=1
)
# captionsText is multiline; replace the whole assignment block
s2 = re.sub(
  r'const captionsText\s*=\s*\(req\.body\.captions\s*\|\|[\s\S]*?\)\.toString\(\)\.trim\(\);\n',
  '      const captionsText = (topic || presetKey) ? ap.captions : (req.body.captions || `FACEBOOK\\nFrom our bayou to yours — slow down, breathe deep, and enjoy the quiet beauty of a Southern evening. 🌿✨\\n— BayouFinds.com\\n\\nINSTAGRAM\\nCozy bayou vibes. Slow living done right. 🌙✨\\n#BayouLife #SouthernLiving #Louisiana\\n\\nPINTEREST\\nCozy Louisiana bayou home with warm lights and calm water — perfect Southern living inspiration.\\n\\nYOUTUBE\\nA peaceful Southern bayou evening — slow down and enjoy the view.`).toString().trim();\n',
  s2, count=1
)

p.write_text(s2, encoding="utf-8")
print("[patch_autopost_use] wired Auto-Post Pack into metadata files")
