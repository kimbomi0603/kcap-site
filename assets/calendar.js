/* 전시 캘린더 — /api/exhibitions 데이터를 지역 · 기간 · 무료 · 관심 · 거리로 거른다 */
(function () {
  var K = window.KCAP, $ = function (s) { return document.querySelector(s); };
  var root = $('#cal'); if (!root) return;
  var REG = [['all', '전국', []], ['seoul', '서울', ['서울']], ['busan', '부산', ['부산']], ['daegu', '대구', ['대구']], ['incheon', '인천', ['인천']], ['gwangju', '광주', ['광주']],
    ['daejeon', '대전', ['대전']], ['ulsan', '울산', ['울산']], ['sejong', '세종', ['세종']], ['gyeonggi', '경기', ['경기']], ['gangwon', '강원', ['강원']],
    ['chungbuk', '충북', ['충북']], ['chungnam', '충남', ['충남']], ['jeonbuk', '전북', ['전북']], ['jeonnam', '전남', ['전남']],
    ['gyeongbuk', '경북', ['경북']], ['gyeongnam', '경남', ['경남']], ['jeju', '제주', ['제주']], ['jn', '전남광주', ['광주', '전남']]]; // jn 은 옛 링크 호환
  var P = new URLSearchParams(location.search);
  var S = { items: [], r: (function (r) { return r === 'gangjin' ? 'jeonnam' : r; })(P.get('r')) || 'all', w: P.get('w') || 'now', q: P.get('q') || '', date: '', free: false, mine: false, sort: 'end', view: 'list', shown: 24, pos: null };
  var list = $('#cl'), meta = $('#cmeta'), more = $('#cmore'), sel = $('#cr');

  function areaOk(it) { var r = REG.filter(function (x) { return x[0] === S.r; })[0]; return !r || !r[2].length || r[2].indexOf(it.area) > -1; }
  function weekend() { var t = new Date(), d = t.getDay(), sat = new Date(t); sat.setDate(t.getDate() + (d === 0 ? -1 : 6 - d)); var s = sat.getFullYear() + '-' + ('0' + (sat.getMonth() + 1)).slice(-2) + '-' + ('0' + sat.getDate()).slice(-2); return [d === 0 ? K.today() : s, K.addDays(s, 1)]; }
  function whenOk(it) {
    var t = K.today(), s = it.start || t, e = it.end || s;
    if (e < t) return false;
    if (S.w === 'now') return s <= t;
    if (S.w === 'weekend') { var w = weekend(); return s <= w[1] && e >= w[0]; }
    if (S.w === 'ending') return s <= t && e <= K.addDays(t, 7);
    if (S.w === 'upcoming') return s > t && s <= K.addDays(t, 21);
    if (S.w === 'date' && S.date) return s <= S.date && e >= S.date;
    return true;
  }
  function textOk(it) { if (!S.q) return true; var h = (it.title + ' ' + it.place + ' ' + it.sigungu + ' ' + it.area + ' ' + (it.note || '')).toLowerCase(); return S.q.toLowerCase().split(/\s+/).every(function (w) { return h.indexOf(w) > -1; }); }
  function filtered(ignoreRegion) {
    return S.items.filter(function (it) {
      return (ignoreRegion || areaOk(it)) && whenOk(it) && textOk(it) && (!S.free || it.free === true) && (!S.mine || K.saved.has('ex:' + it.id));
    });
  }
  function sorted(a) {
    var c = a.slice();
    if (S.sort === 'near' && S.pos) c.forEach(function (it) { it._km = it.lat ? K.km(S.pos[0], S.pos[1], it.lat, it.lng) : 9e9; });
    c.sort(function (x, y) {
      if (x.pick !== y.pick) return x.pick ? -1 : 1; // 협회 추천 먼저
      if (S.sort === 'near' && S.pos) return x._km - y._km;
      if (S.sort === 'new') return (y.start || '').localeCompare(x.start || '');
      return (x.end || '9').localeCompare(y.end || '9');
    });
    return c;
  }
  function card(it) {
    var b = K.badge(it.start, it.end), id = 'ex:' + it.id, on = K.saved.has(id);
    var dist = S.sort === 'near' && it._km && it._km < 9e8 ? '<span class="km">' + (it._km < 10 ? it._km.toFixed(1) : Math.round(it._km)) + 'km</span>' : '';
    return '<article class="exc"><button class="exc-im" data-open="' + K.esc(it.id) + '" aria-label="' + K.esc(it.title) + ' 상세 보기">' +
      (it.thumb ? '<img src="' + K.esc(it.thumb) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<span class="ph">' + K.esc(it.place || '전시') + '</span></button>' +
      '<div class="exc-bd"><div class="tags"><span class="bdg ' + b.cls + '">' + b.txt + '</span>' + (it.free === true ? '<span class="fr">무료</span>' : '') + (it.pick ? '<span class="kc">협회 추천</span>' : '') + dist + '</div>' +
      '<h3><button data-open="' + K.esc(it.id) + '">' + K.esc(it.title) + '</button></h3><p class="pl">' + K.esc(it.place) + (it.sigungu ? ' · ' + K.esc(it.sigungu) : it.area ? ' · ' + K.esc(it.area) : '') + '</p>' +
      '<p class="dt">' + K.range(it.start, it.end) + '</p>' +
      '<div class="ac"><button class="sv' + (on ? ' on' : '') + '" data-save="' + K.esc(it.id) + '" aria-pressed="' + on + '">' + (on ? '♥ 관심' : '♡ 관심') + '</button><button data-cal="' + K.esc(it.id) + '">캘린더</button><button data-share="' + K.esc(it.id) + '">공유</button></div></div></article>';
  }
  function byId(id) { return S.items.filter(function (x) { return String(x.id) === String(id); })[0]; }

  function counts() {
    var base = filtered(true);
    [].forEach.call(sel.options, function (o) {
      var r = REG.filter(function (x) { return x[0] === o.value; })[0];
      var n = base.filter(function (it) { return !r[2].length || r[2].indexOf(it.area) > -1; }).length;
      o.textContent = r[1] + ' (' + n + ')';
    });
  }
  function render() {
    counts();
    var a = sorted(filtered());
    meta.innerHTML = '<b>' + a.length + '</b>건' + (S.updated ? ' · ' + S.updated + ' 기준' : '');
    if (!a.length) list.innerHTML = '<div class="empty">조건에 맞는 전시가 없습니다. 지역을 <b>전국</b>으로 바꾸거나 기간을 넓혀 보세요.</div>';
    else list.innerHTML = a.slice(0, S.shown).map(card).join('');
    more.hidden = a.length <= S.shown;
    if (S.view === 'map') drawMap(a);
    var u = new URLSearchParams(); if (S.r !== 'all') u.set('r', S.r); if (S.w !== 'now') u.set('w', S.w); if (S.q) u.set('q', S.q);
    history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '') + location.hash);
  }

  // 지도 (필요할 때만 Leaflet을 불러온다)
  var map, layer;
  function loadLeaflet(cb) {
    if (window.L) return cb();
    var c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(c);
    var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = cb; document.head.appendChild(s);
  }
  function drawMap(a) {
    loadLeaflet(function () {
      if (!map) {
        map = L.map('cm', { scrollWheelZoom: false }).setView([36.3, 127.8], 7);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18 }).addTo(map);
      }
      if (layer) layer.remove();
      layer = L.layerGroup().addTo(map);
      var pts = [];
      a.forEach(function (it) {
        if (!it.lat || !it.lng) return;
        pts.push([it.lat, it.lng]);
        L.circleMarker([it.lat, it.lng], { radius: 7, color: '#fff', weight: 2, fillColor: it.pick ? '#e82024' : '#005074', fillOpacity: .9 })
          .bindPopup('<b>' + K.esc(it.title) + '</b><br>' + K.esc(it.place) + '<br>' + K.range(it.start, it.end) + '<br><a href="#" data-open="' + K.esc(it.id) + '">자세히</a>').addTo(layer);
      });
      if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 13 });
      setTimeout(function () { map.invalidateSize(); }, 50);
    });
  }

  // 상세 창
  var md = $('#md'), back = null, pushed = false;
  function openItem(id) {
    var it = byId(id); if (!it) return;
    fill(it);
    if (md.hidden) {
      back = document.activeElement; // 닫으면 누른 자리로 초점을 돌려준다
      // 휴대폰 '뒤로' 버튼으로 창만 닫히도록 기록을 하나 남긴다
      if (!pushed) { try { history.pushState({ kcapMd: 1 }, '', location.href); pushed = true; } catch (e) {} }
    }
    md.hidden = false; document.body.classList.add('md-open');
    var x = md.querySelector('.md-x'); if (x) x.focus();
    if (!it.detail && it.src !== 'kcap') fetch('/api/exhibitions?seq=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (j) {
      if (j.item) { ['price', 'free', 'url', 'addr', 'phone'].forEach(function (k) { if (j.item[k] !== undefined) it[k] = j.item[k]; }); if (!it.thumb && j.item.thumb) it.thumb = j.item.thumb; it.detail = true; if (!md.hidden && md.dataset.id === String(id)) fill(it); }
    }).catch(function () {});
  }
  function fill(it) {
    md.dataset.id = it.id;
    var b = K.badge(it.start, it.end), q = encodeURIComponent((it.place || '') + ' ' + (it.sigungu || ''));
    var on = K.saved.has('ex:' + it.id);
    $('#mdb').innerHTML = (it.thumb ? '<div class="md-im"><img src="' + K.esc(it.thumb) + '" alt="" onerror="this.parentNode.remove()"></div>' : '') +
      '<div class="md-tx"><div class="tags"><span class="bdg ' + b.cls + '">' + b.txt + '</span>' + (it.free === true ? '<span class="fr">무료</span>' : '') + (it.pick ? '<span class="kc">협회 추천</span>' : '') + '</div>' +
      '<h2 id="mdt">' + K.esc(it.title) + '</h2><dl>' +
      '<dt>기간</dt><dd>' + K.esc((it.start || '').replace(/-/g, '.')) + ' – ' + K.esc((it.end || '').replace(/-/g, '.')) + '</dd>' +
      '<dt>장소</dt><dd>' + K.esc(it.place) + (it.addr ? '<br><small>' + K.esc(it.addr) + '</small>' : '') + '</dd>' +
      '<dt>관람료</dt><dd>' + (it.price ? K.esc(it.price) : it.detail ? '기관에 문의' : '불러오는 중…') + '</dd>' +
      (it.phone ? '<dt>문의</dt><dd>' + K.esc(it.phone) + '</dd>' : '') + (it.note ? '<dt>메모</dt><dd>' + K.esc(it.note) + '</dd>' : '') + '</dl>' +
      '<div class="md-ac">' + (it.url ? '<a class="btn red" href="' + K.esc(it.url) + '" target="_blank" rel="noopener">공식 안내 <span class="ar">↗</span></a>' : '') +
      '<a class="btn line" href="https://map.naver.com/p/search/' + q + '" target="_blank" rel="noopener">네이버 지도</a><a class="btn line" href="https://map.kakao.com/?q=' + q + '" target="_blank" rel="noopener">카카오맵</a></div>' +
      '<div class="md-ac sm"><button data-save="' + K.esc(it.id) + '" class="' + (on ? 'on' : '') + '">' + (on ? '♥ 관심 저장됨' : '♡ 관심 저장') + '</button><a href="' + K.esc(K.gcal(ev(it))) + '" target="_blank" rel="noopener">구글 캘린더에 담기</a><button data-ics="' + K.esc(it.id) + '">휴대폰 캘린더(.ics)</button><button data-share="' + K.esc(it.id) + '">공유</button></div>' +
      '<p class="md-src">자료: 한국문화정보원 문화포털' + (it.src === 'kcap' ? ' · 협회 등록' : '') + '</p></div>';
  }
  function ev(it) { return { id: 'ex-' + it.id, title: it.title, start: it.start, end: it.end, place: it.place, sub: it.place, link: location.origin + '/calendar.html?id=' + encodeURIComponent(it.id) }; }
  function hideMd() { md.hidden = true; document.body.classList.remove('md-open'); if (back && document.contains(back)) back.focus(); back = null; }
  function closeMd() { if (pushed) { pushed = false; history.back(); } else hideMd(); }
  window.addEventListener('popstate', function () { pushed = false; if (!md.hidden) hideMd(); });
  md.addEventListener('click', function (e) { if (e.target === md || e.target.closest('.md-x')) closeMd(); });
  // 창이 열린 동안 Tab 이동이 창 안에서만 돌게 한다
  md.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = [].filter.call(md.querySelectorAll('a[href],button'), function (n) { return n.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !md.hidden) closeMd(); });

  // 버튼들 (목록 · 지도 · 상세 창 공통)
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-save],[data-cal],[data-share],[data-ics]'); if (!t || !root.parentNode.contains(t) && !md.contains(t) && !t.closest('.leaflet-popup')) return;
    if (t.dataset.open) { e.preventDefault(); openItem(t.dataset.open); return; }
    var it = byId(t.dataset.save || t.dataset.cal || t.dataset.share || t.dataset.ics); if (!it) return;
    if (t.dataset.save) { var on = K.saved.toggle({ id: 'ex:' + it.id, type: '전시', title: it.title, sub: it.place, start: it.start, end: it.end, link: '/calendar.html?id=' + encodeURIComponent(it.id) }); K.toast(on ? '관심 목록에 담았습니다' : '관심 목록에서 뺐습니다'); render(); if (!md.hidden) fill(it); }
    else if (t.dataset.cal) { window.open(K.gcal(ev(it)), '_blank', 'noopener'); }
    else if (t.dataset.ics) K.ics(ev(it));
    else if (t.dataset.share) K.share(it.title, location.origin + '/calendar.html?id=' + encodeURIComponent(it.id));
  });

  // 필터 조작
  sel.value = S.r;
  sel.addEventListener('change', function () { S.r = sel.value; S.shown = 24; render(); });
  $('#cq').value = S.q;
  $('#cq').addEventListener('input', function () { S.q = this.value.trim(); S.shown = 24; render(); });
  function press(sel, cur) { [].forEach.call(document.querySelectorAll(sel), function (x) { var on = x === cur; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); }
  [].forEach.call(document.querySelectorAll('#cw button'), function (b) {
    if (b.dataset.w === S.w) press('#cw button', b);
    b.addEventListener('click', function () {
      S.w = b.dataset.w; press('#cw button', b);
      $('#cd').hidden = S.w !== 'date'; if (S.w === 'date' && !S.date) { S.date = K.today(); $('#cd').value = S.date; }
      S.shown = 24; render();
    });
  });
  $('#cd').addEventListener('change', function () { S.date = this.value; render(); });
  $('#cf').addEventListener('change', function () { S.free = this.checked; render(); });
  $('#cmine').addEventListener('change', function () { S.mine = this.checked; render(); });
  $('#cs').addEventListener('change', function () {
    var v = this.value, box = this;
    if (v === 'near' && !S.pos) {
      if (!navigator.geolocation) { K.toast('이 브라우저는 위치를 지원하지 않습니다'); box.value = S.sort; return; }
      K.toast('현재 위치를 확인하는 중…');
      navigator.geolocation.getCurrentPosition(function (p) { S.pos = [p.coords.latitude, p.coords.longitude]; S.sort = 'near'; render(); }, function () { K.toast('위치 권한이 없어 거리순으로 볼 수 없습니다'); box.value = S.sort; }, { timeout: 8000 });
      return;
    }
    S.sort = v; render();
  });
  [].forEach.call(document.querySelectorAll('#cv button'), function (b) {
    b.addEventListener('click', function () {
      S.view = b.dataset.v; press('#cv button', b);
      $('#cm').hidden = S.view !== 'map'; render();
    });
  });
  press('#cv button', document.querySelector('#cv button.on'));
  more.addEventListener('click', function () { S.shown += 24; render(); });
  document.addEventListener('kcap:saved', function () { var n = K.saved.all().filter(function (x) { return x.type === '전시'; }).length; $('#cminen').textContent = n ? ' (' + n + ')' : ''; });
  document.dispatchEvent(new CustomEvent('kcap:saved'));

  // 데이터 불러오기
  list.innerHTML = '<div class="empty">전국 전시 정보를 불러오는 중…</div>';
  fetch('/api/exhibitions').then(function (r) { return r.json(); }).then(function (j) {
    S.items = (j.items || []).map(function (it) { it.id = String(it.id); return it; });
    if (j.updated) { var d = new Date(j.updated); S.updated = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + d.getHours() + '시'; }
    if (!j.configured && !S.items.length) { list.innerHTML = '<div class="empty"><b>전국 전시 자동 수집을 준비하고 있습니다.</b><br>그동안 아래 기관 누리집과 <a href="https://www.culture.go.kr" target="_blank" rel="noopener">문화포털</a>에서 전시를 확인하실 수 있습니다.</div>'; meta.textContent = ''; return; }
    if (!j.ok && !S.items.length) { list.innerHTML = '<div class="empty">공공 API 응답이 늦어지고 있습니다. 잠시 뒤 다시 열어 주세요.</div>'; return; }
    render();
    var id = P.get('id'); if (id) openItem(id);
  }).catch(function () { list.innerHTML = '<div class="empty">전시 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</div>'; });
})();
