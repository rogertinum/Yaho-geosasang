"""OpenStreetMap에서 거제도의 이름 있는 큰 아파트 단지를 받아 docs/apartments.json에 저장한다.

지도 바탕(OpenFreeMap)에는 아파트 단지 이름이 없어서, 확대했을 때 사이트가 이 파일로 단지 이름을 직접 쓴다.
  python scripts/fetch_apartments.py
"""
import json
import math
import re
import sys
import urllib.parse
import urllib.request

from common import GEOJE_BOUNDS, ROOT

OUT = ROOT / "docs" / "apartments.json"
MIN_AREA = 8000  # ㎡. 이보다 작은 빌라·단독 동은 뺀다
SKIP = re.compile(r"마을$|\d+동$")  # '○○마을'(동네 이름), '103동'(건물 하나)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    b = GEOJE_BOUNDS
    box = f'{b["south"]},{b["west"]},{b["north"]},{b["east"]}'
    q = (f'[out:json][timeout:90];(way["landuse"="residential"]["name"]({box});'
         f'relation["landuse"="residential"]["name"]({box}););out bb tags;')
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": q}).encode(),
        headers={"User-Agent": "geoje-pay-map/1.0"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    elements = data["elements"]
    if not elements:
        sys.exit(f"OpenStreetMap 응답이 비었어요 (잠시 뒤 다시 실행): {data.get('remark', '')}")

    apts = []
    for e in elements:
        bb, name = e.get("bounds"), e.get("tags", {}).get("name", "").strip()
        if not (bb and name) or SKIP.search(name):
            continue
        lat, lng = (bb["minlat"] + bb["maxlat"]) / 2, (bb["minlon"] + bb["maxlon"]) / 2  # 범위의 가운데
        area = (bb["maxlat"] - bb["minlat"]) * 111_000 * (bb["maxlon"] - bb["minlon"]) * 111_000 * math.cos(math.radians(lat))
        if area >= MIN_AREA:
            apts.append({"n": name, "lat": round(lat, 6), "lng": round(lng, 6), "s": int(area)})
    apts.sort(key=lambda a: -a["s"])  # 큰 단지부터 (지도에서 자리 다툼이 나면 큰 곳이 이긴다)
    OUT.write_text(json.dumps(apts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"아파트 단지 {len(apts)}곳 저장 -> {OUT}")


if __name__ == "__main__":
    main()
