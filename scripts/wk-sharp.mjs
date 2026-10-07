import { webkit, chromium } from "playwright-core";
const [, , eng = "webkit", url = "", sel = ".cell"] = process.argv;
const b = await (eng === "chromium" ? chromium : webkit).launch();
const p = await b.newPage({ viewport: { width: 1200, height: 400 }, deviceScaleFactor: 2 });
await p.goto(url.startsWith("file:") ? url : `file://${url}`);
await p.waitForTimeout(1000);
const els = await p.$$(sel);
const shots = [];
for (const el of els) shots.push((await el.screenshot()).toString("base64"));
const out = await p.evaluate(async (list) => {
  const res = [];
  for (const b64 of list) {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = `data:image/png;base64,${b64}`; });
    const cv = document.createElement("canvas");
    cv.width = im.width; cv.height = im.height;
    const c = cv.getContext("2d");
    c.drawImage(im, 0, 0);
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let mx = 0, hard = 0, soft = 0;
    for (let y = 1; y < cv.height; y += 1) {
      for (let x = 1; x < cv.width; x += 1) {
        const i = (y * cv.width + x) * 4;
        const l = (y * cv.width + x - 1) * 4;
        const u = ((y - 1) * cv.width + x) * 4;
        const dl = Math.max(Math.abs(d[i] - d[l]), Math.abs(d[i + 1] - d[l + 1]), Math.abs(d[i + 2] - d[l + 2]));
        const du = Math.max(Math.abs(d[i] - d[u]), Math.abs(d[i + 1] - d[u + 1]), Math.abs(d[i + 2] - d[u + 2]));
        const v = Math.max(dl, du);
        if (v > mx) mx = v;
        if (v > 60) hard += 1;
        else if (v >= 8 && v <= 40) soft += 1;
      }
    }
    res.push({ w: cv.width, max: mx, hard, soft });
  }
  return res;
}, shots);
await b.close();
console.log(eng, JSON.stringify(out));
