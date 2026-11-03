// publish-deps.mjs <WinDivert.dll> <WinDivert64.sys> <d3dx11_43.dll> <d3dcompiler_43.dll>
// Sube las dependencias al release fijo "deps" y actualiza latest.json firmado.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [, , dllPath, sysPath, dxPath, dcPath] = process.argv;
if (!dllPath || !sysPath || !dxPath || !dcPath) {
  console.error("uso: node tools/publish-deps.mjs <WinDivert.dll> <WinDivert64.sys> <d3dx11_43.dll> <d3dcompiler_43.dll>");
  process.exit(1);
}

const REPO = "yulian-x/WannaCry";
const TAG = "deps";
const KEY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "Loader", "keys");
const privatePem = fs.readFileSync(path.join(KEY_DIR, "private.pem"));

const files = [
  { path: dllPath, name: "WinDivert.dll", field: "windivert_dll_sha256" },
  { path: sysPath, name: "WinDivert64.sys", field: "windivert_sys_sha256" },
  { path: dxPath, name: "d3dx11_43.dll", field: "d3dx11_sha256" },
  { path: dcPath, name: "d3dcompiler_43.dll", field: "d3dcompiler43_sha256" },
];

const hashes = {};
for (const f of files) {
  const data = fs.readFileSync(f.path);
  if (data[0] !== 0x4d || data[1] !== 0x5a) throw new Error(`${f.name} no es un PE (MZ)`);
  hashes[f.field] = crypto.createHash("sha256").update(data).digest("hex");
  console.log(f.name, data.length, "bytes", hashes[f.field].slice(0, 16));
}

const manifestPath = path.join(ROOT, "latest.json");
const prev = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const manifest = {
  version: prev.version,
  loader_version: prev.loader_version,
  file: prev.file,
  url: prev.url,
  sha256: prev.sha256,
  loader_sha256: prev.loader_sha256 || "",
  windivert_dll_sha256: hashes.windivert_dll_sha256,
  windivert_sys_sha256: hashes.windivert_sys_sha256,
  d3dx11_sha256: hashes.d3dx11_sha256,
  d3dcompiler43_sha256: hashes.d3dcompiler43_sha256,
  maintenance: prev.maintenance || "0",
  maintenance_msg: prev.maintenance_msg || "",
  notes: prev.notes,
};
const payload = Buffer.from(JSON.stringify(manifest), "utf8");
const signature = crypto.sign("sha256", payload, { key: privatePem, dsaEncoding: "ieee-p1363" }).toString("base64");
const signed = { ...manifest, signature };

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

let release;
try {
  release = await (await gh(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`)).json();
} catch {
  release = await (await gh(`https://api.github.com/repos/${REPO}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_name: TAG, name: "Deps", body: "WinDivert para el exploit Freeze" }),
  })).json();
}
console.log("release:", release.html_url);

for (const f of files) {
  for (const a of release.assets || []) {
    if (a.name === f.name) {
      await gh(`https://api.github.com/repos/${REPO}/releases/assets/${a.id}`, { method: "DELETE" });
      console.log("asset viejo borrado:", a.name);
    }
  }
  const data = fs.readFileSync(f.path);
  const up = await gh(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${f.name}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });
  console.log("asset subido:", (await up.json()).browser_download_url);
}

fs.writeFileSync(manifestPath, JSON.stringify(signed));
console.log("latest.json firmado con hashes de WinDivert");

execSync('git add latest.json && git -c user.name="yulian-x" -c user.email="yulian@local" commit -m "deps windivert" && git push origin main',
  { cwd: ROOT, stdio: "inherit" });
