import express from "express";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import archiver from "archiver";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());

// -------- Config --------
const PORT = process.env.PORT || 8787;

// Output sizes (Phase 1)
const SIZES = {
  facebook_feed: { w: 1200, h: 630 },
  facebook_square: { w: 1080, h: 1080 },
  instagram_square: { w: 1080, h: 1080 },
  instagram_story: { w: 1080, h: 1920 },
  pinterest: { w: 1000, h: 1500 },
  youtube_thumb: { w: 1280, h: 720 },
};

const DEFAULTS = {
  position: "bottom-right",
  size: "small",       // small | medium | large
  opacity: 0.85,       // 0.1 - 1.0
  margin: 24,
};

// -------- License Gate (Phase 1 simple) --------
// Dev bypass: BSP_DEV_BYPASS=1
// Prod key:   BSP_LICENSE_KEY (clients send header x-bsp-key)
function requireLicense(req, res, next) {
  if (process.env.BSP_DEV_BYPASS === "1") return next();

  const expected = process.env.BSP_LICENSE_KEY;
  if (!expected) {
    // If you haven't set it yet, keep server usable but visible
    return res.status(503).json({ error: "Server not configured: BSP_LICENSE_KEY missing." });
  }
  const got = req.header("x-bsp-key") || "";
  if (got !== expected) return res.status(401).json({ error: "Invalid license key." });
  next();
}

// -------- Upload --------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// -------- Helpers --------
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function sizePercent(sizeKey) {
  // percent of base width used for overlay width
  if (sizeKey === "large") return 0.34;
  if (sizeKey === "medium") return 0.26;
  return 0.18; // small
}

function computePlacement(baseW, baseH, overlayW, overlayH, position, margin) {
  const m = margin;
  const pos = (position || "bottom-right").toLowerCase().replace(/\s+/g, "-");

  let left = m;
  let top  = m;

  if (pos.includes("right"))  left = baseW - overlayW - m;
  if (pos.includes("bottom")) top  = baseH - overlayH - m;
  if (pos.includes("center")) {
    left = Math.round((baseW - overlayW) / 2);
    top  = Math.round((baseH - overlayH) / 2);
  }
  if (pos === "top-center") {
    left = Math.round((baseW - overlayW) / 2);
    top = m;
  }
  if (pos === "bottom-center") {
    left = Math.round((baseW - overlayW) / 2);
    top = baseH - overlayH - m;
  }
  if (pos === "center-left") {
    left = m;
    top = Math.round((baseH - overlayH) / 2);
  }
  if (pos === "center-right") {
    left = baseW - overlayW - m;
    top = Math.round((baseH - overlayH) / 2);
  }

  left = clamp(left, 0, baseW - overlayW);
  top  = clamp(top, 0, baseH - overlayH);
  return { left, top };
}

async function buildOverlayPng(logoBuf, targetW, opacity) {
  // Resize first -> then read metadata from the real buffer
  const basePng = await sharp(logoBuf, { failOnError: false })
    .ensureAlpha()
    .resize({ width: targetW, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(basePng).metadata();
  const w = meta.width || targetW;
  const h = meta.height || Math.round(targetW * 0.5);

  const a = clamp(parseFloat(opacity), 0.0, 1.0);
  if (a >= 0.999) return { buf: basePng, w, h };

  // Mask must match basePng dims EXACTLY
  const mask = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: a }
    }
  }).png().toBuffer();

  const withOpacity = await sharp(basePng, { failOnError: false })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return { buf: withOpacity, w, h };
}

async function renderOne({ imageBuf, logoBuf, outW, outH, position, sizeKey, opacity, margin }) {
  // 1) Fit original image into exact output size (cover)
  const base = sharp(imageBuf, { failOnError: false }).resize(outW, outH, { fit: "cover" });
  const baseMeta = await base.metadata();
  const baseW = baseMeta.width || outW;
  const baseH = baseMeta.height || outH;

  // 2) Overlay size as percent of base width
  const pct = sizePercent(sizeKey);
  const targetLogoW = Math.max(64, Math.round(baseW * pct));

  // 3) Create overlay PNG with opacity applied
  const overlay = await buildOverlayPng(logoBuf, targetLogoW, opacity);

  // 4) Placement
  const { left, top } = computePlacement(baseW, baseH, overlay.w, overlay.h, position, margin);

  // 5) Composite
  const out = await base
    .composite([{ input: overlay.buf, left, top }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return out;
}

function tsStamp() {
  // YYYY-MM-DD_HH-MM in local-ish (still stable)
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}`;
}

// -------- Static UI --------
app.use("/public", express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => res.json({ ok: true }));

// -------- Preview (Phase 1) --------
// returns ONE PNG preview: Facebook 1200x630
app.post(
  "/api/preview",
  requireLicense,
  upload.fields([{ name: "image" }, { name: "logo" }]),
  async (req, res) => {
    try {
      const image = req.files?.image?.[0];
      const logo  = req.files?.logo?.[0];
      if (!image || !logo) return res.status(400).json({ error: "Missing image or logo upload." });

      const position = req.body.position || DEFAULTS.position;
      const sizeKey  = req.body.size || DEFAULTS.size;
      const opacity  = clamp(parseFloat(req.body.opacity ?? DEFAULTS.opacity), 0.1, 1.0);
      const margin   = clamp(parseInt(req.body.margin ?? DEFAULTS.margin, 10), 0, 200);

      const { w, h } = SIZES.facebook_feed;

      // Render output JPG, then convert to PNG for easy browser preview
      const jpg = await renderOne({
        imageBuf: image.buffer,
        logoBuf: logo.buffer,
        outW: w,
        outH: h,
        position,
        sizeKey,
        opacity,
        margin,
      });

      const png = await sharp(jpg).png().toBuffer();

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(png);
    } catch (e) {
      console.error("PREVIEW ERROR:", e);
      res.status(500).json({ error: "Preview failed." });
    }
  }
);

// -------- Generate ZIP (Phase 1) --------
app.post(
  "/api/generate",
  requireLicense,
  upload.fields([{ name: "image" }, { name: "logo" }]),
  async (req, res) => {
    try {
      const image = req.files?.image?.[0];
      const logo  = req.files?.logo?.[0];
      if (!image || !logo) return res.status(400).json({ error: "Missing image or logo upload." });

      const position = req.body.position || DEFAULTS.position;
      const sizeKey  = req.body.size || DEFAULTS.size;
      const opacity  = clamp(parseFloat(req.body.opacity ?? DEFAULTS.opacity), 0.1, 1.0);
      const margin   = clamp(parseInt(req.body.margin ?? DEFAULTS.margin, 10), 0, 200);

      const stamp = tsStamp();
      const zipName = `bayou-social-pack_${stamp}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", (err) => { throw err; });
      archive.pipe(res);

      // Render each output and add to zip
      const jobs = [
        ["facebook_1200x630.jpg",    SIZES.facebook_feed],
        ["facebook_1080x1080.jpg",   SIZES.facebook_square],
        ["instagram_1080x1080.jpg",  SIZES.instagram_square],
        ["instagram_story_1080x1920.jpg", SIZES.instagram_story],
        ["pinterest_1000x1500.jpg",  SIZES.pinterest],
        ["youtube_1280x720.jpg",     SIZES.youtube_thumb],
      ];

      for (const [name, dim] of jobs) {
        const buf = await renderOne({
          imageBuf: image.buffer,
          logoBuf: logo.buffer,
          outW: dim.w,
          outH: dim.h,
          position,
          sizeKey,
          opacity,
          margin,
        });
        archive.append(buf, { name });
      }

      await archive.finalize();
    } catch (e) {
      console.error("GENERATE ERROR:", e);
      res.status(500).json({ error: "ZIP generation failed." });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Bayou Social Pack running -> http://localhost:${PORT}`);
});
