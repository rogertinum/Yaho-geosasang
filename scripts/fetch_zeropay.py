"""제로페이 '가맹점 찾기'에서 거제시 가맹점(업종·매장명·도로명 주소·전화·최근결제)을 받는다.

  python scripts/fetch_zeropay.py              data/zeropay_codes.json 의 업종 전부 (끝난 업종은 건너뜀)
  python scripts/fetch_zeropay.py 47122 56111  지정한 업종만 (47122 = 체인화 편의점)

- 업종을 하나씩 골라야 검색되므로 업종 코드별로 받는다.
- 이 사이트는 쪽을 넘길 때마다 순서가 섞여 같은 가게가 겹치고 빠지는 가게가 생긴다.
  그래서 한 검색을 여러 번 돌며 모으고, 한 바퀴를 돌아도 새 가게가 안 나오면 멈춘다.
- 검색 결과가 1,000건에서 잘리므로, 1,000건 이상인 업종은 주소 글자(읍면동·도로 이름)로 나눠 받는다.
- 사이트에 부담이 가지 않게 요청 사이 1.1초를 쉰다.
- 결과는 data/zeropay_geoje.json 에 쌓고(매장명|주소 기준으로 합침), 끝난 업종은 data/zeropay_done.json 에 적는다.
"""
import http.cookiejar
import json
import math
import sys
import time
import urllib.parse
import urllib.request

from common import ROOT

OUT = ROOT / "data" / "zeropay_geoje.json"
DONE = ROOT / "data" / "zeropay_done.json"
CODES = ROOT / "data" / "zeropay_codes.json"
BASE = "https://www.zeropay.or.kr/UI_HP_009_03"
HEADERS = {
    "User-Agent": "Mozilla/5.0 geoje-pay-map/1.0",
    "Referer": BASE + ".act",
    "X-Requested-With": "XMLHttpRequest",
}
DELAY, MAX_PASSES, CAP = 1.1, 6, 1000
# 1,000건이 넘는 업종을 나눠 받을 주소 글자 (겹쳐도 매장명|주소로 합쳐진다)
SPLIT = [
    "사등면", "연초면", "일운면", "거제면", "동부면", "장목면", "하청면", "남부면", "둔덕면",
    "고현", "옥포", "장평", "상동", "아주", "수월", "양정", "능포", "장승포", "문동", "덕포", "두모",
    "마전", "삼거", "아양", "중곡", "거제대로", "거제중앙로", "계룡로", "고현로", "옥포로", "옥포대첩로",
    "수양로", "능포로", "장승로", "해명로", "제산로", "용소", "탑곡", "서문로", "동문", "신부", "국산",
    "진목", "성산로", "옥수로", "고현천로", "독봉산", "연사", "오비",
]


class ZeroPay:
    def __init__(self):
        jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        self.op.open(urllib.request.Request(BASE + ".act", headers=HEADERS), timeout=30).read()

    def page(self, biz_cd, page, road=""):
        p = {"AFLT_ADDR_CITY": "경상남도", "AFLT_ADDR_CITY_SUB_1": "경남", "AFLT_ADDR_CITY_SUB_2": "경남",
             "AFLT_ADDR_GU": "거제시", "AFLT_NM": "", "AFLT_ROAD_ADDR": road, "BIZ_TYPE_CD": biz_cd,
             "PAGE_NUM": page, "TRX_TP": "01"}
        data = urllib.parse.urlencode({"_JSON_": urllib.parse.quote(json.dumps(p, ensure_ascii=False))}).encode()
        req = urllib.request.Request(BASE + ".jct", data=data, headers={
            **HEADERS, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})
        for attempt in range(4):
            try:
                d = json.loads(self.op.open(req, timeout=30).read().decode("utf-8"))
                if d.get("COMMON_HEAD", {}).get("ERROR"):
                    raise RuntimeError(d["COMMON_HEAD"])
                time.sleep(DELAY)
                return d
            except Exception as e:
                print("  다시 시도", attempt + 1, e, flush=True)
                time.sleep(5 * (attempt + 1))
        raise RuntimeError(f"{biz_cd} {road} {page}쪽을 받지 못했어요")


def collect(zp, cd, road, found):
    """한 검색(업종 + 주소 글자)을 새 가게가 안 나올 때까지 여러 바퀴 돌며 모은다. 받은 가게 수를 돌려준다."""
    first = zp.page(cd, 1, road)
    total, size = int(first.get("TOTAL_CNT") or 0), int(first.get("PAGE_SIZE") or 10)
    pages, got = math.ceil(total / size), set()

    def keep(rows):
        for r in rows or []:
            row = {"name": r["AFLT_NM"], "addr": r["AFLT_ROAD_ADDR"], "tel": r.get("SHOP_TEL_NO") or "",
                   "biz": r.get("BIZ_TYPE") or "", "biz_cd": cd, "recent": r.get("RECENT_TRAN_YN") or ""}
            key = f'{row["name"]}|{row["addr"]}'
            found[key] = row
            got.add(key)

    keep(first.get("LIST2"))
    for _ in range(MAX_PASSES if pages > 1 else 0):
        before = len(got)
        for p in range(1, pages + 1):
            keep(zp.page(cd, p, road).get("LIST2"))
        if len(got) >= total or len(got) == before:
            break
    return total, len(got)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    codes = sys.argv[1:] or [c for c, _, _ in json.loads(CODES.read_text(encoding="utf-8"))]
    names = {c: n for c, n, _ in json.loads(CODES.read_text(encoding="utf-8"))} if CODES.exists() else {}
    found = {f'{r["name"]}|{r["addr"]}': r for r in json.loads(OUT.read_text(encoding="utf-8"))} if OUT.exists() else {}
    done = set(json.loads(DONE.read_text(encoding="utf-8"))) if DONE.exists() else set()
    zp = ZeroPay()
    for i, cd in enumerate(codes, 1):
        if cd in done and len(sys.argv) == 1:
            continue
        label = f"[{i}/{len(codes)}] {names.get(cd, cd)}"
        total, got = collect(zp, cd, "", found)
        if total >= CAP:  # 1,000건에서 잘림 → 주소 글자로 나눠 받는다
            print(f"{label}: {total}건 이상이라 주소로 나눠 받아요", flush=True)
            for kw in SPLIT:
                t, g = collect(zp, cd, kw, found)
                if t >= CAP:
                    print(f"  ⚠ '{kw}'도 {t}건 이상이라 일부가 빠질 수 있어요", flush=True)
            got = sum(1 for r in found.values() if r["biz_cd"] == cd)
        print(f"{label}: {got}/{total}곳", flush=True)
        OUT.write_text(json.dumps(list(found.values()), ensure_ascii=False, indent=0), encoding="utf-8")
        done.add(cd)
        DONE.write_text(json.dumps(sorted(done)), encoding="utf-8")
    print(f"저장: {OUT} (전체 {len(found)}곳)", flush=True)


if __name__ == "__main__":
    main()
