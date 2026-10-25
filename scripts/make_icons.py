"""앱 아이콘 만들기 (거제시 2024 슬로건 3색: 남보라 #36318F, 자홍 #E40077, 주황 #F5A200).

  python scripts/make_icons.py            후보 4종 미리보기 → data/icon-candidates.png
  python scripts/make_icons.py pins [D5 D6 …]  D안 핀 색 후보 미리보기 → data/icon-d-pins.png
  python scripts/make_icons.py <후보>     고른 후보로 docs/icons/ 아래 앱 아이콘 생성 (A·B·C·D·D1~D6)

홈 화면 아이콘은 기기마다 모양(원·둥근 사각형)을 잘라 쓰므로, 그림은 가운데 80% 안에 둔다.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
NAVY, PINK, AMBER, WHITE = "#36318F", "#E40077", "#F5A200", "#FFFFFF"
FONT = "C:/Windows/Fonts/malgunbd.ttf"
S = 1024  # 크게 그린 뒤 줄여서 가장자리를 매끈하게


def font(size):
    return ImageFont.truetype(FONT, size)


def center_text(d, text, cx, cy, size, fill):
    f = font(size)
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    d.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), text, font=f, fill=fill)


def pin(d, cx, top, w, fill):
    """지도 핀: 원 + 아래로 뾰족한 꼬리"""
    r = w / 2
    d.ellipse((cx - r, top, cx + r, top + w), fill=fill)
    d.polygon([(cx - r * 0.72, top + w * 0.78), (cx + r * 0.72, top + w * 0.78), (cx, top + w * 1.42)], fill=fill)
    return (cx, top + r)  # 원 중심


def stripe(d, x0, y, x1, h):
    w = (x1 - x0) / 3
    for i, c in enumerate((NAVY, PINK, AMBER)):
        d.rounded_rectangle((x0 + w * i, y, x0 + w * (i + 1), y + h), radius=0, fill=c)


def icon_a():
    """A. 거사 글자 + 3색 띠: 사이트 제목처럼 흰 바탕에 남보라 '거사', 아래 3색 띠"""
    im = Image.new("RGB", (S, S), WHITE)
    d = ImageDraw.Draw(im)
    center_text(d, "거사", S / 2, S * 0.45, 330, NAVY)
    stripe(d, S * 0.24, S * 0.66, S * 0.76, 46)
    return im


def icon_b():
    """B. 지도 핀 + 상품권 동전: 남보라 바탕, 자홍 핀 안에 주황 동전 '₩'"""
    im = Image.new("RGB", (S, S), NAVY)
    d = ImageDraw.Draw(im)
    cx, cy = pin(d, S / 2, S * 0.17, S * 0.48, PINK)
    r = S * 0.15
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=AMBER)
    center_text(d, "₩", cx, cy, 200, NAVY)
    return im


def icon_c():
    """C. 상품권 티켓: 자홍 바탕, 흰 티켓(양옆 홈) 안에 남보라 '거', 주황 띠"""
    im = Image.new("RGB", (S, S), PINK)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = S * 0.17, S * 0.29, S * 0.83, S * 0.71
    d.rounded_rectangle((x0, y0, x1, y1), radius=48, fill=WHITE)
    n = 56  # 티켓 양옆 반원 홈
    for x in (x0, x1):
        d.ellipse((x - n, S / 2 - n, x + n, S / 2 + n), fill=PINK)
    d.rectangle((x1 - 150, y0, x1 - 112, y1), fill=AMBER)
    center_text(d, "거", (x0 + x1 - 150) / 2, S / 2, 260, NAVY)
    return im


def icon_d(pin_fill=NAVY, ring=WHITE, hole=WHITE):
    """D. 3색 겹친 원 + 핀: 흰 바탕에 슬로건 3색 원, 가운데 테두리 두른 핀"""
    im = Image.new("RGB", (S, S), WHITE)
    d = ImageDraw.Draw(im, "RGBA")
    r = S * 0.2
    for (dx, dy), c in zip(((-0.11, 0.07), (0.11, 0.07), (0, -0.12)), ((54, 49, 143, 235), (228, 0, 119, 225), (245, 162, 0, 225))):
        cx, cy = S / 2 + dx * S, S / 2 + dy * S
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=c)
    pin(d, S / 2, S * 0.30, S * 0.30, ring)
    cx, cy = pin(d, S / 2, S * 0.325, S * 0.25, pin_fill)
    d.ellipse((cx - 42, cy - 42, cx + 42, cy + 42), fill=hole)
    return im


INK = "#1D1C2B"
# D안 핀 색 후보
D_PINS = {
    "D1": ("먹색 핀", lambda: icon_d(INK)),
    "D2": ("흰 핀 + 남보라 테두리", lambda: icon_d(WHITE, NAVY, NAVY)),
    "D3": ("자홍 핀", lambda: icon_d(PINK)),
    "D4": ("남보라 핀 + 주황 테두리", lambda: icon_d(NAVY, AMBER)),
    "D5": ("빨간 핀 (Geoje Red)", lambda: icon_d("#D7192A")),
    "D6": ("노란 핀", lambda: icon_d("#FFC400")),
}


ICONS = {"A": icon_a, "B": icon_b, "C": icon_c, "D": icon_d, **{k: fn for k, (_, fn) in D_PINS.items()}}
LABELS = {"A": "A  거사 + 3색 띠", "B": "B  지도 핀 + ₩", "C": "C  상품권 티켓", "D": "D  3색 원 + 핀"}


def rounded(im, size):
    """미리보기용: 휴대폰 홈 화면처럼 둥근 사각형으로 자른다"""
    im = im.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), radius=size // 4.5, fill=255)
    out = Image.new("RGBA", (size, size))
    out.paste(im, (0, 0), mask)
    return out


def preview(keys=("A", "B", "C", "D"), name="icon-candidates.png"):
    tile, gap = 260, 60
    w = gap + len(keys) * (tile + gap)
    sheet = Image.new("RGB", (w, tile + 150), "#F6F6FA")
    d = ImageDraw.Draw(sheet)
    labels = {**LABELS, **{k: f"{k}  {v[0]}" for k, v in D_PINS.items()}}
    for i, k in enumerate(keys):
        x = gap + i * (tile + gap)
        img = rounded(ICONS[k](), tile)
        sheet.paste(img, (x, 40), img)
        center_text(d, labels[k], x + tile / 2, tile + 90, 26, "#1D1C2B")
    out = ROOT / "data" / name
    sheet.save(out)
    print(out)


def build(key):
    """앱 아이콘 파일들.
    - icon-192/512: 모서리를 둥글게 깎은 둥근 사각형 (일반 아이콘)
    - icon-maskable-512: 꽉 찬 사각형. 안드로이드 런처가 자기 모양(둥근 사각형·원)으로 깎는다
    - apple-touch-icon: 꽉 찬 사각형. 아이폰이 스스로 모서리를 둥글게 깎는다
    """
    base = ICONS[key]()
    out = ROOT / "docs" / "icons"
    out.mkdir(exist_ok=True)
    for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (32, "favicon-32.png")):
        rounded(base, size).save(out / name, optimize=True)
    for size, name in ((512, "icon-maskable-512.png"), (180, "apple-touch-icon.png")):
        base.resize((size, size), Image.LANCZOS).save(out / name, optimize=True)
    print(f"{key} 아이콘 → {out}")


def og_image(key="D5"):
    """링크 공유 미리보기용 대표 이미지 (1200×630): 왼쪽에 앱 아이콘, 오른쪽에 제목, 아래 3색 띠"""
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(im)
    icon = rounded(ICONS[key](), 380)
    im.paste(icon, (90, (H - 380) // 2 - 20), icon)
    x = 520
    d.text((x, 160), "거제사랑상품권", font=font(84), fill=NAVY)
    d.text((x, 268), "가맹점 찾기", font=font(84), fill=PINK)
    d.text((x, 400), "상호·업종·지역·내 주변으로 3,396곳", font=font(34), fill="#66647A")
    stripe(d, 0, H - 26, W, 26)
    out = ROOT / "docs" / "og-image.png"
    im.save(out, optimize=True)
    print(f"공유 이미지 → {out}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1].upper() == "OG":
        og_image()
    elif len(sys.argv) > 1 and sys.argv[1].upper() == "PINS":
        preview(tuple(sys.argv[2:]) or tuple(D_PINS), "icon-d-pins.png")
    elif len(sys.argv) > 1:
        build(sys.argv[1].upper())
    else:
        preview()
