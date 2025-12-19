#!/usr/bin/env bash
set -euo pipefail
FILE="server.js"
cp -av "$FILE" "$FILE.bak.rebuild_generate.$(date +%F_%H%M%S)"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")

# Find the start of the generate route
m_start = re.search(r'app\.post\(\s*"/api/generate"\s*,', s)
if not m_start:
    raise SystemExit("❌ Could not find app.post(\"/api/generate\", ...)")

start = m_start.start()

# Find the end of this route: the next ");" after start that closes app.post(...)
# We’ll anchor to the next "app.listen(" as a reliable boundary.
m_end = re.search(r'\napp\.listen\(', s[m_start.end():])
if not m_end:
    raise SystemExit("❌ Could not find app.listen(...) to anchor end of generate route.")
end = m_start.end() + m_end.start()

replacement = r'''
app.post(
  "/api/generate",
  requireLicense,
  upload.fields([{ name: "image" }, { name: "logo" }]),
  async (req, res) => {
    try {
      const image = req.files?.image?.[0];
      const logo  = req.files?.logo?.[0];
      if (!image) return res.status(400).json({ error: "Missing image upload." });

      const position = req.body.position || DEFAULTS.position;
      let sizeKey  = req.body.size || DEFAULTS.size;
      let opacity  = clamp(parseFloat(req.body.opacity ?? DEFAULTS.opacity), 0.1, 1.0);
      let margin   = clamp(parseInt(req.body.margin ?? DEFAULTS.margin, 10), 0, 200);
      const safeCrop = String(req.body.safe_crop || "").trim().toLowerCase() in ("1","on","true","yes");

      // ZIP-only mode: ONLY apply uploaded logo; NO built-in signature; NO extra metadata files
      const logoBuf = (logo && logo.buffer) ? logo.buffer : EMPTY_PNG;

      const stamp = tsStamp();
      const zipName = `bayou-social-pack_${stamp}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", (err) => { throw err; });
      archive.pipe(res);

      const profileKey = getProfileKey(req.body);
      const jobs = PROFILES[profileKey];

      for (const [name, dim] of jobs) {
        const baseImageBuf = safeCrop
          ? await sharp(image.buffer)
              .resize(dim.w, dim.h, { fit: "cover", position: "centre" })
              .jpeg({ quality: 92 })
              .toBuffer()
          : image.buffer;

        const outJpg = await renderOne({
          imageBuf: baseImageBuf,
          logoBuf: logoBuf,
          outW: dim.w,
          outH: dim.h,
          position,
          sizeKey,
          opacity,
          margin,
        });

        archive.append(outJpg, { name: `${name}.jpg` });
      }

      await archive.finalize();
    } catch (e) {
      console.error("GENERATE ERROR:", e);
      // If headers already started streaming, we cannot send JSON safely.
      if (!res.headersSent) res.status(500).json({ error: "ZIP generation failed." });
    }
  }
);

'''

s2 = s[:start] + replacement + s[end:]
p.write_text(s2, encoding="utf-8")
print("✅ Rebuilt /api/generate as ZIP-only stable route (no signature/metadata).")
PY
