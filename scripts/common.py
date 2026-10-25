"""sang.xls(실제로는 HTML 표) 읽기와 주소 정리 공용 함수."""
import io
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "sang.xls"
CACHE = ROOT / "data" / "geocache.json"

# 거제도(가조도·칠천도 포함) 범위. 이 밖으로 찍힌 좌표는 잘못 찾은 것으로 본다.
GEOJE_BOUNDS = {"south": 34.62, "west": 128.43, "north": 35.08, "east": 128.78}


def load_stores():
    html = SOURCE.read_bytes().decode("utf-8")
    df = pd.read_html(io.StringIO(html))[0]
    df.columns = ["no", "area", "name", "addr"]
    for c in ["area", "name", "addr"]:
        df[c] = df[c].astype(str).str.strip().str.replace(r"\s+", " ", regex=True)
    return df


def clean_addr(addr):
    """'경상남도 거제시 옥포로5길 26(옥포동, 혜성비치맨션)' -> '경상남도 거제시 옥포로5길 26'"""
    addr = re.sub(r"\(.*?\)", "", addr)
    addr = re.sub(r",.*$", "", addr)
    return re.sub(r"\s+", " ", addr).strip()


def road_only(addr):
    """건물번호를 떼고 도로명까지만 남긴다 (정확한 주소를 못 찾을 때 대안)."""
    m = re.match(r"(.*?(?:로|길))\s*\d", addr)
    return m.group(1) if m else None
