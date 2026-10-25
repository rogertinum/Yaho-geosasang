"""OpenStreetMap에서 거제도 주유소·충전소 위치와 이름을 받아 data/osm_fuel.json에 저장한다.

가맹점 목록의 주유소 상호에는 정유사 브랜드가 거의 없어서(예: 송정주유소),
build_data.py가 이 파일에서 가까운(100m 이내) 주유소를 찾아 브랜드를 붙인다.
"""
import json
import sys
import urllib.parse
import urllib.request

from common import GEOJE_BOUNDS, ROOT

OUT = ROOT / "data" / "osm_fuel.json"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    b = GEOJE_BOUNDS
    q = f'[out:json][timeout:60];nwr[amenity=fuel]({b["south"]},{b["west"]},{b["north"]},{b["east"]});out center tags;'
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": q}).encode(),
        headers={"User-Agent": "geoje-pay-map/1.0"},
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        elements = json.load(r)["elements"]
    stations = []
    for e in elements:
        t = e.get("tags", {})
        label = " ".join(filter(None, [t.get("brand"), t.get("name"), t.get("operator")]))
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lng = e.get("lon") or e.get("center", {}).get("lon")
        if label and lat:
            stations.append({"label": label, "lat": lat, "lng": lng})
    OUT.write_text(json.dumps(stations, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"주유소 {len(stations)}곳 저장 -> {OUT}")


if __name__ == "__main__":
    main()
