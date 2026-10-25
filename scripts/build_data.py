"""sang.xls -> docs/stores.json (사이트가 읽는 가맹점 데이터)

하는 일:
  - 좌표: data/geocache.json에서 주소별 좌표를 붙인다. 못 찾았거나 거제도 밖으로 찍힌 곳은
    같은 읍면동 가맹점들의 중심 근처에 나선형으로 흩어 놓고 precision="area"로 표시한다.
  - 업종·브랜드: 브랜드(brands.py) → 직접 지정(data/overrides.csv) → 키워드(categories.py) 순.
    상호에 정유사가 없는 주유소는 100m 안의 OSM 주유소(data/osm_fuel.json)로 브랜드를 찾는다.
  - 세부 종류: 음식점 등은 치킨·중식·고기… 같은 종류를 붙인다.
  - 지역: 가맹점이 10곳 미만인 읍면동은 가장 가까운 읍면동과 묶는다.
  - docs/index.html의 style.css·app.js 버전 번호를 바꿔 방문자 캐시를 갱신한다.
  - '기타'로 남은 가맹점을 data/uncategorized.csv로 뽑는다.
  - 제로페이 가맹점(data/zeropay_geoje.json)을 합친다. 지류와 같은 가게(data/zeropay_match.json,
    match_zeropay.py가 만듦)는 제로페이의 상호·주소·업종·전화를 먼저 쓴다.
    k: 1 = 지류만, 2 = 제로페이만, 3 = 둘 다. t: 전화번호.
"""
import csv
import json
import math
import sys
from collections import Counter, defaultdict
import re
from datetime import date, datetime

from brands import BY_ID, EXCLUDED, brand_meta, find_brand
from categories import DISPLAY_ORDER, ORDER, OTHER_SUB, SUB_ORDER, categorize, subtype
from common import CACHE, GEOJE_BOUNDS, ROOT, clean_addr, load_stores, road_only
from match_zeropay import norm_name
from zeropay import area_of, biz_category, phone, shared_phones

OUT = ROOT / "docs" / "stores.json"
OSM_FUEL = ROOT / "data" / "osm_fuel.json"
OVERRIDES = ROOT / "data" / "overrides.csv"
UNCATEGORIZED = ROOT / "data" / "uncategorized.csv"
ZEROPAY = ROOT / "data" / "zeropay_geoje.json"
ZEROPAY_MATCH = ROOT / "data" / "zeropay_match.json"


def load_overrides():
    if not OVERRIDES.exists():
        OVERRIDES.write_text("상호,업종\n", encoding="utf-8-sig")
        return {}
    with OVERRIDES.open(encoding="utf-8-sig") as f:
        return {r["상호"].strip(): r["업종"].strip() for r in csv.DictReader(f) if r.get("업종")}


def in_geoje(geo):
    b = GEOJE_BOUNDS
    return geo and b["south"] <= geo["lat"] <= b["north"] and b["west"] <= geo["lng"] <= b["east"]


def merge_small_areas(stores, min_count=10):
    """가맹점이 min_count곳 미만인 읍면동은 가맹점 중심이 가장 가까운 큰 읍면동과 묶는다.
    묶인 이름은 '아주동·아양동'처럼 큰 곳 이름을 앞에 둔다."""
    count = defaultdict(int)
    pts = defaultdict(list)
    for s in stores:
        count[s["a"]] += 1
        if s["lat"] is not None and s["p"] == "exact":
            pts[s["a"]].append((s["lat"], s["lng"]))
    center = {a: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for a, v in pts.items()}
    big = [a for a in count if count[a] >= min_count and a in center]

    merged = defaultdict(list)
    for a in count:
        if count[a] >= min_count or a not in center:
            continue
        la, ln = center[a]
        target = min(big, key=lambda b: (center[b][0] - la) ** 2 + ((center[b][1] - ln) * math.cos(math.radians(la))) ** 2)
        merged[target].append(a)

    rename = {}
    for target, smalls in merged.items():
        name = "·".join([target] + sorted(smalls))
        rename[target] = name
        for a in smalls:
            rename[a] = name
    for s in stores:
        s["a"] = rename.get(s["a"], s["a"])
    if rename:
        print("지역 묶음:", {k: v for k, v in rename.items() if k != v.split("·")[0]})


def drop_far_road_points(stores, max_km=1.0):
    """도로 이름으로만 찾은 좌표(precision="road")는 긴 도로(예: 거제대로)면 엉뚱한 동네에 찍힌다.
    같은 읍면동의 정확한 가게 중 가장 가까운 곳이 max_km보다 멀면 버리고 동네 근처 대략 위치로 보낸다."""
    exact = defaultdict(list)
    for s in stores:
        if s["p"] == "exact":
            exact[s["a"]].append((s["lat"], s["lng"]))
    k = math.pi / 180
    dropped = []
    for s in stores:
        if s["p"] != "road" or not exact[s["a"]]:
            continue
        near = min(math.hypot((la - s["lat"]) * k, (ln - s["lng"]) * k * math.cos(s["lat"] * k)) * 6371
                   for la, ln in exact[s["a"]])
        if near > max_km:
            s["lat"] = s["lng"] = None
            s["p"] = "area"
            dropped.append(s["n"])
    if dropped:
        print("도로 위치가 동네와 멀어 대략 위치로:", dropped)


def place_by_area(stores):
    pts = defaultdict(list)
    for s in stores:
        if s["lat"] is not None:
            pts[s["a"]].append((s["lat"], s["lng"]))
    all_pts = [p for v in pts.values() for p in v]
    seq = defaultdict(int)
    for s in stores:
        if s["lat"] is not None:
            continue
        ref = pts[s["a"]] or all_pts
        if not ref:
            continue
        lat0 = sum(p[0] for p in ref) / len(ref)
        lng0 = sum(p[1] for p in ref) / len(ref)
        k = seq[s["a"]] = seq[s["a"]] + 1
        r, t = 0.00035 * math.sqrt(k), k * 2.39996  # 황금각 나선
        s["lat"] = round(lat0 + r * math.sin(t), 6)
        s["lng"] = round(lng0 + r * math.cos(t) / math.cos(math.radians(lat0)), 6)


def nearest_area(stores, geo):
    """좌표가 정확한 가게 중 가장 가까운 곳의 읍면동."""
    k = math.pi / 180
    best = min((s for s in stores if s["p"] == "exact"), default=None,
               key=lambda s: (s["lat"] - geo["lat"]) ** 2 + ((s["lng"] - geo["lng"]) * math.cos(geo["lat"] * k)) ** 2)
    return best and best["a"]


def fuel_brand(geo, osm):
    """좌표가 정확한 주유소만, 100m 안의 OSM 주유소 이름에서 정유사 브랜드를 찾는다."""
    if not geo or geo["precision"] != "exact":
        return None
    best = None
    for st in osm:
        k = math.pi / 180
        dx = (st["lng"] - geo["lng"]) * k * math.cos(geo["lat"] * k)
        d = math.hypot(dx, (st["lat"] - geo["lat"]) * k) * 6371000
        brand = find_brand(st["label"])
        if d < 100 and brand and BY_ID[brand][5] == "주유소" and (not best or d < best[0]):
            best = (d, brand)
    return best and best[1]


def stamp_version():
    """index.html의 style.css?v=…, app.js?v=… 를 지금 시각으로 바꿔 브라우저가 옛 파일을 캐시로 쓰지 않게 한다."""
    index = ROOT / "docs" / "index.html"
    html = index.read_text(encoding="utf-8")
    v = datetime.now().strftime("%Y%m%d%H%M%S")
    index.write_text(re.sub(r'((?:style\.css|app\.js)\?v=)\w+', rf"\g<1>{v}", html), encoding="utf-8")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    df = load_stores()
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    overrides = load_overrides()
    osm_fuel = json.loads(OSM_FUEL.read_text(encoding="utf-8")) if OSM_FUEL.exists() else []

    zp_rows = json.loads(ZEROPAY.read_text(encoding="utf-8")) if ZEROPAY.exists() else []
    zp_match = json.loads(ZEROPAY_MATCH.read_text(encoding="utf-8")) if ZEROPAY_MATCH.exists() else {}
    hq_phones = shared_phones(zp_rows)
    areas = set(df["area"])

    def geo_of(*addrs):
        """정확한 좌표를 먼저, 없으면 도로 수준 좌표를 쓴다 (거제 밖으로 찍힌 것은 버림)."""
        geos = [g for g in (cache.get(clean_addr(a)) for a in addrs if a) if in_geoje(g)]
        return next((g for g in geos if g["precision"] == "exact"), geos[0] if geos else None)

    def make(names, addr, area, z, kind, geo):
        brand = next((b for b in map(find_brand, names) if b), None)
        z_cat, z_sub = biz_category(z["biz_cd"]) if z else (None, None)
        cat = next((overrides[n] for n in names if n in overrides), None) or (
            BY_ID[brand][5] if brand else z_cat or categorize(names[0]))
        if cat == "기타" and len(names) > 1:
            cat = categorize(names[1])
        if cat == "주유소" and not brand:
            brand = fuel_brand(geo, osm_fuel)
        if brand in EXCLUDED:
            brand = None
        sub = subtype(cat, " ".join(names))
        if sub == OTHER_SUB and z_sub and z_cat == cat:
            sub = z_sub
        tel = z and phone(z["tel"])
        other = [n for n in names[1:] if norm_name(n) != norm_name(names[0])]
        return {
            "n": names[0],
            **({"o": other[0]} if other else {}),
            "a": area,
            "d": addr,
            "c": cat,
            **({"b": brand} if brand else {}),
            **({"s": sub} if sub else {}),
            **({"t": tel} if tel and tel not in hq_phones else {}),
            "k": kind,
            "lat": geo["lat"] if geo else None,
            "lng": geo["lng"] if geo else None,
            "p": geo["precision"] if geo else "area",
        }

    stores, used = [], set()
    for r in df.itertuples():
        z = zp_match.get(f"{r.name}|{r.addr}")
        if z:
            used.add(f'{z["name"]}|{z["addr"]}')
            stores.append(make([z["name"], r.name], z["addr"], area_of(z["addr"], areas) or r.area, z, 3,
                               geo_of(z["addr"], r.addr)))
        else:
            stores.append(make([r.name], r.addr, r.area, None, 1, geo_of(r.addr)))

    # 제로페이에만 있는 가게. 주소에 읍면동이 없으면 같은 도로의 가게들이 가장 많이 속한 읍면동으로 둔다.
    road_area = defaultdict(Counter)
    for s in stores:
        road_area[road_only(clean_addr(s["d"]))][s["a"]] += 1
    no_area = []
    for z in zp_rows:
        if f'{z["name"]}|{z["addr"]}' in used:
            continue
        road = road_only(clean_addr(z["addr"]))
        area = area_of(z["addr"], areas) or (road_area[road].most_common(1)[0][0] if road and road_area.get(road) else None)
        geo = geo_of(z["addr"])
        if not area and geo:
            area = nearest_area(stores, geo)
        if not area:
            no_area.append(z["name"])
            continue
        stores.append(make([z["name"]], z["addr"], area, z, 2, geo))
    if no_area:
        print("읍면동을 몰라 뺀 제로페이 가게:", no_area)

    merge_small_areas(stores)
    drop_far_road_points(stores)
    place_by_area(stores)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": date.today().isoformat(),
        "categories": DISPLAY_ORDER,
        "subtypes": SUB_ORDER,
        "bounds": GEOJE_BOUNDS,
        "brands": brand_meta(),
        "stores": stores,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    stamp_version()

    with UNCATEGORIZED.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["상호", "업종", "주소"])
        for s in stores:
            if s["c"] == "기타":
                w.writerow([s["n"], "", s["d"]])

    counts = defaultdict(int)
    for s in stores:
        counts[s["p"]] += 1
    print(f"{len(stores)}곳 저장 -> {OUT}")
    print("좌표 정확도:", dict(counts))
    bc = defaultdict(int)
    for s in stores:
        if "b" in s:
            bc[s["b"]] += 1
    print("브랜드:", dict(sorted(bc.items(), key=lambda x: -x[1])))
    print("업종:", {c: sum(1 for s in stores if s["c"] == c) for c in ORDER})
    print("구분:", {"지류만": sum(s["k"] == 1 for s in stores), "제로페이만": sum(s["k"] == 2 for s in stores),
                  "둘 다": sum(s["k"] == 3 for s in stores), "전화": sum("t" in s for s in stores)})


if __name__ == "__main__":
    main()
