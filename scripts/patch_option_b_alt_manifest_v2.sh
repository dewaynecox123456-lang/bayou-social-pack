#!/usr/bin/env bash
set -euo pipefail

FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re, json

p = Path("server.js")
s = p.read_text(encoding="utf-8")

# ---- Insert ALT helper right after EMPTY_PNG block (reliable anchor) ----
if "function makeAltTextFor(" not in s:
    m = re.search(r"(const EMPTY_PNG = Buffer\.from\([\s\S]*?\);\n)", s)
    if not m:
        raise SystemExit("Could not find EMPTY_PNG block anchor. Paste lines ~80-110 of server.js.")
    helper = m.group(1) + """
// -------- ALT Helper (Option B) --------
function makeAltTextFor(fileName, baseAlt) {
  // Keep ALT clean: one sentence, human-readable, no keyword stuffing.
  const clean = String(baseAlt || "Warm, cozy Southern-inspired image with BayouFinds branding.")
    .trim()
    .replace(/\\s+/g, " ");

  const map = {
    "facebook_1200x630.jpg": "Optimized for Facebook sharing (1200×630).",
    "instagram_1080x1080.jpg": "Optimized for Instagram feed (1080×1080).",
    "instagram_story_1080x1920.jpg": "Optimized for Instagram Story (1080×1920).",
    "pinterest_1000x1500.jpg": "Optimized for Pinterest pin (1000×1500).",
  };

  const suffix = map[fileName] || "";
  return suffix ? `${clean} ${suffix}` : clean;
}

"""
    s = s.replace(m.group(1), helper)

# ---- Inject Option B packaging into the Auto-Post Pack section ----
anchor = "// Auto-Post Pack files (captions/seo/alt/license/readme/manifest)"
if anchor not in s:
    raise SystemExit("Could not find Auto-Post Pack section anchor. Search for 'Auto-Post Pack files' and paste that block.")

if "alt-facebook_1200x630.txt" not in s:
    injection = """
      // -------- Option B: Per-image ALT files + manifest --------
      const baseAlt = String(req.body.alt_text || req.body.alt || "Warm, cozy Southern-inspired image with BayouFinds branding.").trim();

      // Expected output image filenames in this pack (keep in sync with actual names)
      const packFiles = [
        "facebook_1200x630.jpg",
        "instagram_1080x1080.jpg",
        "instagram_story_1080x1920.jpg",
        "pinterest_1000x1500.jpg",
      ];

      // Emit per-image ALT files (Option B)
      const altByFile = {};
      for (const fn of packFiles) {
        const alt = makeAltTextFor(fn, baseAlt);
        altByFile[fn] = alt;
        archive.append(Buffer.from(alt + "\\n", "utf8"), { name: `alt-${fn.replace(/\\.jpg$/i, "")}.txt` });
      }

      // Keep legacy alt-text.txt for backwards compatibility (generic)
      archive.append(Buffer.from(makeAltTextFor(packFiles[0], baseAlt) + "\\n", "utf8"), { name: "alt-text.txt" });

      // SEO tags (single list)
      const seoTagsRaw = String(req.body.seo || req.body.seo_tags || "").trim();
      const seoTags = seoTagsRaw
        ? seoTagsRaw.split(",").map(s => s.trim()).filter(Boolean)
        : [];

      // Machine-readable manifest for future automation
      const optionBManifest = {
        generated_at: new Date().toISOString(),
        files: Object.fromEntries(packFiles.map(fn => [fn, { alt: altByFile[fn], seo_tags: seoTags }])),
      };

      archive.append(Buffer.from(JSON.stringify(optionBManifest, null, 2) + "\\n", "utf8"), { name: "manifest.json" });

"""

    # Insert immediately after the anchor comment line (first occurrence)
    s = s.replace(anchor, anchor + "\n" + injection)

p.write_text(s, encoding="utf-8")
print("✅ Patched Option B: per-image ALT files + manifest.json")
PY
