"""주소 -> 좌표 변환 (OpenStreetMap Nominatim, 키 불필요).

Nominatim 이용 규칙에 따라 초당 1건만 요청한다. 결과는 data/geocache.json에
계속 저장하므로 중간에 멈춰도 다시 실행하면 이어서 진행한다.
지류 가맹점(sang.xls)과 제로페이 가맹점(data/zeropay_geoje.json) 주소를 모두 변환한다.
"""
import json
import sys
import time
import urllib.parse
import urllib.request

from common import CACHE, ROOT, clean_addr, load_stores, road_only

ZEROPAY = ROOT / "data" / "zeropay_geoje.json"

URL = "https://nominatim.openstreetmap.org/search?"
HEADERS = {"User-Agent": "geoje-pay-map/1.0 (one-off geocoding of store list)"}
DELAY = 1.1


def query(q):
    params = {"q": q, "format": "jsonv2", "limit": 1, "countrycodes": "kr"}
    req = urllib.request.Request(URL + urllib.parse.urlencode(params), headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            time.sleep(DELAY)
            return data[0] if data else None
        except Exception as e:
            print("  retry", attempt + 1, e, flush=True)
            time.sleep(5 * (attempt + 1))
    return None


def save(cache):
    tmp = CACHE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
    tmp.replace(CACHE)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    CACHE.parent.mkdir(exist_ok=True)
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    addrs = {clean_addr(a) for a in load_stores()["addr"]}
    if ZEROPAY.exists():
        addrs |= {clean_addr(r["addr"]) for r in json.loads(ZEROPAY.read_text(encoding="utf-8"))}
    addrs = sorted(addrs)
    todo = [a for a in addrs if a not in cache]
    print(f"주소 {len(addrs)}개 중 {len(todo)}개 변환 필요", flush=True)

    for i, addr in enumerate(todo, 1):
        hit, precision = query(addr), "exact"
        if not hit and road_only(addr):
            hit, precision = query(road_only(addr)), "road"
        cache[addr] = (
            {"lat": round(float(hit["lat"]), 6), "lng": round(float(hit["lon"]), 6), "precision": precision}
            if hit else None
        )
        if i % 20 == 0 or i == len(todo):
            save(cache)
            found = sum(1 for v in cache.values() if v)
            print(f"{i}/{len(todo)} 진행, 누적 성공 {found}/{len(cache)}", flush=True)
    save(cache)


if __name__ == "__main__":
    main()
