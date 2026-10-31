"""안드 앱 아이콘·시작 화면·알림 아이콘을 사이트 아이콘(public/icon-512*.png · 흰 바탕 별)으로 굽는다(2026-10-31).
python3 -I android-app/scripts/make-icons.py  (sg-web 뿌리에서)"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RES = os.path.join(ROOT, "android-app/android/app/src/main/res")
icon = Image.open(os.path.join(ROOT, "public/icon-512.png")).convert("RGBA")
mask = Image.open(os.path.join(ROOT, "public/icon-512-maskable.png")).convert("RGBA")
DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

for d, k in DENS.items():
    out = os.path.join(RES, f"mipmap-{d}")
    os.makedirs(out, exist_ok=True)
    n = round(48 * k)
    icon.resize((n, n), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
    # 둥근 아이콘 — 원 밖은 비운다
    r = icon.resize((n, n), Image.LANCZOS)
    m = Image.new("L", (n * 4, n * 4), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(m).ellipse((0, 0, n * 4 - 1, n * 4 - 1), fill=255)
    r.putalpha(m.resize((n, n), Image.LANCZOS))
    r.save(os.path.join(out, "ic_launcher_round.png"))
    # 적응형 앞판 108dp — 마스크 아이콘(안전 여백이 든 판)을 통째로
    f = round(108 * k)
    mask.resize((f, f), Image.LANCZOS).save(os.path.join(out, "ic_launcher_foreground.png"))

# 알림 아이콘(흰 실루엣 + 알파) 24dp — 흰 바탕을 비우고 별(주황)만 흰색으로
px = icon.load()
sil = Image.new("RGBA", icon.size, (255, 255, 255, 0))
sp = sil.load()
for y in range(icon.size[1]):
    for x in range(icon.size[0]):
        r_, g_, b_, _ = px[x, y]
        a = max(0, min(255, int((255 - b_) * 255 / 200)))   # 흰(255)→0 · 주황(b≈66)→255
        sp[x, y] = (255, 255, 255, a)
bbox = sil.getbbox()
sil = sil.crop(bbox)
side = max(sil.size)
sq = Image.new("RGBA", (side, side), (255, 255, 255, 0))
sq.paste(sil, ((side - sil.size[0]) // 2, (side - sil.size[1]) // 2))
for d, k in DENS.items():
    out = os.path.join(RES, f"drawable-{d}")
    os.makedirs(out, exist_ok=True)
    n = round(24 * k)
    pad = round(2 * k)
    can = Image.new("RGBA", (n, n), (255, 255, 255, 0))
    can.paste(sq.resize((n - 2 * pad, n - 2 * pad), Image.LANCZOS), (pad, pad))
    can.save(os.path.join(out, "ic_stat_notify.png"))

# 시작 화면 — 흰 바탕 가운데 별(짧은 변의 30%)
for name in os.listdir(RES):
    p = os.path.join(RES, name, "splash.png")
    if not os.path.exists(p):
        continue
    w, h = Image.open(p).size
    can = Image.new("RGB", (w, h), (255, 255, 255))
    n = round(min(w, h) * 0.3)
    st = mask.resize((n, n), Image.LANCZOS)
    can.paste(st, ((w - n) // 2, (h - n) // 2), st)
    can.save(p)
print("ok")
