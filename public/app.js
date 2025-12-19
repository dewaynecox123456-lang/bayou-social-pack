
function appendContext(fd) {
  // ---- Context metadata (Option 1) ----
  const t = document.getElementById("meta-title")?.value?.trim() || "";
  const d = document.getElementById("meta-desc")?.value?.trim() || "";
  const k = document.getElementById("meta-keywords")?.value?.trim() || "";
  const l = document.getElementById("meta-location")?.value?.trim() || "";
  if (t) fd.append("meta_title", t);
  if (d) fd.append("meta_desc", d);
  if (k) fd.append("meta_keywords", k);
  if (l) fd.append("meta_location", l);
}

const COPY = {
  headerTitle: "Bayou Social Pack",
  headerSubtitle: "Create clean, ready-to-post social image packs.",

  idleStatus: "",
  idleTitle: "Upload an image to create your social pack.",
  idleHint: "We’ll handle sizing, branding, and export.",

  // Validation / requirements (kept short + pro)
  needImageStatus: "Please upload an image.",
  needImageTitle: "Upload an image to create your social pack.",
  needImageHint: "JPG or PNG recommended",

  needLogoStatus: "Please upload a logo.",
  needLogoTitle: "Add your logo to continue.",
  needLogoHint: "PNG recommended",

  badImageTypeStatus: "Unsupported image type. Use PNG or JPG.",
  badLogoTypeStatus: "Logo must be PNG.",

  processingStatus: "Creating your social pack…",
  processingTitle: "Creating your social pack…",
  processingHint: "Preparing platform sizes, applying clean branding, and packaging files.",

  previewIdleTitle: "Preview will appear here",
  previewIdleHint: "Upload an image and logo to continue.",

  successZipStatus: "Your social pack is ready.",
  successZipTitle: "Your social pack is ready.",
  successZipHint: "Download includes multiple platform-ready images in a clean ZIP.",

  // Buttons (only used if you want to set them; safe to ignore)
  btnPreview: "Preview",
  btnZip: "Download Social Pack",

  footer1: "Built by BayouFinds",
  footer2: "bayoufinds.com",
};

const frm = document.getElementById("frm");
const statusEl = document.getElementById("status");
const previewImg = document.getElementById("previewImg");
const btnPreview = document.getElementById("btnPreview");
const btnZip = document.getElementById("btnZip");

const previewBox = document.getElementById("previewBox");
const previewTitle = document.getElementById("previewTitle");
const previewHint  = document.getElementById("previewHint");

const imageInput = document.getElementById("imageInput");
const logoInput  = document.getElementById("logoInput");

let busy = false;
let lastObjectUrl = null;
let autoTimer = null;

function setStatus(msg) {
  statusEl.textContent = msg;
}

function setBusy(on) {
  busy = !!on;
  btnPreview.disabled = busy;
  btnZip.disabled = busy;
}

function setPreviewState(state) {
  const previewBox = document.getElementById('previewBox') || document.querySelector('[data-preview-state]');
  if (!previewBox) return;

  const el = document.querySelector("[data-preview-state]");
  if (!el) {
    console.warn("[Preview] data-preview-state element not found. State:", state);
    return;
  }
  if (!el) { console.warn("[UI] Missing preview state element [data-preview-state]"); return; }
  el.dataset.state = state;}

function revokePreviewUrl() {
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }
}

function validateInputs(kind = "preview") {
  const imgOk = imageInput?.files?.length > 0;
  const logoOk = logoInput?.files?.length > 0;

  if (!imgOk) {
    setStatus(COPY.needImageStatus);
    setPreviewState("idle", COPY.needImageTitle, COPY.needImageHint);
    return false;
  }
  if (!logoOk) {
    setStatus(COPY.needLogoStatus);
    setPreviewState("idle", COPY.needLogoTitle, COPY.needLogoHint);
    return false;
  }

  // extra guard: file type hints
  const imgType = imageInput.files[0]?.type || "";
  const logoType = logoInput.files[0]?.type || "";

  if (!["image/png", "image/jpeg"].includes(imgType)) {
    setStatus(COPY.badImageTypeStatus);
    return false;
  }
  if (logoType !== "image/png") {
    setStatus(COPY.badLogoTypeStatus);
    return false;
  }

  return true;
}

function formDataFromForm() {
  const fd = new FormData(frm);
  appendContext(fd);
const profileEl = document.getElementById("profile");
  if (profileEl) fd.append("profile", profileEl.value);
  return fd;
}

async function doPreview() {
  if (busy) return;
  if (!validateInputs("preview")) return;

  setBusy(true);
  try {
    setStatus("Generating preview…");
    setPreviewState("loading", "Generating preview…", "Hang tight — creating a Facebook 1200×630 preview.");
    revokePreviewUrl();
    previewImg.removeAttribute("src");

    const fd = formDataFromForm();
    const r = await fetch("/api/preview", { method: "POST", body: fd });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `Preview failed (${r.status})`);
    }

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    lastObjectUrl = url;
    previewImg.src = url;

    setPreviewState("ready");
    setStatus("Preview ready.");
  } catch (e) {
    setPreviewState("idle", "Preview failed", "Try a different image or logo, then preview again.");
    setStatus(`Preview error: ${e.message}`);
  } finally {
    setBusy(false);
  }
}

btnPreview.addEventListener("click", doPreview);

frm.addEventListener("submit", async (ev) => {
// External links should not be hijacked by in-page tab scrolling
  const a = (ev?.target && ev.target.closest) ? ev.target.closest("a") : null;
  const href = a ? (a.getAttribute("href") || "") : "";
  if (/^https?:\/\//i.test(href)) return; // let browser navigate
  ev.preventDefault();
  if (busy) return;
  if (!validateInputs("zip")) return;

  setBusy(true);
  try {
    setStatus("Building ZIP…");
    setPreviewState((previewBox && previewBox.dataset && previewBox.dataset.state) ? previewBox.dataset.state : "idle", "Building ZIP…", "Packaging post-ready assets…");

    const fd = formDataFromForm();
    const r = await fetch("/api/generate", { method: "POST", body: fd });

    
  // Guard: only download if server returned a real ZIP
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/zip")) {
    const j = await readErrorResponse(r);
    const msg = j.error || j.message || `Generate failed (${r.status})`;
    throw new Error(msg);
  }
if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `Generate failed (${r.status})`);
    }

    const blob = await r.blob();
    const cd = r.headers.get("content-disposition") || "";
    const m = cd.match(/filename="([^"]+)"/);
    const fname = m ? m[1] : "bayou-social-pack.zip";

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setStatus("ZIP downloaded.");
  } catch (e) {
    setStatus(`ZIP error: ${e.message}`);
  } finally {
    setBusy(false);
  }
});

// Optional polish: auto-preview when both files are selected
function scheduleAutoPreview() {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (busy) return;
    const imgOk = imageInput?.files?.length > 0;
    const logoOk = logoInput?.files?.length > 0;
    if (imgOk && logoOk) doPreview();
    else setPreviewState("idle", "Preview will appear here", "Drop an image + logo, then click Preview.");
  }, 350);
}

imageInput.addEventListener("change", scheduleAutoPreview);
logoInput.addEventListener("change", scheduleAutoPreview);

// Initial state
setPreviewState("idle", "Preview will appear here", "Drop an image + logo, then click Preview.");

// ------------------------------------------------------
// Preset + SafeCrop: force into FormData (robust wiring)
// ------------------------------------------------------
(function () {
  function forceExtras(fd) {
    try {
      const presetEl = document.getElementById("bsp-preset");
      const cropEl = document.getElementById("bsp-safe-crop");

      if (presetEl && presetEl.value) fd.set("preset", presetEl.value);
      if (cropEl) {
        // checked -> "1", unchecked -> "0" (server reads either)
        fd.set("safe_crop", cropEl.checked ? "1" : "0");
      }
    } catch (_) {}
    return fd;
  }

  // Monkey-patch FormData creation if app uses fetch + new FormData(form)
  // We hook common buttons by intercepting submit events.
  const forms = Array.from(document.querySelectorAll("form"));
  forms.forEach((form) => {
    if (form.__bspExtrasHooked) return;
    form.__bspExtrasHooked = true;

    form.addEventListener("submit", (e) => {
      // If the app's JS prevents default and builds FormData elsewhere, this does nothing harmful.
      // If the browser submits normally, it still includes fields via name= attributes.
    }, true);
  });

  // Expose helper for existing code paths
  window.__bspForceExtras = forceExtras;
})();

// ------------------------------------------------------
// Preset + SafeCrop: force into FormData (robust wiring)
// ------------------------------------------------------
(function () {
  function forceExtras(fd) {
    try {
      const presetEl = document.getElementById("bsp-preset");
      const cropEl = document.getElementById("bsp-safe-crop");

      if (presetEl && presetEl.value) fd.set("preset", presetEl.value);
      if (cropEl) {
        // checked -> "1", unchecked -> "0" (server reads either)
        fd.set("safe_crop", cropEl.checked ? "1" : "0");
      }
    } catch (_) {}
    return fd;
  }

  // Monkey-patch FormData creation if app uses fetch + new FormData(form)
  // We hook common buttons by intercepting submit events.
  const forms = Array.from(document.querySelectorAll("form"));
  forms.forEach((form) => {
    if (form.__bspExtrasHooked) return;
    form.__bspExtrasHooked = true;

    form.addEventListener("submit", (e) => {
      // If the app's JS prevents default and builds FormData elsewhere, this does nothing harmful.
      // If the browser submits normally, it still includes fields via name= attributes.
    }, true);
  });

  // Expose helper for existing code paths
  window.__bspForceExtras = forceExtras;
})();


// ------------------------------------------------------
// Copy Generator (offline /api/copy)
// ------------------------------------------------------
function wireCopyGenerator() {
  const form = document.getElementById("copyForm");
  if (!form) return;

  const platformEl = document.getElementById("copyPlatform");
  const linkEl = document.getElementById("copyLink");
  const contextEl = document.getElementById("copyContext");
  const tagsEl = document.getElementById("copyTags");
  const outEl = document.getElementById("copyOut");
  const metaEl = document.getElementById("copyMeta");
  const btnGen = document.getElementById("btnCopyGen");
  const btnClip = document.getElementById("btnCopyClip");

  function setMeta(msg) {
    if (metaEl) metaEl.textContent = msg || "";
  }

  function parseTags(raw) {
    return String(raw || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }

  form.addEventListener("submit", async (e) => {
// External links should not be hijacked by in-page tab scrolling
    const a = (e?.target && e.target.closest) ? e.target.closest("a") : null;
    const href = a ? (a.getAttribute("href") || "") : "";
    if (/^https?:\/\//i.test(href)) return; // let browser navigate
    if ((link.href||"").startsWith("http")) return;
    e.preventDefault();
    btnGen.disabled = true;
    btnClip.disabled = true;
    setMeta("Generating…");

    const payload = {
      platform: (platformEl?.value || "facebook"),
      link: (linkEl?.value || "https://bayoufinds.com"),
      context: (contextEl?.value || ""),
      tags: parseTags(tagsEl?.value || "")
    };

    try {
      const r = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const j = await r.json();

      if (!j || j.ok !== true) {
        throw new Error(j?.error || `Copy failed (${r.status})`);
      }

      const hashtags = Array.isArray(j.hashtags) ? j.hashtags.join(" ") : "";
      const lines = [
        j.post || "",
        "",
        hashtags ? hashtags : "",
        "",
        j.alt_text ? `ALT: ${j.alt_text}` : "",
        j.cta ? `CTA: ${j.cta}` : ""
      ].filter(Boolean);

      outEl.value = lines.join("\n");
      btnClip.disabled = false;

      setMeta(`Mode: ${j.mode || "offline"} • Platform: ${j.platform || payload.platform} • Hashtags: ${(j.hashtags||[]).length}`);
    } catch (err) {
      outEl.value = "";
      setMeta(`Error: ${err?.message || err}`);
      alert(err?.message || String(err));
    } finally {
      btnGen.disabled = false;
    }
  });

  btnClip.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(outEl.value || "");
      setMeta("Copied to clipboard ✅");
    } catch {
      // Fallback for older clipboard permissions
      outEl.focus();
      outEl.select();
      document.execCommand("copy");
      setMeta("Copied to clipboard ✅");
    }
  });
}

// Ensure wiring runs after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  wireCopyGenerator();
});



async function readErrorResponse(resp) {
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) return await resp.json();
    return { error: await resp.text() };
  } catch (e) {
    return { error: `Failed to read error response: ${e}` };
  }
}
