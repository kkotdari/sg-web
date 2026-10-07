import { webkit, chromium } from "playwright-core";
const [, , eng = "webkit", url = "", out = "wk.png", W = 1000, H = 300, DPR = 2] = process.argv;
const b = await (eng === "chromium" ? chromium : webkit).launch();
const p = await b.newPage({
  viewport: { width: Number(W), height: Number(H) },
  deviceScaleFactor: Number(DPR),
});
await p.goto(url.startsWith("http") || url.startsWith("file:") ? url : `file://${url}`);
await p.waitForTimeout(1000);
await p.screenshot({ path: out });
await b.close();
