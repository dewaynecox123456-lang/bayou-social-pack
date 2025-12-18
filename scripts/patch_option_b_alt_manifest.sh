#!/usr/bin/env bash
set -euo pipefail

FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
import re, pathlib, json
p = pathlib.Path("server.js")
s = p.read_text(encoding="utf-8")

# 1) Insert helper function near other helpers (after escapeXml or near helpers section)
helper_anchor = r"function escapeXml\(s\) {"
if helper_anchor not in s:
    raise SystemExit("Could not find escapeXml() anchor. Tell me where helpers start in server.js.")

if "function makeAltTextFor(" not in s:
    insert = r"""
function makeAltTextFor(fileName, baseAlt) {
  // Keep ALT clean: one sentence, human-readable, no keyword stuffing.
  const clean = String(baseAlt || "Warm, cozy Southern-inspired image with BayouFinds branding.").trim().replace(/\s+/g, " ");
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
    s = s.replace(helper_anchor, helper_anchor + insert)

# 2) Patch ZIP packaging section:
# We look for the comment you already have:
anchor = "// Auto-Post Pack files (captions/seo/alt/license/readme/manifest)"
if anchor not in s:
    raise SystemExit("Could not find Auto-Post Pack section. Search server.js for 'Auto-Post Pack files' and paste that block.")

# Replace single alt-text append (if present) with per-image alt files + manifest enrichment.
# We do this safely by injecting after the anchor line.
inject_marker = anchor + "\n"
if "alt-facebook_1200x630.txt" not in s:
    inject = r"""
      // -------- Option B: Per-image ALT files + manifest --------
      const baseAlt = String(req.body.alt_text || req.body.alt || "Warm, cozy Southern-inspired image with BayouFinds branding.").trim();

      // List the expected output image filenames in this pack.
      // NOTE: Keep in sync with the actual output file names used later in the archive.
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
        archive.append(Buffer.from(alt + "\n", "utf8"), { name: `alt-${fn.replace(/\.jpg$/i, "")}.txt` });
      }

      // Keep legacy alt-text.txt for backwards compatibility (generic)
      archive.append(Buffer.from(makeAltTextFor(packFiles[0], baseAlt) + "\n", "utf8"), { name: "alt-text.txt" });

      // Merge into manifest (if manifest already exists later, this will get overwritten correctly if you append again)
      const seoTagsRaw = String(req.body.seo || req.body.seo_tags || "").trim();
      const seoTags = seoTagsRaw
        ? seoTagsRaw.split(",").map(s => s.trim()).filter(Boolean)
        : [];

      const optionBManifest = {
        generated_at: new Date().toISOString(),
        files: Object.fromEntries(packFiles.map(fn => [fn, { alt: altByFile[fn], seo_tags: seoTags }])),
      };

      archive.append(Buffer.from(JSON.stringify(optionBManifest, null, 2) + "\n", "utf8"), { name: "manifest.json" });
"""
    s = s.replace(inject_marker, inject_marker + inject)

p.write_text(s, encoding="utf-8")
print("✅ Patched Option B: per-image ALT files + manifest.json emission.")
PY

echo "✅ Done. Backup created."
