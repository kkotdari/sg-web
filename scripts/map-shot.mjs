import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(n);
  return i < 0 ? d : (argv[i + 1] ?? true);
};
const OUT = String(flag("--out", join(tmpdir(), "map-shot.png")));
const PX = Number(flag("--px", 8));
const TILESET = Number(flag("--tileset", 4));

const ENTRY = `
import { drawMapGrid } from ${JSON.stringify(join(ROOT, "src/utils/mapTiles"))};
window.__draw = (ctx, grid, mt, px) => drawMapGrid(ctx, grid, mt, px);
`;

function bundle() {
  const dir = mkdtempSync(join(tmpdir(), "mapshot-"));
  const src = join(dir, "entry.ts");
  const out = join(dir, "entry.mjs");
  writeFileSync(src, ENTRY);
  const ebin = join(ROOT, "node_modules", "esbuild", "bin", "esbuild");
  const head = readFileSync(ebin).subarray(0, 4);
  const magic = (head[0] << 24 | head[1] << 16 | head[2] << 8 | head[3]) >>> 0;
  const native = magic === 0x7f454c46 || (head[0] === 0x4d && head[1] === 0x5a)
    || magic === 0xcffaedfe || magic === 0xcefaedfe || magic === 0xcafebabe;
  const args = [src, "--bundle", "--format=esm", "--log-level=error",
    "--define:process.env.NODE_ENV=\"production\"", "--define:import.meta.env={}", `--outfile=${out}`];
  execFileSync(native ? ebin : process.execPath, native ? args : [ebin, ...args],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  const js = readFileSync(out, "utf8");
  rmSync(dir, { recursive: true, force: true });
  return js;
}

function inBrowser({ PX, TILESET }) {
  const W = 64;
  const H = 64;
  const level = new Uint8Array(W * H);
  const walk = new Uint8Array(W * H).fill(1);
  const partial = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (x >= 18 && x < 46 && y >= 14 && y < 34) level[i] = 2;
      if (x >= 24 && x < 40 && y >= 34 && y < 38) { level[i] = 1; partial[i] = 1; }
      if (x < 14 && y < 14) { walk[i] = 0; }
      if (x === 54 && y > 8 && y < 56) { walk[i] = 0; level[i] = 1; }
    }
  }
  const mt = {
    w: W, h: H, tileset: TILESET,
    levelAt: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : level[y * W + x]),
    walkAt: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? false : walk[y * W + x] === 1),
    partialAt: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? false : partial[y * W + x] === 1),
    walkAtMini: (mx, my) => {
      const x = mx >> 2; const y = my >> 2;
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      return walk[y * W + x] === 1;
    },
  };
  const tb = new Uint8Array(W * H);
  for (let y = H / 2; y < H; y += 1) {
    for (let x = W / 2; x < W; x += 1) tb[y * W + x] = (x + y) % 2;
  }
  const grid = {
    width: W, height: H, palette: [12, 37],
    tiles: btoa(String.fromCharCode(...tb)),
    resources: [[10, 50, 0], [50, 50, 1], [31, 24, 1]],
  };
  const cv = document.createElement("canvas");
  cv.width = W * PX;
  cv.height = H * PX;
  const ctx = cv.getContext("2d");
  window.__draw(ctx, grid, mt, PX);
  return cv.toDataURL("image/png");
}

const js = bundle();
const { chromium } = await import("playwright-core");
const exe = [process.env.PW_CHROMIUM].filter(Boolean).find((p) => p && existsSync(p));
const browser = await chromium.launch(
  exe ? { executablePath: exe, args: ["--no-proxy-server"] } : { args: ["--no-proxy-server"] },
);
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("페이지 오류:", String(e).slice(0, 300)));
await page.route("http://map-shot.local/*", (r) => r.fulfill({
  contentType: "text/html", body: "<!doctype html><meta charset=utf-8><body>",
}));
await page.goto("http://map-shot.local/");
await page.addScriptTag({ content: js, type: "module" });
await page.waitForFunction("!!window.__draw");
const dataUrl = await page.evaluate(inBrowser, { PX, TILESET });
await browser.close();
writeFileSync(OUT, Buffer.from(dataUrl.split(",")[1], "base64"));
console.log(OUT);
