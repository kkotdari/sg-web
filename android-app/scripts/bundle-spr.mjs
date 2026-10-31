/* 재생기 폰 아틀라스를 앱 assets 로 베낀다(2026-10-31, 요청: "모델도 기본 포함"). sg-web 뿌리의 public/spr(npm 설치 뒤 postinstall 이 scplay 에서 베낀 판)에서
   표(index.*.json) · basis 풀이기 · 폰 판(k/*.h.*.ktx2)만 — PC 판(f)은 폰이 안 쓴다. CI(.github/workflows/android.yml)가 sync 앞에 부른다. */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "public", "spr");
const DST = join(HERE, "..", "android", "app", "src", "main", "assets", "spr");
if (!existsSync(SRC)) { console.error(`없음: ${SRC} — sg-web 뿌리에서 npm ci 를 먼저`); process.exit(1); }
rmSync(DST, { recursive: true, force: true });
mkdirSync(join(DST, "k"), { recursive: true });
let n = 0, bytes = 0;
const put = (rel) => { cpSync(join(SRC, rel), join(DST, rel), { recursive: true }); n += 1; bytes += statSync(join(SRC, rel)).size; };
for (const f of readdirSync(SRC)) if (/^index\..+\.json$/.test(f)) put(f);
mkdirSync(join(DST, "basis"), { recursive: true });
for (const f of readdirSync(join(SRC, "basis"))) put(join("basis", f));
for (const f of readdirSync(join(SRC, "k"))) if (/\.h\.[a-z]+\.[0-9a-f]+\.ktx2$/.test(f)) put(join("k", f));
console.log(`[spr] ${n}개 · ${(bytes / 1048576).toFixed(1)}MB → ${DST}`);
