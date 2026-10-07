import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };
const srv = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let f = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(4173, r));

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const out = [];
for (const p of ["/"]) {
  const page = await b.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:4173${p}`, { waitUntil: "networkidle" });
  const txt = (await page.locator("body").innerText()).trim();
  out.push({ path: p, url: new URL(page.url()).pathname + new URL(page.url()).search, errors: errs.filter((e) => !/Failed to load resource|net::ERR/.test(e)), textLen: txt.length, head: txt.slice(0, 80).replace(/\n/g, " | ") });
  await page.close();
}
await b.close(); srv.close();
console.log(JSON.stringify(out, null, 2));
