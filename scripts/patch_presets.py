#!/usr/bin/env python3
import re
from pathlib import Path

p = Path("server.js")
s = p.read_text(encoding="utf-8")

block = r"""
// -------- Presets (Automation) --------
let PRESETS = {};
try {
  PRESETS = JSON.parse(fs.readFileSync(path.join(__dirname, "config", "presets.json"), "utf8"));
} catch (e) {
  PRESETS = {};
}

function applyPreset(reqBody, current) {
  const key = String(reqBody.preset || "").trim().toLowerCase();
  const p = PRESETS[key];
  if (!p) return current;
  return {
    ...current,
    sizeKey:  (p.size ?? current.sizeKey),
    opacity:  (typeof p.opacity === "number" ? p.opacity : current.opacity),
    margin:   (typeof p.margin === "number" ? p.margin : current.margin),
    sigOff:   (typeof p.signature_off === "boolean" ? p.signature_off : current.sigOff),
  };
}
""".lstrip("\n")

if "function applyPreset(" in s:
  print("[patch_presets] applyPreset already present. No changes.")
  raise SystemExit(0)

m = re.search(r"const\s+DEFAULTS\s*=\s*\{", s)
if not m:
  raise SystemExit("[patch_presets] Could not find const DEFAULTS = { ... } anchor")

# Find the end of the DEFAULTS object by locating the first line that is exactly "};" after DEFAULTS start
start = m.start()
tail = s[start:]
end_obj = re.search(r"^\s*\};\s*$", tail, flags=re.M)
if not end_obj:
  raise SystemExit("[patch_presets] Could not find end of DEFAULTS object (line with };)")

insert_at = start + end_obj.end()

s2 = s[:insert_at] + "\n" + block + s[insert_at:]
p.write_text(s2, encoding="utf-8")
print("[patch_presets] Inserted presets block after DEFAULTS.")
