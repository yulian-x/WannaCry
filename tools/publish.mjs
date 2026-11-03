// publish.mjs <ruta.bin> <version> "<notas>" [loaderVersion]
// Firma el manifest con ECDSA P-256 y lo publica en el repo WannaCry.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [, , binPath, version, notes = "", loaderVersion = ""] = process.argv;
if (!binPath || !version) {
  console.error("uso: node tools/publish.mjs <ruta.bin> <version> \"<notas>\" [loaderVersion]");
  process.exit(1);
}

const REPO = "yulian-x/WannaCry";
const KEY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "Loader", "keys");
const privatePem = fs.readFileSync(path.join(KEY_DIR, "private.pem"));

const data = fs.readFileSync(binPath);
const sha256 = crypto.createHash("sha256").update(data).digest("hex");
const assetName = `ZorroXit-${version}.bin`;

// conservar los campos del loader (los pone publish-loader.mjs)
const prev = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "latest.json"), "utf8")); }
  catch { return {}; }
})();

// 1) firma del manifest (sin el campo signature)
const manifest = {
  version,
  loader_version: loaderVersion || prev.loader_version || "1.0.0",
  file: assetName,
  url: `https://github.com/${REPO}/releases/download/v${version}/${assetName}`,
  sha256,
  loader_sha256: prev.loader_sha256 || "",
  windivert_dll_sha256: prev.windivert_dll_sha256 || "",
  windivert_sys_sha256: prev.windivert_sys_sha256 || "",
  d3dx11_sha256: prev.d3dx11_sha256 || "",
  d3dcompiler43_sha256: prev.d3dcompiler43_sha256 || "",
  maintenance: prev.maintenance || "0",
  maintenance_msg: prev.maintenance_msg || "",
  notes,
};
const payload = Buffer.from(JSON.stringify(manifest), "utf8");
const signature = crypto.sign("sha256", payload, { key: privatePem, dsaEncoding: "ieee-p1363" }).toString("base64");
const signed = { ...manifest, signature };

// 2) token de git credential
function token() {
  const out = execSync("git credential fill", {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  const m = out.match(/password=(.+)/);
  if (!m) throw new Error("no hay token de GitHub");
  return m[1].trim();
}
const TOKEN = token();

async function gh(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `token ${TOKEN}`,
      "User-Agent": "wannacry-publish",
      Accept: "application/vnd.github+json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${await res.text()}`);
  return res;
}

// 3) crear release + subir asset
const tag = `v${version}`;
let release;
try {
  release = await (await gh(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`)).json();
} catch {
  release = await (await gh(`https://api.github.com/repos/${REPO}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_name: tag, name: `WannaCry ${version}`, body: notes || `Release ${version}` }),
  })).json();
}
console.log("release:", release.html_url);

// si el asset ya existe, borrarlo para resubir
for (const a of release.assets || []) {
  if (a.name === assetName) {
    await gh(`https://api.github.com/repos/${REPO}/releases/assets/${a.id}`, { method: "DELETE" });
    console.log("asset viejo borrado:", a.name);
  }
}

const up = await gh(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${assetName}`, {
  method: "POST",
  headers: { "Content-Type": "application/octet-stream" },
  body: data,
});
console.log("asset subido:", (await up.json()).browser_download_url);

// 4) manifest firmado -> repo
fs.writeFileSync(path.join(ROOT, "latest.json"), JSON.stringify(signed)); // COMPACTO: la firma se calcula sobre este mismo texto
console.log("latest.json firmado (sha256:", sha256.slice(0, 16), ")");

execSync('git add latest.json && git -c user.name="yulian-x" -c user.email="yulian@local" commit -m "release ' + version + '" && git push origin main',
  { cwd: ROOT, stdio: "inherit" });
