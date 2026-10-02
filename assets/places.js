/* KCAP 지부별 예술 자원 지도: data/places.csv를 읽어 목록·지도로 보여 준다 */
(function () {
  var list = document.getElementById('plList'); if (!list) return;
  var meta = document.getElementById('plMeta'), mapBox = document.getElementById('plMap'), mapWrap = document.getElementById('plMapWrap');
  var segB = document.getElementById('plBranch'), segT = document.getElementById('plType'), q = document.getElementById('plQ');
  var esc = (window.KCAP && KCAP.esc) || function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var BR = { '서경': '서울 · 인천 · 경기 · 강원', '영중': '충청 · 경상 · 부산 · 울산 · 대구 · 대전', '제전': '제주 · 전남 · 전북 · 광주' };
  var TYPE_CLS = { '전시공간': '', '레지던시': 'new', '대관공간': 'soon', '재료상': 'warn', '운송/액자': 'warn', '공공지원기관': 'hot' };

  // 따옴표·줄바꿈이 있는 셀도 처리하는 CSV 파서
  function parseCSV(text) {
    var rows = [], row = [], cell = '', inQ = false, i, c;
    text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function toObjects(rows) {
    var head = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1).map(function (r) {
      var o = {}; head.forEach(function (h, i) { o[h] = (r[i] || '').trim(); });
      o.lat = parseFloat(o['위도']); o.lng = parseFloat(o['경도']);
      return o;
    }).filter(function (o) { return o['이름']; });
  }

  var DATA = [], S = { b: '전체', t: '전체', q: '' };
  function filtered() {
    var qq = S.q.toLowerCase();
    return DATA.filter(function (o) {
      if (S.b !== '전체' && o['지부'] !== S.b) return false;
      if (S.t !== '전체' && o['유형'] !== S.t) return false;
      if (qq && (o['이름'] + ' ' + o['주소'] + ' ' + o['시도'] + ' ' + o['메모']).toLowerCase().indexOf(qq) < 0) return false;
      return true;
    });
  }
  function row(o) {
    var name = o['링크'] ? '<a href="' + esc(o['링크']) + '" target="_blank" rel="noopener">' + esc(o['이름']) + ' ↗</a>' : esc(o['이름']);
    var bits = [];
    if (o['주소']) bits.push(esc(o['주소']));
    if (o['대관료']) bits.push('대관료 ' + esc(o['대관료']));
    if (o['연락처']) bits.push('<a href="tel:' + esc(o['연락처'].replace(/[^\d+]/g, '')) + '">' + esc(o['연락처']) + '</a>');
    if (o['메모']) bits.push(esc(o['메모']));
    var cls = TYPE_CLS[o['유형']] || '';
    return '<div class="crow"><span class="bdg ' + cls + '">' + esc(o['유형']) + '</span><span class="bdg past">' + esc(o['지부']) + ' · ' + esc(o['시도']) + '</span><b>' + name + '</b><small>' + bits.join(' · ') + '</small></div>';
  }
  function render() {
    var a = filtered();
    list.innerHTML = a.length ? a.map(row).join('') : '<p class="none">조건에 맞는 곳이 없습니다. 아는 곳이 있다면 아래 「이 장소 알려주기」로 보내 주세요.</p>';
    if (meta) meta.innerHTML = '<b>' + a.length + '</b>곳' + (S.b !== '전체' ? ' · ' + esc(S.b) + '지부 (' + esc(BR[S.b] || '') + ')' : '') + (S.t !== '전체' ? ' · ' + esc(S.t) : '');
    drawMap(a);
  }

  // 지도: 좌표가 있는 행이 있을 때만 Leaflet을 불러온다 (calendar.js와 같은 방식)
  var map, layer;
  function loadLeaflet(cb) {
    if (window.L) return cb();
    var c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(c);
    var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = cb; document.head.appendChild(s);
  }
  function drawMap(a) {
    if (!mapBox) return;
    var pts = a.filter(function (o) { return !isNaN(o.lat) && !isNaN(o.lng); });
    var any = DATA.some(function (o) { return !isNaN(o.lat) && !isNaN(o.lng); });
    if (mapWrap) mapWrap.hidden = !any;
    if (!any) return;
    loadLeaflet(function () {
      if (!map) {
        map = L.map('plMap', { scrollWheelZoom: false }).setView([36.3, 127.8], 7);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18 }).addTo(map);
      }
      if (layer) layer.remove();
      layer = L.layerGroup().addTo(map);
      pts.forEach(function (o) {
        L.circleMarker([o.lat, o.lng], { radius: 7, color: '#fff', weight: 2, fillColor: o['유형'] === '공공지원기관' ? '#e82024' : '#005074', fillOpacity: .9 })
          .bindPopup('<b>' + esc(o['이름']) + '</b><br>' + esc(o['유형']) + ' · ' + esc(o['주소']) + (o['링크'] ? '<br><a href="' + esc(o['링크']) + '" target="_blank" rel="noopener">누리집 ↗</a>' : '')).addTo(layer);
      });
      if (pts.length) map.fitBounds(pts.map(function (o) { return [o.lat, o.lng]; }), { padding: [30, 30], maxZoom: 13 });
      setTimeout(function () { map.invalidateSize(); }, 50);
    });
  }

  // 조작
  function seg(el, key) {
    if (!el) return;
    [].forEach.call(el.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.classList.contains('on')); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      [].forEach.call(el.querySelectorAll('button'), function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      S[key] = b.getAttribute('data-v'); render();
    });
  }
  seg(segB, 'b'); seg(segT, 't');
  if (q) q.addEventListener('input', function () { S.q = q.value.trim(); render(); });

  // 첫 화면: 주소창의 ?b=서경 처럼 지부를 미리 고를 수 있다
  var u = new URLSearchParams(location.search);
  if (u.get('b') && BR[u.get('b')] && segB) { var pre = segB.querySelector('[data-v="' + u.get('b') + '"]'); if (pre) pre.click(); }

  fetch('data/places.csv', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (t) {
    DATA = toObjects(parseCSV(t)); render();
  }).catch(function () {
    list.innerHTML = '<p class="none">자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>';
  });

  // 제보 폼: 보낸 뒤 돌아오면 완료 문구를 보여 준다
  var f = document.getElementById('placeForm'), done = document.getElementById('placeDone');
  if (f) {
    if (/[?&]sent=1/.test(location.search)) { if (done) done.hidden = false; f.hidden = true; }
    else {
      var nx = f.querySelector('[name=_next]'); if (nx) nx.value = location.origin + '/places.html?sent=1#tell';
      f.addEventListener('submit', function (e) {
        if (!f.checkValidity()) { e.preventDefault(); f.reportValidity(); if (window.KCAP && KCAP.toast) KCAP.toast('빠진 항목을 채워 주세요.'); return; }
        var sj = f.querySelector('[name=_subject]'); if (sj) sj.value = '[장소 알려주기] ' + f.elements['이름'].value;
      });
    }
  }
})();
