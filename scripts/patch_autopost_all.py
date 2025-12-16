#!/usr/bin/env python3
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

changed = False

# ------------------------------------------------------------
# 1) Insert buildAutoPostPack() near helpers (after clamp/sizePercent area)
# ------------------------------------------------------------
if "function buildAutoPostPack(" not in s:
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

  const captions =
`FACEBOOK
${headline}

Built with Bayou Social Pack — one upload → post-ready assets + captions.
— ${b}

INSTAGRAM
${headline}

#BayouFinds #SouthernLiving #Louisiana #CozyVibes #SmallBusiness

PINTEREST
${headline} — cozy Southern inspiration and bayou vibes.

YOUTUBE
${headline}

Made with Bayou Social Pack.
`;

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

  const readme =
`Bayou Social Pack — Auto-Post Export Bundle

What’s inside:
- Platform-sized images (Facebook, Instagram, Pinterest, YouTube)
- captions.txt (post copy)
- seo.txt (tags/keywords)
- alt-text.txt (accessibility text)
- manifest.json (pack details)

How to use:
1) Pick the image for your platform
2) Paste the matching caption
3) Use SEO tags where supported
4) Add alt text on Facebook/IG

Brand: ${b}
`;

  const license =
`BAYOU SOCIAL PACK LICENSE (Commercial Use)

You MAY:
- Use these images for personal or commercial marketing posts (social media, websites, email).
- Edit/crop/resize for your own content.

You MAY NOT:
- Resell, redistribute, or repackage the files as a standalone product.
- Claim the artwork or pack as your own.

Copyright © ${new Date().getFullYear()} ${b}. All rights reserved.
`;

  return { captions, seo, alt, readme, license };
}
""".lstrip("\n")

    # Anchor: after the clamp helper (common stable spot)
    m = re.search(r"function\s+clamp\s*\([^\)]*\)\s*\{", s)
    if not m:
        raise SystemExit("[patch] Could not find clamp() helper anchor in server.js")

    # Insert after clamp() ends (first line with only "}" after clamp)
    tail = s[m.start():]
    end = re.search(r"^\}\s*$", tail, flags=re.M)
    if not end:
        raise SystemExit("[patch] Could not find end of clamp()")

    insert_at = m.start() + end.end()
    s = s[:insert_at] + "\n\n" + block + s[insert_at:]
    changed = True

# ------------------------------------------------------------
# 2) Inject archive.append(...) for captions/seo/alt/manifest/license/readme
#    right before: await archive.finalize();
# ------------------------------------------------------------
if "captions.txt" not in s and "alt-text.txt" not in s and "seo.txt" not in s:
    anchor = "await archive.finalize();"
    idx = s.find(anchor)
    if idx == -1:
        raise SystemExit("[patch] Could not find 'await archive.finalize();' in generate route")

    inject = r"""
      // ------------------------------------------------------
      // Auto-Post Pack files (captions/seo/alt/license/readme/manifest)
      // ------------------------------------------------------
      const presetKey = (req.body.preset || "").toString().trim().toLowerCase();
      const topic = (req.body.topic || "").toString().trim();
      const brand = "BayouFinds.com";

      const ap = buildAutoPostPack({ preset: presetKey, topic, brand });

      const manifest = {
        brand,
        preset: presetKey || "wallpaper",
        topic: topic || "",
        generated_at: new Date().toISOString(),
        outputs: jobs.map(j => j[0]),
        watermark: { position, size: sizeKey, opacity: Number(opacity), margin: Number(margin) }
      };

      archive.append(Buffer.from(ap.captions + "\n", "utf8"), { name: "captions.txt" });
      archive.append(Buffer.from(ap.seo + "\n", "utf8"), { name: "seo.txt" });
      archive.append(Buffer.from(ap.alt + "\n", "utf8"), { name: "alt-text.txt" });
      archive.append(Buffer.from(ap.license + "\n", "utf8"), { name: "license.txt" });
      archive.append(Buffer.from(ap.readme + "\n", "utf8"), { name: "README.txt" });
      archive.append(Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"), { name: "manifest.json" });

""".lstrip("\n")

    s = s[:idx] + inject + s[idx:]
    changed = True

p.write_text(s, encoding="utf-8")

if changed:
    print("[patch_autopost_all] patched server.js ✅")
else:
    print("[patch_autopost_all] nothing to change (already patched) ✅")
