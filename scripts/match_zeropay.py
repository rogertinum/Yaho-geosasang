"""제로페이 가맹점 찾기에서 받은 거제시 가맹점(data/zeropay_geoje.json)을 우리 목록과 맞춘다.

같은 가게로 보는 기준 (위에서부터):
  1. 도로명+건물번호가 같고, 상호가 비슷하다 (한쪽이 다른 쪽을 품거나, 같은 브랜드)
  2. 상호가 똑같고(띄어쓰기·괄호 무시) 도로명이 같다
  3. 같은 브랜드의 같은 지점 이름 (씨유↔CU, '거제'·'점' 무시. 후보가 하나일 때만)
결과: data/zeropay_match.json (우리 가게 → 제로페이 업종·전화·최근결제), 못 맞춘 목록은 화면에 요약.
  python scripts/match_zeropay.py
"""
import json
import re
import sys
from collections import defaultdict

from brands import find_brand
from common import ROOT, load_stores

SRC = ROOT / "data" / "zeropay_geoje.json"
OUT = ROOT / "data" / "zeropay_match.json"


def norm_name(s):
    s = re.sub(r"\(주\)|㈜|주식회사|\(.*?\)|[\s·.,\-_&/'\"]", "", s or "")
    return s.lower()


BRAND_WORDS = re.compile(r"씨유|cu|gs25시?|지에스25|지에스\(gs\)25|지에스|gs|세븐일레븐|7-?eleven|이마트24|이마트|미니스톱|씨스페이스|블루25|롯데택배")


def branch(name):
    """지점 이름만 남긴다: 'CU 거제수양점' -> '수양', '씨유거제수양점' -> '수양'"""
    n = BRAND_WORDS.sub("", norm_name(name))
    n = re.sub(r"^거제|거제|점$|편의점", "", n)
    return n


def road_key(addr):
    """'경상남도 거제시 아주1로3길 41 (아주동)' -> ('아주1로3길', '41')"""
    m = re.search(r"([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)", addr or "")
    return (m.group(1), m.group(2)) if m else None


def similar(a, b):
    na, nb = norm_name(a), norm_name(b)
    if not na or not nb:
        return False
    if na in nb or nb in na:
        return True
    ba, bb = find_brand(a), find_brand(b)
    return bool(ba and ba == bb)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    zp = json.loads(SRC.read_text(encoding="utf-8"))
    by_road = defaultdict(list)
    by_name = defaultdict(list)
    by_branch = defaultdict(list)
    for z in zp:
        k = road_key(z["addr"])
        if k:
            by_road[k].append(z)
        by_name[norm_name(z["name"])].append(z)
        by_branch[branch(z["name"])].append(z)

    stores = load_stores()
    matched, how = {}, defaultdict(int)
    for r in stores.itertuples():
        key = f"{r.name}|{r.addr}"
        k = road_key(r.addr)
        cands = [z for z in by_road.get(k, []) if similar(r.name, z["name"])] if k else []
        if cands:
            matched[key] = cands[0]
            how["주소+상호"] += 1
            continue
        same = [z for z in by_name.get(norm_name(r.name), []) if k and road_key(z["addr"]) and road_key(z["addr"])[0] == k[0]]
        if same:
            matched[key] = same[0]
            how["상호+도로명"] += 1
            continue
        # 3. 같은 브랜드의 같은 지점 이름 (주소 표기가 달라도). 후보가 하나일 때만
        b, br = find_brand(r.name), branch(r.name)
        if b and len(br) >= 2:
            cands = [z for z in by_branch.get(br, []) if find_brand(z["name"]) == b]
            if len({road_key(z["addr"]) for z in cands}) == 1:
                matched[key] = cands[0]
                how["브랜드+지점명"] += 1

    OUT.write_text(json.dumps(matched, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"제로페이 {len(zp)}곳 / 우리 목록 {len(stores)}곳 → 맞춘 가게 {len(matched)}곳 {dict(how)}")
    return matched, zp, stores


if __name__ == "__main__":
    main()
