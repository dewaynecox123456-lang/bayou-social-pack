import express from "express";
import multer from "multer";
import sharp from "sharp";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ---- Image normalization (makes "weird" PNG/JPG uploads work reliably) ----
async function normalizeImage(buffer) {
  return sharp(buffer, { failOnError: false })
    .rotate()
    .toColorspace("srgb")
    .png({ force: true, compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

app.use(express.static("public"));

const FORMATS = [
  { name: "facebook_1200x630", w: 1200, h: 630 },
  { name: "instagram_1080x1080", w: 1080, h: 1080 },
  { name: "story_1080x1920", w: 1080, h: 1920 },
  { name: "pinterest_1000x1500", w: 1000, h: 1500 },
  { name: "youtube_1280x720", w: 1280, h: 720 }
];

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function computeLogoBox(canvasW, canvasH, sizePreset) {
  // "tiny" by default: ~10% of width, capped
  const pct = sizePreset === "small" ? 0.10 : sizePreset === "medium" ? 0.14 : 0.10;
  const maxW = Math.round(canvasW * pct);
  const maxH = Math.round(canvasH * 0.18);
  return { maxW, maxH };
}

function computeLogoPlacement(canvasW, canvasH, logoW, logoH, position, margin) {
  const m = margin;
  let left = m, top = m;

  if (position.includes("right")) left = canvasW - logoW - m;
  if (position.includes("bottom")) top = canvasH - logoH - m;

  return { left: clamp(left, 0, canvasW - logoW), top: clamp(top, 0, canvasH - logoH) };
}

app.post(
  "/api/generate",
  upload.fields([{ name: "image", maxCount: 1 }, { name: "logo", maxCount: 1 }]),
  async (req, res) => {
    try {
      const imageFile = req.files?.image?.[0];
      const logoFile = req.files?.logo?.[0];

      if (!imageFile) return res.status(400).send("Missing image upload.");
      if (!logoFile) return res.status(400).send("Missing logo upload.");

      // Normalize uploads so Sharp can handle odd/dirty PNG/JPG files
      let imageBuf = await normalizeImage(imageFile.buffer);
      let logoBuf  = await normalizeImage(logoFile.buffer);

      const position = String(req.body.position || "bottom-right");
      const sizePreset = String(req.body.size || "small"); // small | medium
      const opacity = clamp(parseFloat(req.body.opacity ?? "0.85"), 0.1, 1.0);
      const margin = clamp(parseInt(req.body.margin ?? "24", 10), 0, 120);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bayou-pack-"));
      const outDir = path.join(tmpDir, "out");
      fs.mkdirSync(outDir, { recursive: true });

      // Preload logo once
      const logoInput = sharp(logoBuf, { failOnError: false }).ensureAlpha();
      const logoMeta = await logoInput.metadata();
      if (!logoMeta.width || !logoMeta.height) throw new Error("Logo image could not be read.");

      for (const f of FORMATS) {
        // Resize base with cover (crop) to exact aspect ratio
        const base = sharp(imageBuf, { failOnError: false }).resize(f.w, f.h, { fit: "cover", position: "center" });

        // Compute logo size within constraints
        const { maxW, maxH } = computeLogoBox(f.w, f.h, sizePreset);
        const logoResized = sharp(logoBuf, { failOnError: false })
          .ensureAlpha()
          .resize({ width: maxW, height: maxH, fit: "inside" });

        const lm = await logoResized.metadata();
        const lw = lm.width || maxW;
        const lh = lm.height || maxH;

        const posKey =
          position === "bottom-right" ? "bottom-right" :
          position === "bottom-left" ? "bottom-left" :
          position === "top-right" ? "top-right" : "top-left";

        const { left, top } = computeLogoPlacement(
          f.w, f.h, lw, lh,
          posKey.replace("-", " "),
          margin
        );

        // Apply opacity by compositing through a transparent PNG layer
        const logoPng = await logoResized.png().toBuffer();
        const logoWithOpacity = await sharp(logoPng)
          .ensureAlpha()
          .composite([{ input: Buffer.from([0]), blend: "dest-in" }])
          .png()
          .toBuffer();

        // Sharp doesn't have direct "opacity" per input for composite in all versions;
        // use SVG wrapper to apply opacity reliably.
        const svg = Buffer.from(`
          <svg width="${lw}" height="${lh}" xmlns="http://www.w3.org/2000/svg">
            <image href="data:image/png;base64,${logoPng.toString("base64")}" width="${lw}" height="${lh}" opacity="${opacity}"/>
          </svg>
        `);

        const outPath = path.join(outDir, `${f.name}.jpg`);
        await base
          .composite([{ input: svg, left, top }])
          .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
          .toFile(outPath);
      }

      // Stream ZIP
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="social_pack_${crypto.randomBytes(4).toString("hex")}.zip"`
      );

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", err => { throw err; });
      archive.pipe(res);

      for (const f of FORMATS) {
        archive.file(path.join(outDir, `${f.name}.jpg`), { name: `${f.name}.jpg` });
      }

      archive.finalize();

      // Cleanup after response finishes
      res.on("finish", () => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      });

    } catch (e) {
      console.error(e);
      res.status(500).send(`Error: ${e.message || "Unknown"}`);
    }
  }
);

app.listen(8787, () => {
  console.log("Bayou Social Pack running → http://localhost:8787");
});
