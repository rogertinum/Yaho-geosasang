/*
 * 가맹점 찾기 화면 시나리오 테스트 (브라우저 콘솔에서 실행)
 *
 * 1) 미리보기 서버를 켠다:  python scripts/serve.py
 * 2) 위치 없음 시나리오:     http://localhost:8765/              를 열고 콘솔에서 아래 한 줄을 실행한다
 * 3) 위치 있음 시나리오:     http://localhost:8765/?fakeGeo=34.8806,128.6211 (거제시청 근처) 에서 다시 실행한다
 *      await eval(await (await fetch("/__tests__/ui-scenarios.js")).text())
 *
 * 지도 이동 애니메이션은 화면에 보이는 탭에서만 진행되므로, 반드시 탭을 앞에 띄운 상태에서 실행한다.
 * 위치 있음 모드는 1분 가까이 걸린다.
 * 결과는 console.table로 나오고, 마지막 식의 값으로도 돌려준다.
 * 화면 설정(글자 크기·모드)은 시작할 때 저장해 두었다가 끝나면 되돌린다.
 */
(async () => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(100); } return false; };
  const num = (t) => +String(t).replace(/[^\d]/g, "");
  const count = () => num($("#count").textContent.split("곳")[0]);
  const click = async (sel, ms) => { const e = typeof sel === "string" ? $(sel) : sel; if (!e) throw new Error("없음: " + sel); e.click(); await wait(ms); };
  const type = async (v) => { const q = $("#q"); q.value = v; q.dispatchEvent(new Event("input")); await wait(450); };
  const pickArea = async (a) => { const s = $("#area"); s.value = a; s.dispatchEvent(new Event("change")); await wait(); };
  const home = () => click("#home", 600);
  const dists = () => $$(".item .item-dist").map((e) => { const t = e.textContent; return t.endsWith("km") ? parseFloat(t) * 1000 : parseFloat(t); });
  const sorted = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);
  // 내 위치 점이 지도 한가운데에서 몇 px 떨어져 있는지
  const state_ok = () => !!$("#chips .chip.picked") && !$("#areaPicked").hidden;
  const offCenter = () => {
    const d = $(".me-dot")?.getBoundingClientRect(), m = $("#map").getBoundingClientRect();
    return d ? Math.round(Math.hypot(d.left + d.width / 2 - (m.left + m.width / 2), d.top + d.height / 2 - (m.top + m.height / 2))) : Infinity;
  };

  const results = [];
  const check = (scenario, ok, detail) => results.push({ 시나리오: scenario, 결과: ok ? "통과" : "실패", 근거: detail });
  const run = async (scenario, fn) => {
    try { await fn((ok, detail) => check(scenario, ok, detail)); } catch (e) { check(scenario, false, "오류: " + e.message); }
  };

  const savedPrefs = localStorage.getItem("geosasang:prefs");
  await until(() => !/불러오는/.test($("#meta").textContent));
  if ($("#guide").open) $("#guide .guide-start").click(); // 처음 접속 안내가 떠 있으면 닫는다 (닫으면 위치를 묻는다)
  const fake = /fakeGeo=/.test(location.search);
  // 기대 숫자는 사이트가 읽는 stores.json에서 직접 센다 (목록이 바뀌어도 테스트를 고치지 않게)
  const data = (await (await fetch("stores.json", { cache: "no-cache" })).json()).stores;
  const countBy = (f) => data.filter(f).length;
  const total = data.length;
  if ($("#zpToggle").getAttribute("aria-pressed") !== "true") $("#zpToggle").click(); // 제로페이 포함 상태에서 시작

  // 위치 있음 테스트는 '내 주변'이 자동으로 켜지는 상태에서 시작해야 한다.
  // 예전에 꺼 둔 설정이 남아 있으면 지우고 새로고침하니, 다시 붙여 넣어 실행한다.
  if (fake && JSON.parse(savedPrefs || "{}").near === "off") {
    const p = JSON.parse(savedPrefs); delete p.near;
    localStorage.setItem("geosasang:prefs", JSON.stringify(p));
    location.reload();
    return "‘내 주변 끔’ 설정을 지우고 새로고침했어요. 다시 붙여 넣어 실행하세요.";
  }

  if (!fake) {
    // ---------- 위치를 쓸 수 없을 때 ----------
    await run("S1 첫 화면(위치 없음)", async (ok) => {
      await wait(1500); // 위치 요청이 실패할 시간을 준다
      ok(count() === total, `목록 ${count()}곳`);
      ok($("#near").getAttribute("aria-pressed") !== "true", "내 주변 꺼짐");
      ok($("#toast").hidden, "열자마자 안내창이 뜨지 않음");
      ok(dists().length === 0, "거리 표시 없음");
    });
    await run("S2 내 주변(권한 거부) → 지도에서 찍기", async (ok) => {
      await click("#near", 900);
      ok(!$("#toast").hidden && /위치/.test($("#toastMsg").textContent), `안내: ${$("#toastMsg").textContent}`);
      await click("#toastAction", 500);
      ok($(".app").classList.contains("map-picking") && $(".app").dataset.view === "map", "지도로 넘어가 찍기 모드");
      await click("#toastClose", 300);
      ok(!$(".app").classList.contains("map-picking"), "닫으면 찍기 모드 해제");
      await home();
      ok($(".app").dataset.view === "list" && count() === total, "홈 → 목록, 전체");
    });
  } else {
    // ---------- 위치가 있을 때 (가짜 위치) ----------
    await run("S1 첫 화면(위치 있음)", async (ok) => {
      await until(() => $("#near").getAttribute("aria-pressed") === "true");
      ok($("#near").getAttribute("aria-pressed") === "true", "내 주변 자동으로 켜짐");
      ok(/가까운 순/.test($("#count").textContent), $("#count").textContent);
      const d = dists();
      ok(d.length > 0 && sorted(d), `거리 ${d.slice(0, 4).join(", ")}m… 오름차순`);
      ok(!!$(".me-dot"), "지도에 내 위치 점");
      await wait(600);
      ok(offCenter() < 40, `지도가 내 위치로 이동 (중심에서 ${offCenter()}px)`);
    });
    await run("S3 상호 검색", async (ok) => {
      await type("치킨");
      const names = $$(".item").slice(0, 20).map((e) => e.textContent);
      ok(count() > 0 && names.every((t) => /치킨/.test(t)), `${count()}곳, 앞 20곳 모두 '치킨' 포함`);
      ok(sorted(dists()), "검색해도 거리순 유지");
      await type("ㅊㅋ");
      ok(count() > 0, `초성 ㅊㅋ → ${count()}곳`);
      await click("#clear");
      ok(count() === total, "검색어 지우기 → 전체");
    });
    await run("S4 편의점 브랜드 다중선택", async (ok) => {
      await click('.chip[data-cat="편의점"]');
      ok($$("#chips .chip").length === 1 && $("#chips .chip.picked"), "다른 업종 숨김, '편의점 ✕'만");
      await click('.chip[data-brand="cu"]'); await click('.chip[data-brand="seven"]');
      const cuSeven = countBy((s) => s.c === "편의점" && ["cu", "seven"].includes(s.b));
      ok(count() === cuSeven, `CU+세븐일레븐 = ${count()}곳 (기대 ${cuSeven})`);
      ok($$(".item .mini").every((m) => ["CU", "7"].includes(m.textContent)), "목록 배지가 CU·7만");
      await click("#chips .chip.picked");
      ok(count() === total && $$("#chips .chip").length > 5, "✕ 누르면 업종 선택 풀림");
    });
    await run("S5 음식점 종류", async (ok) => {
      await click('.chip[data-cat="음식점"]');
      ok($("#brandChips").hidden && !$("#subChips").hidden, "브랜드 대신 종류 칩");
      await click('.chip[data-sub="치킨"]'); await click('.chip[data-sub="중식"]');
      const chickenChinese = countBy((s) => s.c === "음식점" && ["치킨", "중식"].includes(s.s));
      ok(count() === chickenChinese, `치킨+중식 = ${count()}곳 (기대 ${chickenChinese})`);
      await home();
    });
    await run("S6 지역 선택", async (ok) => {
      await pickArea("고현동");
      ok($("#area").hidden && !$("#areaPicked").hidden, "드롭다운 숨기고 '📍 고현동 ✕'");
      const gohyeon = countBy((s) => s.a === "고현동");
      ok(count() === gohyeon, `고현동 ${count()}곳 (기대 ${gohyeon})`);
      ok($$(".item .area-tag").every((t) => t.textContent === "고현동"), "목록이 모두 고현동");
      const addr = $(".item .item-addr").textContent;
      ok(!/\(고현동\)/.test(addr), `주소 끝 (고현동) 제거: ${addr.slice(-25)}`);
      await click("#areaPicked");
      ok(!$("#area").hidden && count() === total, "✕ 누르면 지역 풀림");
      await click('.item .area-tag');
      ok(!$("#areaPicked").hidden, `목록의 소재지 태그로 선택: ${$("#areaPicked").textContent.trim()}`);
      await home();
    });
    await run("S7 지도 화면 안 목록", async (ok) => {
      await click('.toggle button[data-v="map"]', 900);
      const n = num($("#viewListBtn").textContent);
      ok(n > 0, `버튼: ${$("#viewListBtn").textContent.trim()}`);
      await click("#viewListBtn");
      ok($(".app").dataset.view === "list" && count() === n, `목록 ${count()}곳 = 버튼 숫자`);
      ok($("#area").hidden && /지도 화면 안/.test($("#areaPicked").textContent), `지역 자리에 표시: ${$("#areaPicked").textContent.trim()}`);
      await click("#areaPicked");
      ok(count() === total && !$("#area").hidden, "✕ 누르면 전체로, 지역 드롭다운 다시 보임");
      await pickArea("옥포동");
      await click('.toggle button[data-v="map"]', 900);
      await click("#viewListBtn");
      ok(/지도 화면 안 · 옥포동/.test($("#areaPicked").textContent), `지역과 함께: ${$("#areaPicked").textContent.trim()}`);
      await click("#areaPicked");
      ok(/📍 옥포동/.test($("#areaPicked").textContent), "✕는 지도 화면 안부터 풀고 지역은 남김");
      await home();
    });
    await run("S8 목록 → 지도 팝업", async (ok) => {
      await click(".item .item-name", 2500);
      ok($(".app").dataset.view === "map", "지도로 전환");
      const pop = $(".leaflet-popup-content");
      ok(!!pop && pop.querySelectorAll("a.naver, a.kakao").length === 2, "팝업에 네이버·카카오 링크");
      await home();
    });
    await run("S9 홈(제목)", async (ok) => {
      await pickArea("장목면");
      await click(".item .item-name", 2500); // 멀리 있는 가게로 지도를 옮긴다
      await type("마트"); await click('.chip[data-cat="마트·식품"]');
      ok(count() < total && offCenter() > 500, `필터 건 상태 ${count()}곳, 지도는 내 위치에서 ${offCenter()}px`);
      await home();
      await wait(900);
      ok(offCenter() < 40, `지도가 내 위치로 돌아옴 (중심에서 ${offCenter()}px)`);
      ok(count() === total && $("#q").value === "" && !$("#chips .chip.picked") && !$("#area").hidden, "검색어·업종·지역 모두 풀림");
      ok($(".app").dataset.view === "list", "목록 화면으로");
      ok($("#near").getAttribute("aria-pressed") === "true" && sorted(dists()), "거리순은 유지");
      ok(!!$(".leaflet-popup") === false, "열린 팝업 닫힘");
    });
    await run("S10 내 주변 끄기/켜기", async (ok) => {
      await click("#near", 500);
      ok($("#near").getAttribute("aria-pressed") === "false" && dists().length === 0, "끄면 거리 표시 없음");
      ok(JSON.parse(localStorage.getItem("geosasang:prefs") || "{}").near === "off", "끈 상태 저장");
      await click("#near", 800);
      ok($("#near").getAttribute("aria-pressed") === "true" && sorted(dists()), "다시 켜면 거리순");
    });
    await run("S12 내 주변 거리 범위", async (ok) => {
      ok(!$("#radiusChips").hidden, `거리 버튼: ${$("#radiusChips").textContent.replace(/\s+/g, " ").trim()}`);
      await click('[data-radius="500"]', 800);
      const d = dists();
      ok(count() > 0 && count() < total && d.every((m) => m <= 500), `500m 안 ${count()}곳, 가장 먼 곳 ${Math.max(...d)}m`);
      ok(/500m 안/.test($("#count").textContent), $("#count").textContent);
      // 지도가 범위 원에 맞춰 줌인됐는지, 원이 그려졌는지 확인한다
      await wait(600);
      const inView = num($("#viewListBtn").textContent);
      ok(inView >= count() && inView < total, `지도가 범위에 맞춰짐: 화면 안 ${inView}곳`);
      ok(!!$(".leaflet-overlay-pane svg path"), "지도에 범위 원(점선)");
      const in500 = count();
      await click('[data-radius="1000"]', 800);
      ok(count() >= in500, `1km 안 ${count()}곳 ≥ 500m 안 ${in500}곳`);
      await click('.chip[data-cat="편의점"]');
      ok(count() <= in500 * 3 && dists().every((m) => m <= 1000), `거리 + 업종 함께: 1km 안 편의점 ${count()}곳`);
      await home();
      ok(count() === total && $('[data-radius="0"]').getAttribute("aria-pressed") === "true", "홈 → 거리 범위도 전체로");
      await click("#near", 500);
      ok($("#radiusChips").hidden, "내 주변을 끄면 거리 버튼 숨김");
      await click("#near", 800);
    });
    await run("S13 안내·웹앱·만든 사람", async (ok) => {
      ok(!$("#guide").open && JSON.parse(localStorage.getItem("geosasang:prefs") || "{}").guideSeen === "1", "안내를 닫으면 다시 안 뜸");
      await click("#settingsBtn"); await click("#openGuide");
      ok($("#guide").open && !$("#settings").open, "설정 → 사용 방법 다시 보기");
      await click("#guide .guide-start");
      ok(!$("#guide").open, "시작하기로 닫힘");
      const mb = $(".made-by"), r = mb.getBoundingClientRect();
      ok(getComputedStyle(mb).position === "fixed" && innerHeight - r.bottom < 20, `화면 맨 아래: ${mb.innerText}`);
      ok(!$("#settings .credit") && !$(".foot .credit"), "설정·목록 아래에는 만든 사람 없음");
      const mf = await fetch("manifest.webmanifest").then((x) => x.json());
      const icons = await Promise.all(mf.icons.map((i) => fetch(i.src).then((x) => x.status)));
      ok(mf.display === "standalone" && icons.every((c) => c === 200), `웹앱 설정: ${mf.short_name}, 아이콘 ${icons.join("/")}`);
      ok($("#q").placeholder === "상호나 주소로 검색", `검색창 안내: ${$("#q").placeholder}`);
    });
    await run("S14 지도 팝업 유지·상호명 클릭·내 위치 펄스", async (ok) => {
      await pickArea("옥포동");
      await click(".item .item-name", 2500); // 가게로 확대 → 팝업
      const name = $(".leaflet-popup-content .pop-name")?.textContent;
      ok(!!name, `팝업: ${name}`);
      for (let i = 0; i < 4; i++) await click(".leaflet-control-zoom-out", 500);
      ok(!$(".leaflet-popup") && !!$(".sel-ring"), "축소하면 정보는 닫히고 고른 핀은 남음");
      history.back(); await wait(600);
      ok(!$(".sel-ring"), "뒤로가기 → 선택 풀림");
      // 가게가 많은 내 위치 주변(줌 16)에서 상호명 라벨을 누른다
      await home();
      await click('.toggle button[data-v="map"]', 1200);
      await until(() => $$(".name-label").length > 0, 3000);
      const label = $(".name-label");
      if (label) {
        label.click(); await wait(400);
        ok($(".leaflet-popup-content .pop-name")?.textContent.startsWith(label.textContent.replace("…", "")), `상호명 '${label.textContent}' 누르면 팝업`);
      } else ok(false, "확대해도 상호명 라벨이 없음");
      const pulse = getComputedStyle($(".me-dot"), "::after").animationName;
      ok(pulse === "me-pulse", `내 위치 점 펄스: ${pulse}`);
      await home();
    });
    await run("S15 목록 줄 → 지도에 그 가게만", async (ok) => {
      await pickArea("고현동");
      const item = $(".item"), nm = item.querySelector(".item-name").textContent;
      ok(!item.querySelector(".lk-map"), "'지도에서 보기' 버튼 없음");
      await click(item.querySelector(".item-name"), 2500);
      ok($(".app").dataset.view === "map", "줄을 누르면 지도 탭으로 이동");
      ok($(".leaflet-popup-content .pop-name")?.textContent === nm, `팝업: ${nm}`);
      ok(!!$(".sel-ring"), "선택 표시(자홍 고리)");
      ok($$(".marker-cluster").length === 0 && /다른 가게도 보기/.test($("#viewListBtn").textContent), "지도에 그 가게만 (묶음 없음)");
      await click("#viewListBtn", 800);
      ok($$(".marker-cluster").length > 0 && !!$(".sel-ring"), "'다른 가게도 보기' → 다른 가게 다시 보임, 선택은 유지");
      await click(".leaflet-popup-close-button", 300);
      ok(!$(".sel-ring"), "팝업 닫으면 선택 표시도 사라짐");
      await home();
    });
    await run("S16 뒤로가기·선택 가게·만든 사람", async (ok) => {
      const back = async () => { history.back(); await wait(600); };
      ok($(".made-by").classList.contains("gone"), "사용을 시작하면 만든 사람 표시가 사라짐");
      // 단계 쌓기: 편의점 → 고현동 → 지도
      await click('.chip[data-cat="편의점"]');
      await pickArea("고현동");
      await click('.toggle button[data-v="map"]', 600);
      ok($(".app").dataset.view === "map" && state_ok(), "편의점·고현동·지도까지 진행");
      await back();
      ok($(".app").dataset.view === "list" && !$("#areaPicked").hidden, "뒤로 1: 목록으로 (고현동 유지)");
      await back();
      ok(!$("#area").hidden && !!$("#chips .chip.picked"), "뒤로 2: 고현동 풀림 (편의점 유지)");
      await back();
      ok(!$("#chips .chip.picked") && count() === total, "뒤로 3: 처음 화면");
      // 가게 선택 → 축소해도 자기 자리에 따로 → 뒤로가기로 닫힘
      await click(".item .item-name", 2500);
      const nm = $(".leaflet-popup-content .pop-name")?.textContent;
      ok(!!nm, `정보 열림: ${nm}`);
      for (let i = 0; i < 5; i++) await click(".leaflet-control-zoom-out", 450);
      ok(!!$(".sel-ring") && !$(".leaflet-popup"), "5단계 축소: 정보는 닫히고 고른 핀은 따로 남음");
      const rb = $(".sel-ring").getBoundingClientRect();
      ok(rb.width <= 30, `선택 고리 크기 ${Math.round(rb.width)}px (마커 크기 정도)`);
      const ring = getComputedStyle($(".sel-ring"), "::after").animationName;
      ok(!ring || ring === "none", "선택 가게에는 펄스 없음");
      await back();
      ok(!$(".sel-ring"), "뒤로가기 → 가게 선택 풀림");
      // 설정 팝업도 뒤로가기로 닫힘
      await click("#settingsBtn");
      await back();
      ok(!$("#settings").open, "뒤로가기 → 설정 팝업 닫힘");
      await home();
    });
    await run("S11 화면 설정 팝업", async (ok) => {
      await click("#settingsBtn");
      ok($("#settings").open, "톱니바퀴 → 팝업 열림");
      await click('.seg [data-fs="3"]'); await click('.seg [data-theme="dark"]');
      ok(document.documentElement.dataset.fs === "3" && document.documentElement.dataset.theme === "dark", "더 크게 + 다크 적용");
      ok(getComputedStyle(document.body).fontSize === "19.5px", `글자 ${getComputedStyle(document.body).fontSize}`);
      $("#settings").dispatchEvent(new MouseEvent("click", { bubbles: true })); await wait();
      ok(!$("#settings").open, "바깥 누르면 닫힘");
    });
    await run("S17 제로페이 포함 토글·구분 아이콘", async (ok) => {
      await home();
      const paper = countBy((s) => s.k & 1);
      ok($$(".item").every((li) => li.querySelector(".kinds .kind-paper, .kinds .kind-zp")), "목록마다 지류·제로페이 아이콘");
      await click("#zpToggle");
      ok($("#zpToggle").getAttribute("aria-pressed") === "false" && count() === paper, `끄면 지류만 ${count()}곳 (기대 ${paper})`);
      ok($$(".item").every((li) => li.querySelector(".kind-paper")), "목록이 모두 지류 가맹점");
      ok(JSON.parse(localStorage.getItem("geosasang:prefs") || "{}").zp === "off", "꺼 둔 상태 저장");
      await click("#zpToggle");
      ok(count() === total && JSON.parse(localStorage.getItem("geosasang:prefs") || "{}").zp == null, `다시 켜면 전체 ${count()}곳`);
      const withTel = $$(".item").find((li) => li.querySelector("a.tel"));
      ok(!withTel || /^tel:\d+$/.test(withTel.querySelector("a.tel").getAttribute("href")), "전화 버튼은 tel: 링크");
    });
  }

  // 화면 설정을 테스트 전으로 되돌린다
  if (savedPrefs == null) localStorage.removeItem("geosasang:prefs"); else localStorage.setItem("geosasang:prefs", savedPrefs);
  const p = JSON.parse(savedPrefs || "{}");
  if (p.theme === "light" || p.theme === "dark") document.documentElement.dataset.theme = p.theme; else delete document.documentElement.dataset.theme;
  if (p.fs === "2" || p.fs === "3") document.documentElement.dataset.fs = p.fs; else delete document.documentElement.dataset.fs;
  await home();

  console.table(results);
  const failed = results.filter((r) => r.결과 === "실패");
  return { 모드: fake ? "위치 있음(가짜)" : "위치 없음", 전체: results.length, 실패: failed.length, 실패목록: failed, 전체결과: results };
})();
