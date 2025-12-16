#!/usr/bin/env python3
import re
from pathlib import Path

p = Path("server.js")
s = p.read_text(encoding="utf-8")

if "function buildAutoPostPack(" in s:
  print("[patch_autopost] already present")
  raise SystemExit(0)

block = r"""
// -------- Auto-Post Pack (Automation) --------
function buildAutoPostPack({ preset, topic, brand }) {
  const safeTopic = (topic || "").toString().trim();
  const p = (preset || "").toString().trim().toLowerCase() || "wallpaper";
  const b = (brand || "BayouFinds.com").toString().trim();

  const headline =
    safeTopic ? safeTopic :
    (p === "recipe" ? "Tonight’s comfort food is calling." :
     p === "promo" ? "New drop — ready to post." :
     "Daily bayou calm — take a breath.");

  const fb = `${headline}\n\nBuilt with our Bayou Social Pack — one upload → post-ready assets + captions.\n\n— ${b}`;
  const ig = `${headline}\n\n#BayouFinds #SouthernLiving #Louisiana #CozyVibes #SmallBusiness`;
  const pin = `${headline} — cozy Southern inspiration, warm lighting, and bayou vibes.`;
  const yt = `${headline}\n\nMade with Bayou Social Pack.`;

  const captions = `FACEBOOK\n${fb}\n\nINSTAGRAM\n${ig}\n\nPINTEREST\n${pin}\n\nYOUTUBE\n${yt}\n`;

  const seo = [
    "bayou finds",
    "louisiana",
    "southern living style",
    "cozy aesthetic",
    p === "recipe" ? "recipe card" : "wallpaper",
    p === "promo" ? "brand automation" : "daily inspiration",
    safeTopic || "bayou vibes"
  ].filter(Boolean).join(", ");

  const alt = safeTopic
    ? `${safeTopic}. Warm, cozy, Southern-inspired image with BayouFinds branding.`
    : `Warm, cozy Southern-inspired image with BayouFinds branding.`;

  return { captions, seo, alt };
}
""".lstrip("\n")

# Insert near helpers section (after clamp/sizePercent is fine)
m = re.search(r"function\s+sizePercent\([^\)]*\)\s*\{", s)
if not m:
  raise SystemExit("[patch_autopost] couldn't find helper anchor (sizePercent).")

# Insert block right after sizePercent() function ends (first closing brace after it)
tail = s[m.start():]
end = re.search(r"^\}\s*$", tail, flags=re.M)
if not end:
  raise SystemExit("[patch_autopost] couldn't find end of sizePercent()")

insert_at = m.start() + end.end()

s2 = s[:insert_at] + "\n\n" + block + s[insert_at:]
p.write_text(s2, encoding="utf-8")
print("[patch_autopost] inserted buildAutoPostPack()")
