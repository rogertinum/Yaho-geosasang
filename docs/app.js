(() => {
  "use strict";

  // 지도 점·업종 칩 색상 (업종끼리 최대한 구분되게)
  const COLORS = {
    "음식점": "#e03131", "카페·베이커리": "#8d5524", "편의점": "#1c7ed6", "마트·식품": "#2f9e44",
    "주유소": "#f08c00", "자동차": "#343a40", "병원·약국": "#12b886", "미용·뷰티": "#f06595",
    "교육·학원": "#4263eb", "운동·레저": "#74b816", "숙박": "#9c36b5", "쇼핑·의류": "#fab005",
    "생활서비스": "#15aabf", "기타": "#adb5bd",
  };
  const PAGE = 60;
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

  const $ = (s) => document.querySelector(s);
  const app = $(".app");
  const NO_BRAND = "_none";
  // 위치 기능. 내 컴퓨터(localhost)에서만 주소에 ?fakeGeo=위도,경도 를 붙이면 그 위치를 돌려준다 (테스트용)
  const geo = (() => {
    const m = /[?&]fakeGeo=([\d.]+),([\d.]+)/.exec(location.search);
    if (m && ["localhost", "127.0.0.1"].includes(location.hostname)) {
      return { getCurrentPosition: (ok) => setTimeout(() => ok({ coords: { latitude: +m[1], longitude: +m[2] } }), 30) };
    }
    return navigator.geolocation;
  })();
  // 이 업종들은 브랜드 대신 종류(치킨·중식·고기…)로 바로 나눈다
  const TYPE_FIRST = new Set(["음식점"]);
  // brands·subs는 여러 개 고를 수 있다 (비어 있으면 전체)
  // zp: 제로페이 가맹점도 보일지 (끄면 지류 가맹점만). 이 기기에 저장한다
  const state = { q: "", cat: "", brands: new Set(), subs: new Set(), area: "", me: null, shown: PAGE, results: [], zp: true };
  let stores = [], categories = [], subtypes = {}, brands = {}, bounds, map, cluster, meMarker;

  // 검색용 정규화: 공백·기호 제거, 소문자
  const norm = (s) => s.toLowerCase().replace(/[\s()·.,\-_&/]/g, "");
  const choseong = (s) => [...s].map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }).join("");
  const isCho = (s) => /^[ㄱ-ㅎ]+$/.test(s);
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 주소 끝 괄호의 동 이름은 소재지 태그와 겹쳐서 뺀다
  // '…26(옥포동, 혜성비치맨션)' → '…26(혜성비치맨션)', '…1856(고현동)' → '…1856'
  const shortAddr = (d) => d.replace(/\s*\(([^)]*)\)\s*$/, (_, inner) => {
    const rest = inner.split(",").map((x) => x.trim()).filter((x) => x && !/^[가-힣0-9]+[동리]$/.test(x));
    return rest.length ? `(${rest.join(", ")})` : "";
  });

  function distKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`);

  // short: 목록에서는 전화·구분 아이콘과 한 줄에 들어가게 짧게 쓴다
  const mapLinks = (s, short = false) => {
    // 주소까지 붙이면 지도 앱 검색이 자주 비어서 '거제 + 상호'로 찾는다
    const q = encodeURIComponent(s.n.includes("거제") ? s.n : `거제 ${s.n}`);
    return `<a class="lk naver" href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener"><b>N</b>${short ? "네이버" : "네이버지도"}</a>`
      + `<a class="lk kakao" href="https://map.kakao.com/link/search/${q}" target="_blank" rel="noopener"><b>K</b>${short ? "카카오" : "카카오맵"}</a>`;
  };

  // 가맹점 구분 아이콘 (k: 1 지류, 2 제로페이, 3 둘 다)과 전화 버튼
  const kindsHtml = (s) => `<span class="kinds">${s.k & 1 ? `<span class="kind-paper" title="지류 가맹점"><b>지류</b><i></i></span>` : ""}`
    + `${s.k & 2 ? `<img class="kind-zp" src="img/zeropay-square.png" alt="제로페이" title="제로페이 가맹점">` : ""}</span>`;
  const telLink = (s) => (s.t ? `<a class="lk tel" href="tel:${s.t.replace(/-/g, "")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>${esc(s.t)}</a>` : "");

  function popupHtml(s) {
    const warn = s.p === "exact" ? ""
      : `<div class="pop-warn">※ 정확한 위치를 못 찾아 ${s.p === "road" ? "도로" : esc(s.a)} 근처에 대략 표시했어요</div>`;
    return `<div class="pop-name">${esc(s.n)}</div><div class="pop-cat">${esc(s.c)} · ${esc(s.a)} ${kindsHtml(s)}</div>`
      + `<div class="pop-addr">${esc(shortAddr(s.d))}</div>${warn}`
      + (s.t ? `<div class="pop-links pop-tel">${telLink(s)}</div>` : "")
      + `<div class="pop-links">${mapLinks(s)}</div>`;
  }

  // ---------- 필터 ----------
  // 업종 칩 숫자는 업종을 뺀 나머지 조건(검색어·지역)으로 센다
  // fit=false면 지도를 결과 범위로 옮기지 않는다 ('지도 화면 안'처럼 지금 화면을 지켜야 할 때)
  function apply(fit = true) {
    const q = norm(state.q), qCho = isCho(q);
    if (state.me) stores.forEach((s) => (s._km = s.lat == null ? Infinity : distKm(state.me, s)));
    const radiusKm = state.me && state.radius ? state.radius / 1000 : 0;
    const base = stores.filter((s) => {
      if (radiusKm && s._km > radiusKm) return false;
      if (!state.zp && s.k === 2) return false;
      if (state.area && s.a !== state.area) return false;
      if (!q) return true;
      return qCho ? s._cho.includes(q) : s._n.includes(q) || s._o.includes(q) || s._d.includes(q);
    });
    const inCat = state.cat ? base.filter((s) => s.c === state.cat) : base;
    const typeMode = TYPE_FIRST.has(state.cat);
    // 종류로 나누는 업종은 전체를, 아니면 '그 외'(브랜드 없는 곳)만 세부 종류로 거른다
    const subPool = typeMode ? inCat : inCat.filter((s) => !s.b);
    let res = inCat.filter((s) => {
      if (typeMode) return !state.subs.size || state.subs.has(s.s);
      if (state.brands.size && !state.brands.has(s.b || NO_BRAND)) return false;
      if (!s.b && state.subs.size && !state.subs.has(s.s)) return false;
      return true;
    });

    if (state.me) {
      res = [...res].sort((a, b) => a._km - b._km);
    } else if (q) {
      // 상호가 검색어로 시작하는 곳을 먼저
      const key = qCho ? "_cho" : "_n";
      res = [...res].sort((a, b) => (b[key].startsWith(q) - a[key].startsWith(q)) || (b[key].includes(q) - a[key].includes(q)));
    }

    // 지도에는 조건에 맞는 가게를 다 두고, 목록은 '지도 화면 안'을 골랐으면 그 범위만 보여준다
    state.results = res;
    state.listResults = state.inView ? res.filter((s) => s.lat != null && state.inView.contains([s.lat, s.lng])) : res;
    state.shown = PAGE;
    renderArea(base.length);
    renderRadius();
    renderChips(base);
    renderBrandChips(inCat);
    renderSubChips(subPool, typeMode);
    renderList();
    renderMap(fit);
    const within = radiusKm ? ` · ${radiusLabel(state.radius)} 안` : "";
    $("#count").innerHTML = `<b>${state.listResults.length.toLocaleString()}</b>곳${state.me ? `${within} · 가까운 순` : ""}`;
  }

  // ---------- 내 주변 거리 범위 ----------
  // '내 주변'이 켜져 있을 때만 보인다. 고르면 그 거리 안의 가게만 남기고 지도에 범위 원을 그린다.
  const RADII = [300, 500, 1000, 3000];
  const radiusLabel = (m) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);
  let radiusCircle, circleRenderer;
  function renderRadius() {
    const el = $("#radiusChips");
    el.hidden = !state.me;
    if (state.me) {
      const chip = (m, label) =>
        `<button class="chip sub" type="button" data-radius="${m}" aria-pressed="${(state.radius || 0) === m}">${label}</button>`;
      el.innerHTML = `<span class="sub-label">내 주변 ›</span>` + chip(0, "전체")
        + RADII.map((m) => chip(m, radiusLabel(m))).join("");
    }
    if (!map) return;
    if (radiusCircle) { radiusCircle.remove(); radiusCircle = null; }
    if (state.me && state.radius) {
      radiusCircle = L.circle([state.me.lat, state.me.lng], {
        radius: state.radius, color: "#e40077", weight: 2, fillColor: "#e40077", fillOpacity: 0.06,
        dashArray: "6 6", interactive: false,
        renderer: circleRenderer || (circleRenderer = L.svg({ padding: 0.5 })), // 점선 원은 SVG로 (지도 점들은 캔버스)
      }).addTo(map);
    }
  }

  function setRadius(m) {
    state.radius = m || 0;
    apply(false);
    if (radiusCircle) map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
    else if (state.me) map.setView([state.me.lat, state.me.lng], 16);
  }

  // 지도 위 버튼: 지금 화면에 보이는 가게 수를 세어 둔다
  function updateViewBtn() {
    if (!map) return;
    if (state.only) {
      const btn = $("#viewListBtn");
      btn.disabled = false;
      btn.innerHTML = "↩ 다른 가게도 보기";
      return;
    }
    const view = map.getBounds();
    const n = state.results.filter((s) => s.lat != null && view.contains([s.lat, s.lng])).length;
    const btn = $("#viewListBtn");
    btn.disabled = !n;
    btn.innerHTML = n ? `📋 이 화면 가게 목록 <b>${n.toLocaleString()}곳</b>` : "이 화면에는 가게가 없어요";
  }

  function showViewList() {
    state.inView = map.getBounds();
    apply(false);
    setView("list");
  }

  // ---------- 렌더 ----------
  // 지역 자리: 지역이나 '지도 화면 안'을 골랐으면 드롭다운 대신 해제 칩 하나만 보인다.
  // 둘 다 걸려 있으면 '🗺️ 지도 화면 안 · 고현동'처럼 같이 보이고, ✕는 지도 화면 안부터 푼다.
  function renderArea(n) {
    const sel = $("#area"), picked = $("#areaPicked");
    const on = !!(state.area || state.inView);
    sel.value = state.area;
    sel.hidden = on;
    picked.hidden = !on;
    if (!on) return;
    const label = state.inView
      ? `🗺️ 지도 화면 안${state.area ? ` · ${esc(state.area)}` : ""}`
      : `📍 ${esc(state.area)}`;
    const shown = state.inView ? state.listResults.length : n;
    picked.innerHTML = `<span class="name">${label}</span><i>${shown.toLocaleString()}</i><span class="x" aria-hidden="true">✕</span>`;
    picked.setAttribute("aria-label", state.inView ? "지도 화면 안 필터 풀기" : `${state.area} 선택 풀기`);
  }

  function renderChips(base) {
    const counts = {};
    base.forEach((s) => (counts[s.c] = (counts[s.c] || 0) + 1));
    const chip = (cat, label, n) => {
      const dot = cat ? `<span class="dot" style="background:${COLORS[cat]}"></span>` : "";
      return `<button class="chip" data-cat="${cat}" aria-pressed="${state.cat === cat}">${dot}${label}<i>${n.toLocaleString()}</i></button>`;
    };
    // 업종을 골랐으면 그 업종만 '편의점 ✕'로 남기고 나머지는 숨긴다. 누르면 선택이 풀린다.
    if (state.cat) {
      $("#chips").innerHTML = `<button class="chip picked" data-cat="${state.cat}" aria-pressed="true" title="업종 선택 풀기">`
        + `<span class="dot" style="background:${COLORS[state.cat]}"></span>${state.cat}`
        + `<i>${(counts[state.cat] || 0).toLocaleString()}</i><span class="x" aria-hidden="true">✕</span></button>`;
      $("#chips").classList.remove("expanded");
      $("#chipToggle").hidden = true;
      return;
    }
    $("#chips").innerHTML = chip("", "전체", base.length)
      + categories.filter((c) => counts[c]).map((c) => chip(c, c, counts[c])).join("");
    updateChipToggle();
  }

  // 휴대폰에서는 업종 칩을 두 줄까지만 보여주고 나머지는 '펼치기'로 연다
  function updateChipToggle() {
    const el = $("#chips"), btn = $("#chipToggle");
    const expanded = el.classList.contains("expanded");
    el.classList.remove("expanded");
    const collapsed = el.clientHeight;
    el.classList.add("expanded");
    const full = el.scrollHeight;
    el.classList.toggle("expanded", expanded);
    btn.hidden = full <= collapsed + 4;
    btn.textContent = expanded ? "▴ 업종 접기" : `▾ 업종 전체 보기`;
  }

  // 업종을 고르면 그 업종 안의 브랜드로 한 번 더 거른다 (예: 편의점 → GS25 / CU / 세븐일레븐)
  function renderBrandChips(inCat) {
    const el = $("#brandChips");
    const counts = {};
    let none = 0;
    inCat.forEach((s) => (s.b ? (counts[s.b] = (counts[s.b] || 0) + 1) : none++));
    const ids = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (!state.cat || !ids.length || TYPE_FIRST.has(state.cat)) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const on = (id) => (id ? state.brands.has(id) : !state.brands.size);
    const chip = (id, label, n, style = "") =>
      `<button class="chip sub" data-brand="${id}" aria-pressed="${on(id)}">${style}${label}<i>${n.toLocaleString()}</i></button>`;
    el.hidden = false;
    el.innerHTML = chip("", "전체 브랜드", inCat.length)
      + ids.map((id) => chip(id, esc(brands[id].name), counts[id], `<span class="dot" style="background:${brands[id].bg}"></span>`)).join("")
      + (none ? chip(NO_BRAND, "그 외", none) : "");
  }

  // '그 외'를 고르면 브랜드 없는 가게를 세부 종류로 한 번 더 나눠 보여준다 (예: 음식점 → 치킨·중식·고기·회…)
  // 음식점처럼 종류로 나누는 업종은 업종을 고르자마자 종류 칩을 보여준다
  function renderSubChips(pool, typeMode) {
    const el = $("#subChips");
    const order = subtypes[state.cat];
    if (!order || !(typeMode || state.brands.has(NO_BRAND))) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const counts = {};
    pool.forEach((s) => (counts[s.s] = (counts[s.s] || 0) + 1));
    const chip = (id, label, n) =>
      `<button class="chip sub" data-sub="${id}" aria-pressed="${id ? state.subs.has(id) : !state.subs.size}">${esc(label)}<i>${n.toLocaleString()}</i></button>`;
    el.hidden = false;
    el.classList.toggle("nested", !typeMode);
    el.innerHTML = (typeMode ? "" : `<span class="sub-label">그 외 ›</span>`)
      + chip("", typeMode ? "전체 종류" : "전체", pool.length)
      + order.filter((k) => counts[k]).map((k) => chip(k, k, counts[k])).join("");
  }

  // 다중선택 칩: 누르면 넣고 다시 누르면 빼고, '전체'는 비운다
  function toggleIn(set, id) {
    if (!id) set.clear();
    else if (set.has(id)) set.delete(id);
    else set.add(id);
  }

  // 브랜드 핀: 브랜드 색 바탕 + 업종 색 테두리
  function brandPin(b, cat) {
    const inner = b.logo
      ? `<img src="${b.logo}" alt="">`
      : `<span style="background:${b.bg};color:${b.fg}">${esc(b.label)}</span>`;
    return L.divIcon({
      className: "bpin",
      html: `<div class="bpin-in" style="--pin:${COLORS[cat]};--cat:${COLORS[cat]}">${inner}</div>`,
      iconSize: [0, 0],
    });
  }

  function itemHtml(s, i) {
    const dist = state.me && s.lat != null ? `<span class="item-dist">${fmtDist(s._km)}</span> · ` : "";
    const links = `<div class="item-links">${s.p === "area" ? "대략 위치 · " : ""}<span class="pop-links">${telLink(s)}${mapLinks(s, true)}</span>${kindsHtml(s)}</div>`;
    return `<li class="item" data-i="${i}">
      <div class="item-head">${s.b
        ? `<span class="mini" style="background:${brands[s.b].bg};color:${brands[s.b].fg}">${esc(brands[s.b].label)}</span>`
        : `<span class="dot" style="background:${COLORS[s.c]}"></span>`}
        <span class="item-name">${esc(s.n)}</span><span class="badge">${esc(s.c)}</span></div>
      <div class="item-addr"><button class="area-tag" data-area="${esc(s.a)}" title="${esc(s.a)}만 보기">${esc(s.a)}</button>${dist}${esc(shortAddr(s.d))}</div>${links}</li>`;
  }

  function renderList(append = false) {
    const res = state.listResults;
    const from = append ? state.shown - PAGE : 0;
    const html = res.slice(from, state.shown).map((s, k) => itemHtml(s, from + k)).join("");
    if (append) $("#list").insertAdjacentHTML("beforeend", html);
    else {
      $("#list").innerHTML = html || `<li class="empty">조건에 맞는 가맹점이 없어요.<br>검색어나 업종을 바꿔 보세요.</li>`;
      $(".list-pane").scrollTop = 0;
    }
    $("#more").textContent = res.length > state.shown ? `${(res.length - state.shown).toLocaleString()}곳 더 있어요 · 스크롤하면 이어서 보여요` : "";
  }

  function renderMap(fit = true) {
    if (!map) return;
    cluster.clearLayers();
    // 선택한 가게가 조건에서 빠지면 선택을 푼다. 남아 있으면 묶음 밖에 따로 둔다.
    if (selStore && !state.results.includes(selStore)) { map.closePopup(); deselectStore(); }
    // 목록에서 고른 가게만 보는 중이면 다른 가게는 지도에 올리지 않는다
    const markers = state.results.filter((s) => s.lat != null && s !== selStore && !state.only).map((s) => {
      if (!s._m) {
        s._m = (s.b
          ? L.marker([s.lat, s.lng], { icon: brandPin(brands[s.b], s.c), riseOnHover: true })
          : L.circleMarker([s.lat, s.lng], {
            radius: 7, weight: 2, color: "#fff", fillColor: COLORS[s.c], fillOpacity: s.p === "exact" ? 0.95 : 0.55,
          })
        ).on("click", () => openStorePopup(s));
      }
      return s._m;
    });
    cluster.addLayers(markers);
    // 검색·필터를 걸면 결과가 다 보이게 지도를 옮긴다.
    // 내 주변 모드에서는 내 위치 주변을 지키되, 지역을 고르거나 검색했을 때는 그 결과로 옮긴다.
    const filtered = state.q || state.cat || state.brands.size || state.area;
    const moveAway = !state.me || state.area || state.q;
    if (fit && filtered && moveAway && !state.inView && !state.only && markers.length) {
      map.fitBounds(cluster.getBounds(), { padding: [30, 30], maxZoom: 16 });
    }
    setTimeout(() => { updateLabels(); updateViewBtn(); }, 150);
  }

  // ---------- 상호명 라벨 ----------
  // 줌 LABEL_ZOOM 이상에서, 묶이지 않고 화면에 보이는 마커 옆에 상호명을 단다.
  // 마커와 이미 단 라벨에 겹치지 않는 자리(오른쪽→왼쪽→아래→위)를 고르고, 없으면 생략한다.
  const LABEL_ZOOM = 16, LABEL_MAX = 250, LABEL_H = 20;
  const APT_ZOOM = 15; // 이 줌부터 큰 아파트 단지 이름을 지도에 쓴다 (docs/apartments.json)
  let labelLayer, measureCtx, apartments = [];

  function textWidth(t) {
    if (!measureCtx) {
      measureCtx = document.createElement("canvas").getContext("2d");
      measureCtx.font = '600 12px -apple-system, "Malgun Gothic", sans-serif';
    }
    return Math.ceil(measureCtx.measureText(t).width) + 14; // 글상자 좌우 여백·테두리 포함
  }

  const shortName = (n) => (n.length > 14 ? n.slice(0, 13) + "…" : n);
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  function updateLabels() {
    if (!map) return;
    labelLayer.clearLayers();
    const zoom = map.getZoom();
    if (zoom < APT_ZOOM) return;
    const view = map.getBounds().pad(0.1);
    // 묶이지 않고 낱개로 지도에 올라간 마커만 (_map이 있으면 낱개로 표시 중)
    let shown = state.results.filter((s) => s._m && s._m._map && view.contains(s._m.getLatLng()));
    if (shown.length > LABEL_MAX) shown = [];

    // 마커가 차지하는 자리 (브랜드 핀은 좌표 위쪽, 점은 좌표 중심)
    const boxes = shown.map((s) => {
      const p = map.latLngToContainerPoint(s._m.getLatLng());
      if (!s.b) return { p, box: { x: p.x - 8, y: p.y - 8, w: 16, h: 16 } };
      const w = textWidth(brands[s.b].label) + 8;
      return { p, box: { x: p.x - w / 2, y: p.y - 30, w, h: 30 } };
    });
    const size = map.getSize();
    // 왼쪽 위 확대·축소 버튼, 오른쪽 아래 출처 표시 자리는 비워 둔다
    const taken = boxes.map((b) => b.box).concat(
      { x: 0, y: 0, w: 52, h: 90 }, { x: size.x - 200, y: size.y - 22, w: 200, h: 22 });
    // 지도 위 '이 화면 가게 목록' 버튼 자리도 비운다
    const btnBox = $("#viewListBtn").getBoundingClientRect(), mapBox = map.getContainer().getBoundingClientRect();
    if (btnBox.width) taken.push({ x: btnBox.left - mapBox.left - 4, y: btnBox.top - mapBox.top - 4, w: btnBox.width + 8, h: btnBox.height + 8 });

    // 큰 아파트 단지 이름: 단지 가운데에, 가게 마커와 겹치지 않는 곳만 (큰 단지부터)
    for (const a of apartments) {
      if (!view.contains([a.lat, a.lng])) continue;
      const p = map.latLngToContainerPoint([a.lat, a.lng]);
      const text = shortName(a.n.replace(/\s*아파트$/, "")), w = textWidth(text);
      const r = { x: p.x - w / 2, y: p.y - 9, w, h: 18 };
      if (r.x < 0 || r.x + w > size.x || r.y < 0 || r.y + 18 > size.y || taken.some((t) => overlaps(r, t))) continue;
      taken.push(r);
      labelLayer.addLayer(L.marker([a.lat, a.lng], {
        icon: L.divIcon({ className: "apt-label-wrap", html: `<span class="apt-label" style="left:${-w / 2}px">${esc(text)}</span>`, iconSize: [0, 0] }),
        interactive: false, keyboard: false, zIndexOffset: -500,
      }));
    }
    if (zoom < LABEL_ZOOM) return;

    // 정확한 위치·브랜드 가게부터 자리를 준다
    const order = shown.map((s, i) => i).sort((a, b) =>
      ((shown[b].p === "exact") - (shown[a].p === "exact")) || (!!shown[b].b - !!shown[a].b));
    for (const i of order) {
      const s = shown[i], { p, box } = boxes[i];
      const text = shortName(s.n), w = textWidth(text);
      const cy = s.b ? p.y - 15 : p.y;
      const spots = [
        { x: box.x + box.w + 2, y: cy - LABEL_H / 2 },
        { x: box.x - w - 2, y: cy - LABEL_H / 2 },
        { x: p.x - w / 2, y: (s.b ? p.y : box.y + box.h) + 2 },
        { x: p.x - w / 2, y: box.y - LABEL_H - 2 },
      ];
      const spot = spots.find((r) => r.x >= 0 && r.x + w <= size.x && r.y >= 0 && r.y + LABEL_H <= size.y
        && !taken.some((t) => overlaps({ ...r, w, h: LABEL_H }, t)));
      if (!spot) continue;
      taken.push({ ...spot, w, h: LABEL_H });
      const html = `<span class="name-label" style="left:${spot.x - p.x}px;top:${spot.y - p.y}px">${esc(text)}</span>`;
      labelLayer.addLayer(L.marker(s._m.getLatLng(), {
        icon: L.divIcon({ className: "name-label-wrap", html, iconSize: [0, 0] }),
        keyboard: false,
      }).on("click", () => openStorePopup(s))); // 상호명 글자를 눌러도 가게 정보가 열린다
    }
  }

  // 가게 정보 팝업. 핀에 붙이지 않고 지도 좌표에 띄워서, 확대·축소해도 다른 곳을 누르기 전까지 남는다.
  // 고른 가게는 숫자 묶음에서 빼서 자기 자리에 따로 보이고, 자홍색 고리로 표시한다.
  // 팝업이 닫히면 선택을 풀고 다시 묶음에 넣는다.
  let storePopup, selRing, selStore = null, keepSel = false;
  function selectStore(s) {
    if (selStore === s) return;
    deselectStore();
    selStore = s;
    if (cluster.hasLayer(s._m)) cluster.removeLayer(s._m);
    s._m.addTo(map);
    // 고른 가게 핀은 크게
    if (s.b) s._m.getElement()?.classList.add("sel");
    else s._m.setStyle({ radius: 10, weight: 3 });
    selRing = L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: "sel-ring-wrap", html: '<div class="sel-ring"></div>', iconSize: [0, 0] }),
      interactive: false, keyboard: false, zIndexOffset: -1000,
    }).addTo(map);
  }
  function deselectStore() {
    if (!selStore) return;
    // 그 가게만 보던 중이었으면 다른 가게들을 다시 보여준다
    if (state.only) { state.only = null; setTimeout(() => renderMap(false), 0); }
    const s = selStore;
    selStore = null;
    if (s.b) s._m.getElement()?.classList.remove("sel");
    else s._m.setStyle({ radius: 7, weight: 2 });
    map.removeLayer(s._m);
    if (state.results.includes(s)) cluster.addLayer(s._m);
    if (selRing) { selRing.remove(); selRing = null; }
  }
  function openStorePopup(s) {
    if (!storePopup) {
      storePopup = L.popup({ autoPanPadding: [20, 60] });
      map.on("popupclose", (e) => {
        if (e.popup !== storePopup) return;
        if (keepSel) { keepSel = false; return; } // 확대·축소로 닫은 건 정보만 닫고 핀은 남긴다
        deselectStore();
        step(true); // 닫은 건 새 단계가 아니라 지금 단계를 고친다
      });
    }
    if (!s._m) return;
    storePopup.options.offset = L.point(0, s.b ? -26 : -4);
    storePopup.setLatLng([s.lat, s.lng]).setContent(popupHtml(s)).openOn(map);
    selectStore(s);
    step();
  }

  // 지도를 직접 확대·축소하거나 끌기 시작하면 가게 정보는 닫고 고른 핀만 남긴다
  function hideInfo() {
    if (storePopup && map.hasLayer(storePopup)) { keepSel = true; map.closePopup(storePopup); }
  }

  // 목록에서 가게를 누르면: 지도 탭으로 가서 그 가게만 보여주고 선택한다
  function focusStore(s) {
    if (s.lat == null || !s._m) return;
    state.only = s;
    renderMap(false);
    setView("map");
    map.invalidateSize();
    map.setView([s.lat, s.lng], Math.max(map.getZoom(), 17));
    openStorePopup(s);
  }

  function setView(v) {
    app.dataset.view = v;
    document.querySelectorAll(".toggle button").forEach((b) => b.setAttribute("aria-selected", b.dataset.v === v));
    if (v === "map" && map) setTimeout(() => map.invalidateSize(), 0);
  }

  // ---------- 내 위치 ----------
  // 화면 아래 안내. 버튼을 주면 그 동작을 붙이고, 없으면 몇 초 뒤 사라진다.
  let toastTimer;
  function toast(msg, actionLabel, action) {
    clearTimeout(toastTimer);
    $("#toastMsg").textContent = msg;
    const btn = $("#toastAction");
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || "";
    btn.onclick = action ? () => { hideToast(); action(); } : null;
    $("#toast").hidden = false;
    if (!actionLabel) toastTimer = setTimeout(hideToast, 4000);
  }
  function hideToast() { $("#toast").hidden = true; }

  // move=false면 지도는 그대로 두고 목록만 거리순으로 바꾼다
  function setMe(lat, lng, move = true) {
    state.me = { lat, lng };
    $("#near").setAttribute("aria-pressed", "true");
    savePref("near", "on");
    if (map) {
      if (meMarker) meMarker.remove();
      meMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16] }),
        zIndexOffset: 1000, interactive: false,
      }).addTo(map);
      if (move) map.setView([lat, lng], 16);
    }
    apply(move);
  }

  // '내 주변'을 끄면 다음에 열 때도 위치를 묻지 않는다
  function clearMe() {
    state.me = null;
    state.radius = 0;
    $("#near").setAttribute("aria-pressed", "false");
    savePref("near", "off");
    if (meMarker) meMarker.remove();
    apply();
  }

  // 목록은 기본으로 내 위치에서 가까운 순. 페이지를 열 때 위치를 받아 오고, 안 되면 조용히 기본 순서로 둔다.
  function autoLocate() {
    if (loadPrefs().near === "off" || !geo) return;
    geo.getCurrentPosition(
      (pos) => { if (!state.me) setMe(pos.coords.latitude, pos.coords.longitude); },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  // 위치 권한이 없거나 거제 밖일 때: 지도를 한 번 눌러 기준 위치를 정한다
  let pickHandler = null;
  function pickOnMap() {
    setView("map");
    app.classList.add("map-picking");
    toast("지도에서 기준 위치를 눌러 주세요.", "취소", () => {
      app.classList.remove("map-picking");
      map.off("click", onPick);
    });
    function onPick(e) {
      app.classList.remove("map-picking");
      hideToast();
      setMe(e.latlng.lat, e.latlng.lng);
      toast("누른 곳에서 가까운 순으로 보여 드려요.");
    }
    if (pickHandler) map.off("click", pickHandler);
    pickHandler = onPick;
    map.once("click", onPick);
  }

  function toggleNear() {
    if (state.me) return clearMe();
    if (!geo) {
      return toast("이 브라우저는 위치 기능을 지원하지 않아요.", "지도에서 내 위치 찍기", pickOnMap);
    }
    const btn = $("#near");
    btn.textContent = "🧭 찾는 중…";
    geo.getCurrentPosition(
      (pos) => {
        btn.textContent = "🧭 내 주변";
        const { latitude: lat, longitude: lng } = pos.coords;
        setMe(lat, lng);
        const inGeoje = lat >= bounds.south - 0.05 && lat <= bounds.north + 0.05
          && lng >= bounds.west - 0.05 && lng <= bounds.east + 0.05;
        if (!inGeoje) toast("지금 위치가 거제도 밖이에요. 거리는 현재 위치 기준이에요.", "지도에서 위치 찍기", pickOnMap);
      },
      (err) => {
        btn.textContent = "🧭 내 주변";
        const msg = err.code === 1
          ? "위치 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나 지도에서 직접 찍어 주세요."
          : "현재 위치를 찾지 못했어요. 지도에서 직접 찍어 주세요.";
        toast(msg, "지도에서 내 위치 찍기", pickOnMap);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  // ---------- 초기화 ----------
  // 지도 바탕: OpenFreeMap (무료·키 없음). 그림이 아니라 데이터로 그리는 지도라
  // 병원·식당 같은 아이콘을 종류별로 끌 수 있다. 버스·지하철 같은 교통 표시만 남기고, 지명은 한글로.
  let tiles;
  // 다크 모드는 같은 지도를 CSS로 반전해 쓴다 (OpenFreeMap의 다크 지도는 도로가 잘 안 보여서)
  const styleUrl = () => "https://tiles.openfreemap.org/styles/liberty";
  // 지도에 보여줄 아이콘 종류 (OpenMapTiles의 class 이름). 교통(버스·철도·공항)은 따로 늘 보인다.
  // 넣을 수 있는 예: hospital(병원) pharmacy(약국) town_hall(관공서) police(경찰) post(우체국)
  //   library(도서관) bank(은행) park(공원) parking(주차장) fuel(주유소) harbor(항구) attraction(명소)
  const SHOW_ICONS = [
    "school", "college", "library", // 교육: 학교·대학교·도서관
    "town_hall", "post", // 관공서·우체국
    "police", "fire_station", // 안전: 경찰·소방
    "bank", "information", // 은행·안내소
    "pitch", "stadium", // 운동장·경기장
    "museum", "art_gallery", // 박물관·미술관
  ];
  function tidyBaseMap(gl) {
    for (const l of gl.getStyle().layers) {
      if (l.type === "fill-extrusion") gl.setLayoutProperty(l.id, "visibility", "none"); // 건물 입체 끄기 (2D)
      if (l["source-layer"] === "poi" && l.id !== "poi_transit") {
        gl.setFilter(l.id, ["all", l.filter, ["match", ["get", "class"], SHOW_ICONS, true, false]]);
      }
      if (l.layout && l.layout["text-field"]) gl.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:ko"], ["get", "name"]]);
    }
  }

  // 거제도 밖으로는 못 나가게 한다
  function initMap() {
    const geoje = L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]);
    map = L.map("map", {
      zoomControl: true, preferCanvas: true,
      maxBounds: geoje.pad(0.15), maxBoundsViscosity: 1.0, minZoom: 10, maxZoom: 19,
    }).fitBounds(geoje);
    tiles = L.maplibreGL({
      style: styleUrl(),
      attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    tiles.getMaplibreMap().once("styledata", () => tidyBaseMap(tiles.getMaplibreMap()));
    // 내 컴퓨터(localhost)에서만: 테스트가 지도 내부를 들여다볼 수 있게
    if (["localhost", "127.0.0.1"].includes(location.hostname)) window.__geosasang = { map, gl: tiles.getMaplibreMap() };
    cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
    map.addLayer(cluster);
    labelLayer = L.layerGroup().addTo(map);
    // 위쪽 영역(칩 줄, 접기)이 바뀌면 지도 칸 크기도 바뀐다. 그때마다 지도가 크기를 다시 잰다.
    if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe(map.getContainer());
    let t;
    const later = () => { clearTimeout(t); t = setTimeout(updateLabels, 120); };
    map.on("zoomstart", () => labelLayer.clearLayers());
    map.on("moveend zoomend resize", later);
    map.on("moveend", updateViewBtn);
    cluster.on("animationend spiderfied unspiderfied", later);
    // 지도를 손으로 끌거나 휠로 확대하면 위쪽을 접는다
    map.on("dragstart", () => { setCompact(true); hideInfo(); });
    map.getContainer().addEventListener("wheel", () => { setCompact(true); hideInfo(); }, { passive: true });
    map.getContainer().addEventListener("touchstart", (e) => { if (e.touches.length > 1) { setCompact(true); hideInfo(); } }, { passive: true });
    map.getContainer().querySelectorAll(".leaflet-control-zoom a").forEach((a) => a.addEventListener("click", hideInfo));
    map.on("dblclick", hideInfo);
    // 정보가 닫힌 뒤 지도 빈 곳을 누르면 선택도 푼다 (정보가 열려 있으면 Leaflet이 팝업을 닫으며 풀린다)
    map.on("click", () => {
      if (selStore && !(storePopup && map.hasLayer(storePopup))) { deselectStore(); step(true); }
    });
  }

  // ---------- 화면 설정 (이 기기에만 저장) ----------
  const PREFS_KEY = "geosasang:prefs";
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function savePref(key, value) {
    try {
      const p = loadPrefs();
      if (value == null) delete p[key]; else p[key] = value;
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (e) {}
  }
  function setZp(on, save = true) {
    state.zp = on;
    $("#zpToggle").setAttribute("aria-pressed", on);
    if (save) { savePref("zp", on ? null : "off"); renderAreaOptions(); apply(); }
  }
  // 지역 고르기 목록: 읍면동마다 가맹점 수 (제로페이를 끄면 지류 가맹점만 센다)
  function renderAreaOptions() {
    const areaCount = {};
    stores.forEach((s) => { if (state.zp || s.k & 1) areaCount[s.a] = (areaCount[s.a] || 0) + 1; });
    const areas = Object.keys(areaCount).sort((a, b) => a.localeCompare(b, "ko"));
    const sel = $("#area");
    sel.querySelectorAll("option[value]:not([value=''])").forEach((o) => o.remove());
    sel.insertAdjacentHTML("beforeend",
      areas.map((a) => `<option value="${esc(a)}">${esc(a)} (${areaCount[a].toLocaleString()})</option>`).join(""));
    sel.value = state.area;
  }
  function applyPrefs(p) {
    const root = document.documentElement;
    if (p.theme === "light" || p.theme === "dark") root.dataset.theme = p.theme;
    else delete root.dataset.theme;
    if (p.fs === "2" || p.fs === "3") root.dataset.fs = p.fs;
    else delete root.dataset.fs;
    document.querySelectorAll(".seg [data-fs]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.fs === (p.fs || "1")));
    document.querySelectorAll(".seg [data-theme]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.theme === (p.theme || "system")));
    savePref("theme", p.theme);
    savePref("fs", p.fs);
    // 글자 크기가 바뀌면 칩 줄 수·지도 크기·라벨 자리를 다시 잰다
    updateChipToggle();
    if (map) { map.invalidateSize(); updateLabels(); }
  }
  // ---------- 사용법 안내 ----------
  // 처음 열면 안내를 띄우고, 닫으면 그때 위치를 묻는다 (안내와 위치 허용 창이 겹치지 않게)
  // 카카오톡·네이버·인스타그램 같은 앱 안의 브라우저에서는 내 위치가 막혀 있을 수 있다
  const inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  function openInBrowserToast() {
    const url = location.href.split("#")[0];
    toast(`앱 안에서 열면 내 위치가 안 될 수 있어요. ${isIOS ? "사파리" : "크롬"}로 열면 잘 돼요.`,
      isIOS ? "사파리로 열기" : "크롬으로 열기", () => {
        if (/KAKAOTALK/i.test(navigator.userAgent)) location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
        else if (!isIOS) location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
        else toast("오른쪽 아래 ⋯ 또는 공유 버튼에서 '사파리로 열기'를 눌러 주세요.");
      });
  }
  function bindGuide() {
    const guide = $("#guide");
    // 처음 닫을 때 한 번만: '봤음'을 저장하고 위치를 묻는다 (닫기 버튼·바깥·Esc 어느 쪽이든)
    const done = () => {
      if (!loadPrefs().guideSeen) { savePref("guideSeen", "1"); autoLocate(); }
    };
    const closeGuide = () => { guide.close(); done(); };
    guide.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeGuide));
    guide.addEventListener("click", (e) => { if (e.target === guide) closeGuide(); });
    guide.addEventListener("cancel", done);
    guide.addEventListener("close", done);
    // 설정에서 안내로 넘어갈 때는 단계를 바꿔 끼운다 (뒤로가기 한 번이면 닫힘)
    $("#openGuide").addEventListener("click", () => {
      $("#settings").dataset.hist = "1";
      $("#settings").close();
      guide.showModal();
      step(true);
    });
    if (inApp && !sessionStorage.getItem("inAppNoticed")) {
      try { sessionStorage.setItem("inAppNoticed", "1"); } catch (e) {}
      setTimeout(openInBrowserToast, 1500);
    }
  }

  function bindSettings() {
    const prefs = loadPrefs();
    applyPrefs(prefs);
    const dlg = $("#settings");
    $("#settingsBtn").addEventListener("click", () => { dlg.showModal(); step(); });
    $("#settingsClose").addEventListener("click", () => dlg.close());
    // 팝업 바깥(어두운 배경)을 누르면 닫는다
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    $("#settings").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.fs) prefs.fs = b.dataset.fs;
      if (b.dataset.theme) prefs.theme = b.dataset.theme;
      applyPrefs(prefs);
    });
  }

  function bind() {
    bindSettings();
    bindGuide();
    bindCredit();
    trackDialog($("#settings"));
    trackDialog($("#guide"));
    let t, tq;
    $("#q").addEventListener("input", (e) => {
      $("#clear").hidden = !e.target.value;
      clearTimeout(t);
      t = setTimeout(() => { state.q = e.target.value.trim(); apply(); }, 150);
      clearTimeout(tq);
      tq = setTimeout(() => step(), 900); // 검색어는 입력을 멈추면 한 단계로
    });
    $("#clear").addEventListener("click", () => {
      $("#q").value = ""; $("#clear").hidden = true; state.q = ""; apply(); step(); $("#q").focus();
    });
    $("#zpToggle").addEventListener("click", () => setZp(!state.zp));
    $("#area").addEventListener("change", (e) => { state.area = e.target.value; apply(); step(); });
    $("#areaPicked").addEventListener("click", () => {
      if (state.inView) { state.inView = null; apply(false); } else { state.area = ""; apply(); }
      step();
    });
    $("#viewListBtn").addEventListener("click", () => {
      if (state.only) { state.only = null; renderMap(false); } // 그 가게만 보기 → 전체로 (선택은 유지)
      else showViewList();
      step();
    });
    $("#radiusChips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-radius]");
      if (b) { setRadius(+b.dataset.radius); step(); }
    });
    // 제목: 검색어·필터·내 위치를 모두 지우고 처음 화면(목록, 거제도 전체 지도)으로
    $("#home").addEventListener("click", (e) => {
      e.preventDefault();
      setCompact(false);
      $("#q").value = "";
      $("#clear").hidden = true;
      Object.assign(state, { q: "", cat: "", area: "", inView: null, radius: 0, only: null });
      state.brands.clear();
      state.subs.clear();
      $("#chips").classList.remove("expanded");
      hideToast();
      apply(); // 내 위치(거리순)는 처음 화면에서도 유지한다
      setView("list");
      // 지도는 내 위치가 있으면 그 주변으로, 없으면 거제도 전체로
      if (map) {
        map.closePopup();
        if (state.me) map.setView([state.me.lat, state.me.lng], 16);
        else map.fitBounds(L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]));
      }
      step();
    });
    $("#chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      state.cat = state.cat === b.dataset.cat ? "" : b.dataset.cat;
      state.brands.clear();
      state.subs.clear();
      apply();
      step();
    });
    $("#brandChips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      toggleIn(state.brands, b.dataset.brand);
      if (!state.brands.has(NO_BRAND)) state.subs.clear();
      apply();
      step();
    });
    $("#subChips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      toggleIn(state.subs, b.dataset.sub);
      apply();
      step();
    });
    $("#near").addEventListener("click", toggleNear);
    $("#toastClose").addEventListener("click", () => {
      hideToast();
      if (app.classList.contains("map-picking")) { app.classList.remove("map-picking"); if (pickHandler) map.off("click", pickHandler); }
    });
    document.querySelectorAll(".toggle button").forEach((b) => b.addEventListener("click", () => { setView(b.dataset.v); step(); }));
    $("#chipToggle").addEventListener("click", () => {
      $("#chips").classList.toggle("expanded");
      updateChipToggle();
    });
    $("#list").addEventListener("click", (e) => {
      const tag = e.target.closest(".area-tag");
      if (tag) {
        state.area = state.area === tag.dataset.area ? "" : tag.dataset.area;
        $("#area").value = state.area;
        apply();
        step();
        return;
      }
      // 가게 줄을 누르면 지도로 가서 그 가게만 보여준다 (네이버·카카오 링크는 제외)
      const li = e.target.closest(".item");
      if (!li || e.target.closest("a")) return;
      document.querySelectorAll(".item.active").forEach((x) => x.classList.remove("active"));
      li.classList.add("active");
      focusStore(state.listResults[+li.dataset.i]);
    });
    let lastTop = 0;
    $(".list-pane").addEventListener("scroll", (e) => {
      const el = e.target;
      if (state.shown < state.listResults.length && el.scrollTop + el.clientHeight > el.scrollHeight - 400) {
        state.shown += PAGE;
        renderList(true);
      }
      // 내리면 위쪽을 접고, 올리거나 맨 위에 오면 다시 펼친다
      const d = el.scrollTop - lastTop;
      if (el.scrollTop < 10 || d < -12) setCompact(false);
      else if (d > 8 && el.scrollTop > 60) setCompact(true);
      lastTop = el.scrollTop;
    });
    $("#showTop").addEventListener("click", () => setCompact(false));
  }

  // ---------- 뒤로가기 = 이전 단계 ----------
  // 화면(목록/지도), 검색어, 업종·브랜드·종류, 지역, 거리 범위, 지도 화면 안, 고른 가게, 열린 팝업을
  // 한 단계로 기록한다. 휴대폰 뒤로가기를 누르면 페이지를 나가지 않고 바로 전 단계로 돌아간다.
  let restoring = false;
  function snap() {
    const dlg = $("#settings").open ? "settings" : $("#guide").open ? "guide" : null;
    return {
      v: app.dataset.view, q: state.q, cat: state.cat, area: state.area,
      brands: [...state.brands], subs: [...state.subs], radius: state.radius || 0,
      inView: state.inView ? state.inView.toBBoxString() : null,
      sel: selStore ? selStore._i : null, only: !!state.only, dlg,
    };
  }
  function step(replace = false) {
    if (restoring || !stores.length) return;
    const st = snap();
    if (history.state && JSON.stringify(history.state) === JSON.stringify(st)) return;
    if (replace || !history.state) history.replaceState(st, "");
    else history.pushState(st, "");
  }
  function restore(st) {
    restoring = true;
    try {
      Object.assign(state, { q: st.q, cat: st.cat, area: st.area, radius: st.radius });
      state.brands = new Set(st.brands);
      state.subs = new Set(st.subs);
      if (st.inView) {
        const [w, so, e, n] = st.inView.split(",").map(Number);
        state.inView = L.latLngBounds([so, w], [n, e]);
      } else state.inView = null;
      $("#q").value = st.q;
      $("#clear").hidden = !st.q;
      for (const d of [$("#settings"), $("#guide")]) {
        if (d.open && st.dlg !== d.id) { d.dataset.hist = "1"; d.close(); }
        else if (!d.open && st.dlg === d.id) d.showModal();
      }
      if (st.sel == null && selStore) { map.closePopup(); deselectStore(); }
      state.only = null;
      apply(false);
      setView(st.v);
      if (st.sel != null && (!selStore || selStore._i !== st.sel)) openStorePopup(stores[st.sel]);
      if (st.only && selStore) { state.only = selStore; renderMap(false); }
    } finally {
      restoring = false;
    }
  }
  window.addEventListener("popstate", (e) => { if (e.state) restore(e.state); });
  // 팝업(설정·안내)을 화면에서 닫았으면 그 단계도 기록에서 걷어 낸다
  function trackDialog(d) {
    d.addEventListener("close", () => {
      if (d.dataset.hist) { delete d.dataset.hist; return; }
      if (history.state && history.state.dlg === d.id) history.back();
    });
  }

  // ---------- 만든 사람 표시 ----------
  // 처음에만 잠깐 보이고, 사용을 시작하면(누르기·스크롤·휠·키보드) 또는 8초 뒤 사라진다
  function bindCredit() {
    const el = $(".made-by");
    const hide = () => {
      el.classList.add("gone");
      ["pointerdown", "keydown", "wheel"].forEach((t) => window.removeEventListener(t, hide, true));
      $(".list-pane").removeEventListener("scroll", hide);
    };
    ["pointerdown", "keydown", "wheel"].forEach((t) => window.addEventListener(t, hide, { capture: true, passive: true }));
    $(".list-pane").addEventListener("scroll", hide, { passive: true });
    setTimeout(hide, 8000);
  }

  // ---------- 위쪽(제목·검색·필터) 접기 ----------
  // 휴대폰 화면에서 목록을 내리거나 지도를 직접 움직이면 접는다. 넓은 화면은 왼쪽 칸이라 접지 않는다.
  const wide = window.matchMedia("(min-width: 900px)");
  function setCompact(on) {
    if (wide.matches) on = false;
    if (app.classList.contains("compact") === on) return;
    app.classList.toggle("compact", on);
    if (on) {
      // 접힌 동안에도 걸린 필터 수는 버튼에 보여준다
      const n = [state.q, state.cat, state.area, state.inView, state.brands.size, state.subs.size, state.radius].filter(Boolean).length;
      $("#showTop").innerHTML = `🔍 검색·필터${n ? ` <i>${n}</i>` : ""}`;
    }
    setTimeout(() => map && map.invalidateSize(), 280); // 접기 애니메이션이 끝나면 지도 크기를 다시 잰다
  }

  async function init() {
    bind();
    setZp(loadPrefs().zp !== "off", false);
    try {
      const data = await (await fetch("stores.json", { cache: "no-cache" })).json();
      categories = data.categories;
      subtypes = data.subtypes || {};
      brands = data.brands;
      bounds = data.bounds;
      initMap();
      stores = data.stores.map((s, i) => ({ ...s, _i: i, _n: norm(s.n), _o: norm(s.o || ""), _d: norm(s.d), _cho: choseong(norm(s.n)) }));
      const paper = stores.filter((s) => s.k & 1).length, zp = stores.filter((s) => s.k & 2).length;
      $("#meta").textContent = `${stores.length.toLocaleString()}곳 (지류 ${paper.toLocaleString()} · 제로페이 ${zp.toLocaleString()}) · ${data.updated} 기준`;
      renderAreaOptions();
      window.addEventListener("resize", updateChipToggle);
      // 아파트 단지 이름 (없어도 사이트는 동작)
      fetch("apartments.json", { cache: "no-cache" }).then((r) => r.json()).then((a) => { apartments = a; updateLabels(); }).catch(() => {});
      apply();
      step(); // 첫 화면을 기록의 출발점으로
      if (loadPrefs().guideSeen) autoLocate();
      else { $("#guide").showModal(); step(); }
    } catch (e) {
      console.error(e);
      $("#meta").textContent = "목록을 불러오지 못했어요";
      $("#list").innerHTML = `<li class="empty">가맹점 목록을 불러오지 못했어요. 새로고침해 주세요.</li>`;
    }
  }

  init();

  // 서비스 워커: 인터넷이 끊겼을 때도 마지막으로 본 화면을 열 수 있게
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
