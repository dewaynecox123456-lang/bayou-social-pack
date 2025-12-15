const frm = document.getElementById("frm");
const statusEl = document.getElementById("status");
const previewImg = document.getElementById("previewImg");
const btnPreview = document.getElementById("btnPreview");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function formDataFromForm() {
  const fd = new FormData(frm);
  return fd;
}

async function doPreview() {
  try {
    setStatus("Generating preview…");
    previewImg.removeAttribute("src");

    const fd = formDataFromForm();

    const r = await fetch("/api/preview", { method: "POST", body: fd });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `Preview failed (${r.status})`);
    }

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    previewImg.src = url;
    setStatus("Preview ready.");
  } catch (e) {
    setStatus(`Preview error: ${e.message}`);
  }
}

btnPreview.addEventListener("click", doPreview);

frm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    setStatus("Building ZIP…");

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
  }
});
