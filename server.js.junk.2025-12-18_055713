import express from "express";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import archiver from "archiver";
import path from "path";
import { fileURLToPath } from "url";

import fs from "fs";
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// Serve static frontend (public/)
app.use(express.static(path.join(__dirname, "public")));

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

// ------------------------------------------------------
// Output Profiles (Social vs Print/Puzzle)
// ------------------------------------------------------
const PRINT_SIZES = {
  // 8.38" x 11.89" @ 300 DPI (print-ready)
  puzzle_8p38x11p89_300dpi: { w: 2514, h: 3567 },
};


// -------- Presets (size/opacity/margin/signature defaults) --------
// NOTE: Keep keys lowercase. UI can request via body.preset or body.preset_key.
const PRESETS = {
  "custom (manual)": null,

  // Good defaults for “signature at bottom” watermark style
  "holiday / seasonal": { sizeKey: "small", opacity: 0.85, margin: 24, sigOff: true },
  "brand-safe":         { sizeKey: "small", opacity: 0.80, margin: 28, sigOff: true },
  "bold watermark":     { sizeKey: "medium", opacity: 0.90, margin: 18, sigOff: true },
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

function applyPreset(body, state) {
  const preset = String(body.preset || body.preset_key || "").trim().toLowerCase();
  const p = (typeof PRESETS !== "undefined" && PRESETS) ? (PRESETS[preset] || null) : null;
  if (!p) return state;

  const out = { ...state };
  if (p.sizeKey != null) out.sizeKey = p.sizeKey;
  if (p.opacity != null) out.opacity = p.opacity;
  if (p.margin != null) out.margin = p.margin;
  if (p.sigOff != null) out.sigOff = boolish(p.sigOff, out.sigOff);
  return out;
}


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

app.get("/api/presets", (req, res) => {
  const keys = Object.keys(PRESETS).filter(k => PRESETS[k] !== null);
  res.json({ presets: keys });
});

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
      if (!image) return res.status(400).json({ error: "Missing image upload." });

      const position = req.body.position || DEFAULTS.position;
      let sizeKey  = req.body.size || DEFAULTS.size;
      let opacity  = clamp(parseFloat(req.body.opacity ?? DEFAULTS.opacity), 0.1, 1.0);
      let margin   = clamp(parseInt(req.body.margin ?? DEFAULTS.margin, 10), 0, 200);
      const safeCrop = String(req.body.safe_crop || "").trim().toLowerCase() === "1" || String(req.body.safe_crop || "").trim().toLowerCase() === "on";
      // Logo optional: fall back to transparent PNG
      const logoBuf = (logo && logo.buffer) ? logo.buffer : EMPTY_PNG;

      // Built-in branding signature (no QR yet)
      let sigOff = true; // default OFF in Phase 1 (only uploaded logo shows)
      // If you add a UI toggle later, map it to signature_force=1
      const sigText1 = (req.body.signature_text1 || "© Cheri Bayou Finds").toString().trim();
      const sigText2 = (req.body.signature_text2 || "bayoufinds.com").toString().trim();


      // Apply preset overrides (size/opacity/margin/signature_off)
      ({ sizeKey, opacity, margin, sigOff } = applyPreset(req.body, { sizeKey, opacity, margin, sigOff }));
      const profileKey = getProfileKey(req.body);
      const first = PROFILES[profileKey][0];
      const dim = first[1];
      const { w, h } = dim;

      const baseImageBuf = safeCrop
        ? await sharp(image.buffer).resize(w, h, { fit: "cover", position: "centre" }).jpeg({ quality: 92 }).toBuffer()
        : image.buffer;

      // Render output JPG, then convert to PNG for easy browser preview
      const jpg = await renderOne({
        imageBuf: baseImageBuf,
        logoBuf: logoBuf,
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
      if (!image) return res.status(400).json({ error: "Missing image upload." });

      const position = req.body.position || DEFAULTS.position;
      let sizeKey  = req.body.size || DEFAULTS.size;
      let opacity  = clamp(parseFloat(req.body.opacity ?? DEFAULTS.opacity), 0.1, 1.0);
      let margin   = clamp(parseInt(req.body.margin ?? DEFAULTS.margin, 10), 0, 200);
      const safeCrop = String(req.body.safe_crop || "").trim().toLowerCase() === "1" || String(req.body.safe_crop || "").trim().toLowerCase() === "on";
      // Logo optional: fall back to transparent PNG
      const logoBuf = (logo && logo.buffer) ? logo.buffer : EMPTY_PNG;

      // Built-in branding signature (no QR yet)
      let sigOff = String(req.body.signature_off || "").trim() === "1";
      const sigText1 = (req.body.signature_text1 || "© Cheri Bayou Finds").toString().trim();
      const sigText2 = (req.body.signature_text2 || "bayoufinds.com").toString().trim();

      const stamp = tsStamp();
      const zipName = `bayou-social-pack_${stamp}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", (err) => { throw err; });
      archive.pipe(res);

      // Render each output and add to zip
      const profileKey = getProfileKey(req.body);
      const jobs = PROFILES[profileKey];

      for (const [name, dim] of jobs) {
                const baseImageBuf = safeCrop
          ? await sharp(image.buffer).resize(dim.w, dim.h, { fit: "cover", position: "centre" }).jpeg({ quality: 92 }).toBuffer()
          : image.buffer;
        const buf = await renderOne({
          imageBuf: baseImageBuf,
          logoBuf: logoBuf,
          outW: dim.w,
          outH: dim.h,
          position,
          sizeKey,
          opacity,
          margin,
        });
        let outBuf = buf;
        if (!sigOff) {
          const sigSvg = makeGoldSignatureSvg({ w: dim.w, h: dim.h, text1: sigText1, text2: sigText2 });
          outBuf = await sharp(buf)
            .composite([{ input: sigSvg, top: 0, left: 0 }])
            .jpeg({ quality: 92 })
            .toBuffer();
        }
        archive.append(outBuf, { name });
      }

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

// Compatibility alias: some clients may request /app.js
app.get("/app.js", (req, res) => res.sendFile(path.join(__dirname, "public", "app.js")));
