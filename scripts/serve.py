"""미리보기 서버: docs/ 폴더를 http://localhost:8765 (같은 와이파이에서는 PC의 내부 IP)로 연다.

python -m http.server와 같지만, 모든 응답에 'Cache-Control: no-cache'를 붙여서
파일을 고친 뒤 새로고침하면 브라우저가 항상 새 파일을 받게 한다.
테스트는 콘솔에서  await eval(await (await fetch("/__tests__/ui-scenarios.js")).text())  로 돌린다.
"""
import functools
import http.server
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
TESTS = DOCS.parent / "tests"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json"}

    def translate_path(self, path):
        # /__tests__/… 는 tests 폴더에서 준다 (콘솔에서 테스트를 불러 쓰기 위한 것. 배포되지 않는다)
        if path.startswith("/__tests__/"):
            return str(TESTS / Path(path.split("?")[0]).name)
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCacheHandler, directory=str(DOCS))
    # 0.0.0.0: 이 PC(localhost)와 같은 와이파이의 휴대폰 모두에서 열린다
    with http.server.ThreadingHTTPServer(("0.0.0.0", port), handler) as httpd:
        print(f"Serving {DOCS} on http://localhost:{port}/", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
