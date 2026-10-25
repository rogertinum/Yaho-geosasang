// 홈 화면 앱(웹앱)용 서비스 워커.
// 항상 인터넷에서 새 파일을 먼저 받고(그래서 사이트를 고치면 바로 반영), 인터넷이 끊겼을 때만
// 마지막으로 받아 둔 같은 사이트 파일을 보여준다. 지도 타일 같은 다른 사이트 파일은 건드리지 않는다.
// 첫 화면은 설치할 때 미리 저장해 둔다 (일부 크롬은 오프라인에서도 첫 화면이 열려야 앱 설치를 허용).
const CACHE = "geosasang-v3";
const START = ["./", "manifest.webmanifest?v=2", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(START)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req, { ignoreSearch: true }))
        || (req.mode === "navigate" ? caches.match("./") : undefined)),
  );
});
