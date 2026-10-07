const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public/images/share');

const W = 1200, H = 600;
const LOGO = fs.readFileSync(path.join(ROOT, 'public/images/logo/logo_black.png')).toString('base64');

const KINDS = [
  { file: 'share_thumb_challenge_call.png',    label: '너 나와! 호출' },
  { file: 'share_thumb_challenge_reply.png',   label: '너 나와! 응답' },
  { file: 'share_thumb_game_result_list.png',  label: '게임결과 목록' },
  { file: 'share_thumb_game_result.png',       label: '게임결과' },
  { file: 'share_thumb_rank_shift.png',        label: '랭크 변동' },
  { file: 'share_thumb_notice.png',            label: '알림' },
];

const page = (label) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
<style>
  html,body{margin:0;padding:0}
  .card{
    width:${W}px;height:${H}px;box-sizing:border-box;
    background:#f2f4f7;
    display:flex;flex-direction:column;align-items:center;justify-content:space-between;
    padding:74px 80px 66px;
    font-family:'Pretendard Variable',Pretendard,sans-serif;
  }
  .logo{width:640px;display:block}
  .label{
    font-size:76px;font-weight:800;letter-spacing:-0.02em;color:#10151a;
    line-height:1;white-space:nowrap;
  }
  .rule{width:120px;height:6px;border-radius:3px;background:#f5a623}
</style></head><body>
<div class="card">
  <img class="logo" src="data:image/png;base64,${LOGO}">
  <div class="rule"></div>
  <div class="label">${label}</div>
</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const k of KINDS) {
    await p.setContent(page(k.label), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    const el = await p.$('.card');
    await el.screenshot({ path: path.join(OUT, k.file) });
    console.log('wrote', k.file);
  }
  await b.close();
})();
