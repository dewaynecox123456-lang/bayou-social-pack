import express from "express";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import archiver from "archiver";
import path from "path";
import { fileURLToPath } from "url";

import fs from "fs";
import registerCopyRoutes from "./routes/copy.mjs";
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// Serve static frontend (public/)
app.use(express.static(path.join(__dirname, "public")));

app.use(cors());

app.use(express.json({ limit: "2mb" }));
registerCopyRoutes(app);

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

// ------------------------------------------------------
// Output Profiles (Social vs Print/Puzzle)
// ------------------------------------------------------
const PRINT_SIZES = {
  // 8.38" x 11.89" @ 300 DPI (print-ready)
  puzzle_8p38x11p89_300dpi: { w: 2514, h: 3567 },
};

const PROFILES = {
  social: [
    ["facebook_1200x630.jpg",         SIZES.facebook_feed],
    ["facebook_1080x1080.jpg",        SIZES.facebook_square],
    ["instagram_1080x1080.jpg",       SIZES.instagram_square],
    ["instagram_story_1080x1920.jpg", SIZES.instagram_story],
    ["pinterest_1000x1500.jpg",       SIZES.pinterest],
    ["youtube_1280x720.jpg",          SIZES.youtube_thumb],
  ],
  puzzle: [
    ["puzzle_2514x3567.jpg", PRINT_SIZES.puzzle_8p38x11p89_300dpi],
  ],
};

function getProfileKey(reqBody) {
  const k = String(reqBody.profile || reqBody.output_profile || "social").trim().toLowerCase();
  return PROFILES[k] ? k : "social";
}


// -------- License Gate (Phase 1 simple) --------
// Dev bypass: BSP_DEV_BYPASS=1
// Prod key:   BSP_LICENSE_KEY (clients send header x-bsp-key)
function requireLicense(req, res, next) {
  if (process.env.BSP_DEV_BYPASS === "1") return next();

  const expected = process.env.BSP_LICENSE_KEY;
  if (!expected) {
    // If you haven't set it yet, keep server usable but visible
    return res.status(200).json({ ok: false, mode: "free", error: "ZIP generation is disabled in Free Mode (BSP_LICENSE_KEY missing).", hint: "This is expected. Use Generate a Post for captions/hashtags/ALT at no cost." });
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
// 1x1 transparent PNG (fallback when no logo is uploaded)
const EMPTY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6VYk7sAAAAASUVORK5CYII=",
  "base64"
);

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Payhip-style: gold + soft shadow, bottom-right, two lines
function makeGoldSignatureSvg({ w, h, text1, text2 }) {
  const pad = 24;
  const t1 = escapeXml(text1);
  const t2 = escapeXml(text2);

  // adaptive sizes
  const fs1 = Math.round(Math.max(18, Math.min(30, w * 0.022)));
  const fs2 = Math.round(Math.max(14, Math.min(22, w * 0.016)));

  const y2 = h - pad;
  const y1 = y2 - Math.round(fs2 * 1.35);

  return Buffer.from(
`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.50)"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <text x="${w - pad}" y="${y1}"
      text-anchor="end"
      font-family="Georgia, 'Times New Roman', serif"
      font-size="${fs1}"
      font-style="italic"
      fill="#d6b25e"
      opacity="0.98">${t1}</text>
    <text x="${w - pad}" y="${y2}"
      text-anchor="end"
      font-family="Georgia, 'Times New Roman', serif"
      font-size="${fs2}"
      fill="#d6b25e"
      opacity="0.95">${t2}</text>
  </g>
</svg>`,
  "utf8"
  );
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function sizePercent(sizeKey) {
  // percent of base width used for overlay width
  if (sizeKey === "large") return 0.34;
  if (sizeKey === "medium") return 0.26;
  return 0.18; // small
}


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
/* PREVIEW DISABLED (ZIP-only mode)
/* /api/preview removed (ZIP-only mode). Preview was causing instability. */


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
      const safeCrop = ["1","on","true","yes"].includes(String(req.body.safe_crop || "").trim().toLowerCase());

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


// ------------------------------------------------------
// Free Mode: placeholder preview + friendly generate response
// ------------------------------------------------------
const FREE_MODE_PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8p0l8AAAAASUVORK5CYII=",
  "base64"
);

// Some older UI builds call GET /api/preview to render an image.
// Return a tiny PNG so the UI doesn't 404 spam the console.


// ------------------------------------------------------
// Real Preview (Free + Paid): render a single PNG from uploaded image/logo.
// No license required. No OpenAI required. Zero cost.
// Fields expected from UI FormData: image, logo (optional), variant (optional)
// ------------------------------------------------------
app.post("/api/preview", async (req, res) => {
  try {
    const { default: multer } = await import("multer");
    const { default: sharp } = await import("sharp");

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 } // 15MB
    });

    upload.fields([
      { name: "image", maxCount: 1 },
      { name: "logo",  maxCount: 1 },
      { name: "watermark", maxCount: 1 }
    ])(req, res, async (err) => {
      if (err) return res.status(400).json({ ok: false, error: err.message });

      const img = req.files?.image?.[0];
      if (!img) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(FREE_MODE_PLACEHOLDER_PNG);
      }

      const variant = String(req.body?.variant || req.query?.variant || "facebook").toLowerCase();
      const presets = {
        facebook:  { w: 1200, h: 630 },
        linkedin:  { w: 1200, h: 627 },
        x:         { w: 1600, h: 900 },
        instagram: { w: 1080, h: 1080 },
        story:     { w: 1080, h: 1920 }
      };
      const { w, h } = presets[variant] || presets.facebook;

      // Base image
      let baseBuf = await sharp(img.buffer)
        .resize(w, h, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();

      // Optional logo bottom-right
      const logoFile = req.files?.logo?.[0] || req.files?.watermark?.[0];
      if (logoFile) {
        const pad = Math.round(Math.min(w, h) * 0.03);
        const logoMaxW = Math.round(w * 0.22);
        const logoMaxH = Math.round(h * 0.22);

        const logoBuf = await sharp(logoFile.buffer)
          .resize({ width: logoMaxW, height: logoMaxH, fit: "inside" })
          .png()
          .toBuffer();

        const meta = await sharp(logoBuf).metadata();
        const left = Math.max(pad, w - pad - Number(meta?.width || 0))
        const top  = Math.max(pad, h - pad - Number(meta?.height || 0))

        baseBuf = await sharp(baseBuf)
          .composite([{ input: logoBuf, left: left, top: top }])
          .png()
          .toBuffer();
      }

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(baseBuf);
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});


app.get("/api/preview", (req, res) => {
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(FREE_MODE_PLACEHOLDER_PNG);
});


// Back-compat: older UI builds request /api/preview1
app.get("/api/preview1", (req, res) => {
  // Reuse the same handler via internal redirect
  req.url = "/api/preview";
  return app._router.handle(req, res, () => res.status(404).end());
});


// If the UI calls /api/preview/:variant, handle that too.
app.get("/api/preview/:variant", (req, res) => {
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(FREE_MODE_PLACEHOLDER_PNG);
});

// If ZIP generation is gated (license missing), respond cleanly.
// This prevents scary 503 errors while keeping the feature locked.
app.post("/api/generate", async (req, res, next) => {
  try {
    if (!process.env.BSP_LICENSE_KEY) {
      return res.status(200).json({
        ok: false,
        error: "ZIP generation is disabled in Free Mode (BSP_LICENSE_KEY missing).",
        hint: "This is expected. Copy generator stays available with /api/copy."
      });
    }
    return next();
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Bayou Social Pack running -> http://localhost:${PORT}`);
});

// Compatibility alias: some clients may request /app.js
app.get("/app.js", (req, res) => res.sendFile(path.join(__dirname, "public", "app.js")));
