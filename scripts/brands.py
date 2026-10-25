"""상호로 프랜차이즈 브랜드를 찾는다. 위에서부터 먼저 걸리는 규칙이 이긴다.

각 브랜드: (id, 표시이름, 핀 글자, 배경색, 글자색, 업종, 상호 패턴)
업종이 있으면 키워드 분류보다 우선한다. docs/brands/<id>.png(또는 .svg)를 넣고
LOGOS에 등록하면 글자 핀 대신 그 이미지를 쓴다.
"""
import re

BRANDS = [
    # 편의점
    ("gs25", "GS25", "GS25", "#00a5e5", "#fff", "편의점", r"GS\s*25|지에스\s*(\(\s*GS\s*\))?\s*25|^지에스[\s(]"),  # '지에스 ○○점'도 GS25
    ("cu", "CU", "CU", "#753bbd", "#d8ff3c", "편의점", r"씨유|\bCU\b"),
    ("seven", "세븐일레븐", "7", "linear-gradient(180deg,#f47b20 0 20%,#00845a 20% 80%,#ee2737 80%)", "#fff", "편의점", r"세븐일레븐|7-?eleven"),
    ("emart24", "이마트24", "24", "#ffb81c", "#222", "편의점", r"이마트\s*24|emart\s*24"),
    ("ministop", "미니스톱", "MS", "#0064b1", "#fff", "편의점", r"미니스톱"),
    ("cspace", "씨스페이스", "C", "#1b75bc", "#fff", "편의점", r"씨스페이스|블루25"),
    # 주유소·충전소 (상호에 없으면 build_data.py가 OSM 주유소 위치로 찾아 붙인다)
    ("sk", "SK", "SK", "#ea002c", "#fff", "주유소", r"SK\s*(에너지|주유|LPG|가스|Energy)|SK주유소"),
    ("gscaltex", "GS칼텍스", "GS", "#00843d", "#fff", "주유소", r"GS\s*칼텍스|GS\s*Caltex|GS-?LPG"),
    ("hdoilbank", "HD현대오일뱅크", "HD", "#1e4ea1", "#fff", "주유소", r"오일뱅크"),
    ("soil", "S-OIL", "S-OIL", "#ffd200", "#d71920", "주유소", r"S-?OIL|에쓰오일"),
    ("nhoil", "NH(알뜰)", "NH", "#00a651", "#fff", "주유소", r"NH-?OIL|농협주유|알뜰주유|^NH$"),
    ("e1", "E1", "E1", "#e5002b", "#fff", "주유소", r"\bE1\b"),
    # 카페·베이커리
    ("mega", "메가커피", "MGC", "#ffd400", "#3c2415", "카페·베이커리", r"메가커피|메가엠지씨|메가MGC|MEGA\s*COFFEE"),
    ("compose", "컴포즈커피", "CPS", "#ffd100", "#222", "카페·베이커리", r"컴포즈"),
    ("ediya", "이디야", "E", "#0d2a6b", "#fff", "카페·베이커리", r"이디야"),
    ("paik", "빽다방", "빽", "#ffe200", "#1f3c88", "카페·베이커리", r"빽다방"),
    ("starbucks", "스타벅스", "SB", "#00704a", "#fff", "카페·베이커리", r"스타벅스"),
    ("twosome", "투썸플레이스", "TW", "#d0021b", "#fff", "카페·베이커리", r"투썸"),
    ("hasamdong", "하삼동커피", "하삼", "#5b3a29", "#fff", "카페·베이커리", r"하삼동"),
    ("mammoth", "매머드커피", "MM", "#2b2b2b", "#fff", "카페·베이커리", r"매머드"),
    ("theventi", "더벤티", "V", "#5a2d82", "#fff", "카페·베이커리", r"더벤티"),
    ("parisbaguette", "파리바게뜨", "PB", "#1d4ea2", "#fff", "카페·베이커리", r"파리바게"),
    ("touslesjours", "뚜레쥬르", "TLJ", "#00523e", "#fff", "카페·베이커리", r"뚜레쥬르"),
    ("dunkin", "던킨", "DD", "#ff671f", "#fff", "카페·베이커리", r"던킨"),
    ("baskin", "배스킨라빈스", "BR", "#da1884", "#fff", "카페·베이커리", r"배스킨|베스킨"),
    # 치킨·피자·버거
    ("bbq", "BBQ", "BBQ", "#e4002b", "#fff", "음식점", r"비비큐|BBQ"),
    ("bhc", "BHC", "bhc", "#f5a800", "#222", "음식점", r"BHC|비에이치씨"),
    ("kyochon", "교촌치킨", "교촌", "#7a5c2e", "#fff", "음식점", r"교촌"),
    ("goobne", "굽네치킨", "굽네", "#c8102e", "#fff", "음식점", r"굽네"),
    ("nene", "네네치킨", "NE", "#ffcd00", "#d71920", "음식점", r"네네치킨"),
    ("mexicana", "멕시카나", "MX", "#e60012", "#ffe100", "음식점", r"멕시카나|맥시카나"),
    ("hosigi", "호식이두마리치킨", "호식", "#f7a600", "#222", "음식점", r"호식이"),
    ("zicova", "지코바", "ZI", "#000", "#ffcc00", "음식점", r"지코바"),
    ("norang", "노랑통닭", "노랑", "#ffd200", "#222", "음식점", r"노랑통닭"),
    ("gamachi", "가마치통닭", "가마", "#d32f2f", "#fff", "음식점", r"가마치"),
    ("domino", "도미노피자", "D", "#006491", "#fff", "음식점", r"도미노"),
    ("pizzamaru", "피자마루", "PM", "#00843d", "#fff", "음식점", r"피자마루"),
    ("lotteria", "롯데리아", "LR", "#e60012", "#fff", "음식점", r"롯데리아"),
    ("momstouch", "맘스터치", "MT", "#c8102e", "#ffd100", "음식점", r"맘스터치"),
    ("subway", "써브웨이", "SW", "#008c15", "#ffc20d", "음식점", r"써브웨이|서브웨이"),
    ("bonjuk", "본죽", "본", "#7b3f00", "#fff", "음식점", r"본죽"),
    # 생활·쇼핑·자동차
    ("daiso", "다이소", "DAISO", "#e60012", "#fff", "쇼핑·의류", r"다이소"),
    ("oliveyoung", "올리브영", "OY", "#9bce3b", "#fff", "미용·뷰티", r"올리브영"),
    ("crintopia", "크린토피아", "CT", "#0072bc", "#fff", "생활서비스", r"크린토피아"),
    ("hanaro", "하나로마트", "NH", "#00a651", "#fff", "마트·식품", r"하나로"),
    ("speedmate", "스피드메이트", "SM", "#ea002c", "#fff", "자동차", r"스피드메이트"),
    ("hankook", "한국타이어", "HK", "#f47920", "#fff", "자동차", r"한국타이어|티스테이션"),
]

LOGOS = {}  # 예: {"gs25": "brands/gs25.png"}

# 브랜드 마크를 쓰지 않는 브랜드 (마커 정리 페이지에서 고름, 2026-10-25).
# 업종 판단에는 그대로 쓰고, 지도 핀·목록 배지·브랜드 칩에서만 뺀다.
EXCLUDED = {"cspace", "ministop", "nhoil", "starbucks"}

COMPILED = [(b[0], re.compile(b[6], re.IGNORECASE)) for b in BRANDS]
BY_ID = {b[0]: b for b in BRANDS}


def find_brand(name):
    for bid, rx in COMPILED:
        if rx.search(name):
            return bid
    return None


def brand_meta():
    return {
        b[0]: {"name": b[1], "label": b[2], "bg": b[3], "fg": b[4], **({"logo": LOGOS[b[0]]} if b[0] in LOGOS else {})}
        for b in BRANDS if b[0] not in EXCLUDED
    }
