#!/usr/bin/env bash
set -euo pipefail

FILE="server.js"
cp -av "$FILE" "$FILE.bak.$(date +%F_%H%M%S)"

python3 - <<'PY'
import re, pathlib
p = pathlib.Path("server.js")
s = p.read_text(encoding="utf-8")

# Patch BOTH endpoints where signature_off is set.
# We add: if user uploaded logo, disable built-in signature unless signature_force=1
pattern = r"""(let sigOff = String\(req\.body\.signature_off \|\| ""\)\.trim\(\) === "1";\n)"""
repl = r"""\1      const hasUserLogo = Boolean(logo && logo.buffer && logo.buffer.length);
      const forceSig = String(req.body.signature_force || "").trim() === "1";
      if (hasUserLogo && !forceSig) sigOff = true;
"""
new_s, n = re.subn(pattern, repl, s)
if n < 1:
    raise SystemExit("Could not find signature_off line to patch. Search server.js for 'signature_off' and paste me that block.")
p.write_text(new_s, encoding="utf-8")
print(f"✅ Patched signature auto-disable in {n} place(s).")
PY

echo "✅ Done. Backup created."
