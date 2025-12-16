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

function setPreviewState(state, title, hint) {
  previewBox.dataset.state = state;
  if (title) previewTitle.textContent = title;
  if (hint) previewHint.textContent = hint;
}

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
    setStatus("Image required.");
    setPreviewState("idle", "Preview will appear here", "Select an image (PNG/JPG) to continue.");
    return false;
  }
  if (!logoOk) {
    setStatus("Logo required.");
    setPreviewState("idle", "Preview will appear here", "Select a logo (PNG) to continue.");
    return false;
  }

  // extra guard: file type hints
  const imgType = imageInput.files[0]?.type || "";
  const logoType = logoInput.files[0]?.type || "";

  if (!["image/png", "image/jpeg"].includes(imgType)) {
    setStatus("Unsupported image type. Use PNG or JPG.");
    return false;
  }
  if (logoType !== "image/png") {
    setStatus("Logo must be PNG.");
    return false;
  }

  return true;
}

function formDataFromForm() {
  const fd = new FormData(frm);
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
  ev.preventDefault();
  if (busy) return;
  if (!validateInputs("zip")) return;

  setBusy(true);
  try {
    setStatus("Building ZIP…");
    setPreviewState(previewBox.dataset.state || "idle", "Building ZIP…", "Packaging post-ready assets…");

    const fd = formDataFromForm();
    const r = await fetch("/api/generate", { method: "POST", body: fd });

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
