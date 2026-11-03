// set-maintenance.mjs <on|off> ["mensaje"]
// Pausa o reanuda el loader sin recompilar: actualiza latest.json firmado.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [, , mode, ...msgParts] = process.argv;
if (!mode) {
  console.error('uso: node tools/set-maintenance.mjs <on|off> ["mensaje"]');
  process.exit(1);
}
const on = mode === "on" || mode === "1" || mode === "true";
const msg = msgParts.join(" ").trim() ||
  (on ? "We're applying improvements. Back soon." : "");

const KEY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "Loader", "keys");
const privatePem = fs.readFileSync(path.join(KEY_DIR, "private.pem"));

const manifestPath = path.join(ROOT, "latest.json");
const prev = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const manifest = {
  version: prev.version,
  loader_version: prev.loader_version,
  file: prev.file,
  url: prev.url,
  sha256: prev.sha256,
  loader_sha256: prev.loader_sha256 || "",
  windivert_dll_sha256: prev.windivert_dll_sha256 || "",
  windivert_sys_sha256: prev.windivert_sys_sha256 || "",
  d3dx11_sha256: prev.d3dx11_sha256 || "",
  d3dcompiler43_sha256: prev.d3dcompiler43_sha256 || "",
  maintenance: on ? "1" : "0",
  maintenance_msg: msg,
  notes: prev.notes,
};
const payload = Buffer.from(JSON.stringify(manifest), "utf8");
const signature = crypto.sign("sha256", payload, { key: privatePem, dsaEncoding: "ieee-p1363" }).toString("base64");
fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, signature }));
console.log(on ? "MANTENIMIENTO ACTIVADO" : "MANTENIMIENTO DESACTIVADO", "| msg:", msg || "(vacio)");

execSync(
  'git add latest.json && git -c user.name="yulian-x" -c user.email="yulian@local" commit -m "' +
    (on ? "maintenance on" : "maintenance off") + '" && git push origin main',
  { cwd: ROOT, stdio: "inherit" },
);
