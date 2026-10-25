# 거제사랑상품권 가맹점 찾기

## 가맹점 목록 업데이트

1. 지류 가맹점: 새 목록 파일을 `sang.xls`로 덮어씁니다.
2. 제로페이 가맹점: 제로페이 '가맹점 찾기'에서 거제시 가맹점을 새로 받습니다. 1시간 30분쯤 걸립니다.
   중간에 멈추면 다시 실행해 이어 받고, 처음부터 새로 받을 때는 `data/zeropay_done.json`을 먼저 지웁니다.
   ```bash
   python scripts/fetch_zeropay.py
   ```
3. 새로 생긴 주소의 좌표를 찾습니다. 주소 1개에 1초 정도 걸립니다.
   ```bash
   python scripts/geocode.py
   ```
4. 지류와 제로페이에 같이 있는 가게를 맞추고, 사이트 데이터를 다시 만듭니다.
   ```bash
   python scripts/match_zeropay.py
   python scripts/build_data.py
   ```
5. `docs/` 폴더를 커밋하고 푸시하면 사이트에 반영됩니다.

`data/geocache.json`은 지금까지 찾은 좌표라서 지우지 마세요. 지우면 처음부터 다시 찾느라 3시간 가까이 걸립니다.

아파트 단지 이름(지도 표시용)을 새로 받으려면 `python scripts/fetch_apartments.py`를 실행합니다.
