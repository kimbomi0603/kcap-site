/* 정보마당 — 통합 검색 · 지금 볼 수 있는 전시 · 이번 달 공모 · 관심 목록 */
(function () {
  var K = window.KCAP, $ = function (s) { return document.querySelector(s); };
  var PICKS = []; try { PICKS = JSON.parse(($('#picksData') || {}).textContent || '[]'); } catch (e) {}
  var AREA = { all: [], jn: ['광주', '전남'], gangjin: ['광주', '전남'], gwangju: ['광주'], jeonnam: ['전남'], seoul: ['서울'], busan: ['부산'], daegu: ['대구'], incheon: ['인천'], daejeon: ['대전'], ulsan: ['울산'], sejong: ['세종'], gyeonggi: ['경기'], gangwon: ['강원'], chungbuk: ['충북'], chungnam: ['충남'], jeonbuk: ['전북'], gyeongbuk: ['경북'], gyeongnam: ['경남'], jeju: ['제주'] };
  var month = new Date().getMonth() + 1, EX = null, exReady;

  function loadEx() {
    if (!exReady) exReady = fetch('/api/exhibitions').then(function (r) { return r.json(); }).then(function (j) { EX = j; return j; }).catch(function () { EX = { ok: false, items: [] }; return EX; });
    return exReady;
  }
  function exFilter(q, reg) {
    var t = K.today(), a = AREA[reg] || [];
    return (EX && EX.items || []).filter(function (it) {
      if (!it.end || it.end < t || (it.start && it.start > K.addDays(t, 21))) return false;
      if (a.length && a.indexOf(it.area) < 0) return false;
      if (reg === 'gangjin' && (it.sigungu || '').indexOf('강진') < 0 && (it.place || '').indexOf('강진') < 0) return false;
      if (!q) return true;
      var h = (it.title + ' ' + it.place + ' ' + it.sigungu).toLowerCase();
      return q.toLowerCase().split(/\s+/).every(function (w) { return h.indexOf(w) > -1; });
    }).sort(function (x, y) { if (x.pick !== y.pick) return x.pick ? -1 : 1; return (x.end || '9').localeCompare(y.end || '9'); });
  }
  function exCard(it) {
    var b = K.badge(it.start, it.end);
    return '<a class="mini" href="calendar.html?id=' + encodeURIComponent(it.id) + '">' + (it.thumb ? '<span class="im"><img src="' + K.esc(it.thumb) + '" alt="" loading="lazy" onerror="this.remove()"></span>' : '<span class="im"></span>') +
      '<span class="tx"><span class="bdg ' + b.cls + '">' + b.txt + '</span><b>' + K.esc(it.title) + '</b><small>' + K.esc(it.place) + ' · ' + K.range(it.start, it.end) + '</small></span></a>';
  }
  function pkRow(p) {
    var st = p.months.length === 12 ? '<span class="bdg new">연중</span>' : p.months.indexOf(month) > -1 ? '<span class="bdg hot">이번 달 접수</span>' : '';
    return '<a class="row" href="' + K.esc(p.u) + '" target="_blank" rel="noopener">' + st + '<b>' + K.esc(p.n) + '</b><small>' + K.esc(p.a) + ' · ' + K.esc(p.w) + '</small></a>';
  }
  function gvRow(it) {
    var b = it.end ? K.badge(null, it.end, 'apply') : null;
    return '<a class="row" href="' + K.esc(it.url) + '" target="_blank" rel="noopener">' + (b ? '<span class="bdg ' + b.cls + '">' + b.txt + '</span>' : '') + '<b>' + K.esc(it.title) + '</b><small>' + K.esc(it.org) + (it.period ? ' · ' + K.esc(it.period) : '') + '</small></a>';
  }
  function group(id, title, more, html, n) {
    var g = $('#' + id); g.innerHTML = '<div class="gh"><h3>' + title + (n != null ? ' <em>' + n + '</em>' : '') + '</h3>' + (more ? '<a href="' + more + '">더 보기 →</a>' : '') + '</div><div class="gb">' + html + '</div>';
  }

  // ---- 통합 검색 ----
  var form = $('#us');
  function search() {
    var q = $('#usq').value.trim(), reg = $('#usr').value, api = encodeURIComponent(q), none = '<p class="none">찾는 결과가 없습니다.</p>';
    $('#usout').hidden = false;
    ['g-ex', 'g-pk', 'g-gv', 'g-yt'].forEach(function (id) { $('#' + id).innerHTML = '<div class="gh"><h3>불러오는 중…</h3></div>'; });
    loadEx().then(function () {
      var a = exFilter(q, reg);
      if (EX && !EX.configured && !a.length) return group('g-ex', '전시', 'calendar.html', '<p class="none">전시 자동 수집을 준비하고 있습니다.</p>');
      group('g-ex', '전시', 'calendar.html?' + (q ? 'q=' + api + '&' : '') + 'r=' + (reg === 'gangjin' ? 'jeonnam' : reg), a.length ? a.slice(0, 6).map(exCard).join('') : none, a.length);
    });
    var pk = PICKS.filter(function (p) { if (!q) return true; var h = (p.n + ' ' + p.a + ' ' + p.t + ' ' + p.tags.join(' ') + ' ' + p.who.join(' ')); return q.split(/\s+/).every(function (w) { return h.indexOf(w) > -1; }); });
    group('g-pk', '협회 추천 공모', 'support.html#picks', pk.length ? pk.slice(0, 6).map(pkRow).join('') : none, pk.length);
    [['gov24', 'g-gv', '정부 · 지자체 사업'], ['youth', 'g-yt', '청년정책']].forEach(function (s) {
      fetch('/api/support?src=' + s[0] + '&region=' + encodeURIComponent(reg) + '&q=' + api).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.configured) return group(s[1], s[2], 'support.html#search', '<p class="none">실시간 검색을 준비하고 있습니다.</p>');
        var t = K.today(), it = (j.items || []).filter(function (x) { return !x.end || x.end >= t; });
        group(s[1], s[2], 'support.html#search', it.length ? it.slice(0, 5).map(gvRow).join('') : none, it.length);
      }).catch(function () { group(s[1], s[2], 'support.html#search', '<p class="none">지금은 불러올 수 없습니다.</p>'); });
    });
    var u = new URLSearchParams(); if (q) u.set('q', q); if (reg !== 'all') u.set('r', reg);
    history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
  }
  if (form) {
    var P = new URLSearchParams(location.search);
    if (P.get('q')) $('#usq').value = P.get('q');
    if (P.get('r')) $('#usr').value = P.get('r');
    form.addEventListener('submit', function (e) { e.preventDefault(); search(); });
    [].forEach.call(document.querySelectorAll('.us-hot button'), function (b) { b.addEventListener('click', function () { $('#usq').value = b.textContent; search(); }); });
    if (P.get('q')) search();
  }

  // ---- 지금 볼 수 있는 전시 (지원사업 찾기에서 고른 '사는 곳' 우선, 없으면 전국) ----
  var now = $('#nowEx');
  var myReg = 'all'; try { myReg = (JSON.parse(localStorage.getItem('kcap_profile_v1') || '{}').reg) || 'all'; } catch (e) {}
  if (now) loadEx().then(function () {
    var a = exFilter('', myReg).filter(function (it) { return !it.start || it.start <= K.today(); });
    if (!a.length) a = exFilter('', 'all').filter(function (it) { return !it.start || it.start <= K.today(); });
    now.innerHTML = a.length ? a.slice(0, 4).map(exCard).join('') : '<p class="none">전시 자동 수집을 준비하고 있습니다. <a href="calendar.html#venues">주요 기관 바로가기 →</a></p>';
  });
  // ---- 이번 달 접수 공모 ----
  var mp = $('#monthPk');
  if (mp) { var m = PICKS.filter(function (p) { return p.months.indexOf(month) > -1 && p.months.length < 12; }); mp.innerHTML = m.length ? m.map(pkRow).join('') : '<p class="none">이번 달에 보통 접수하는 추천 공모가 없습니다. <a href="support.html#year">연간 공모 달력 →</a></p>'; }

  // ---- 관심 목록 ----
  var sv = $('#savedList');
  function paint() {
    if (!sv) return;
    var a = K.saved.all();
    $('#savedN').textContent = a.length ? a.length + '건' : '';
    if (!a.length) { sv.innerHTML = '<p class="none">전시 캘린더와 지원사업 찾기에서 ♡ 관심을 누르면 여기에 모입니다. 로그인 없이 이 브라우저에 저장됩니다.</p>'; $('#savedIcs').hidden = true; return; }
    $('#savedIcs').hidden = !a.some(function (x) { return x.end; });
    sv.innerHTML = a.map(function (x, i) {
      var b = x.end ? K.badge(x.start, x.end, x.type === '전시' ? '' : 'apply') : null, href = x.link || x.url || '#';
      return '<div class="row sv"><a href="' + K.esc(href) + '"' + (/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '') + '><span class="ty">' + K.esc(x.type) + '</span>' + (b ? '<span class="bdg ' + b.cls + '">' + b.txt + '</span>' : '') + '<b>' + K.esc(x.title) + '</b><small>' + K.esc(x.sub || '') + (x.end ? ' · ' + K.range(x.start || x.end, x.end) : '') + '</small></a><button type="button" data-rm="' + i + '" aria-label="관심 목록에서 빼기">×</button></div>';
    }).join('');
  }
  if (sv) {
    sv.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; var x = K.saved.all()[+b.dataset.rm]; K.saved.toggle(x); paint(); });
    $('#savedIcs').addEventListener('click', function () {
      K.ics(K.saved.all().filter(function (x) { return x.end; }).map(function (x) { return { id: x.id, title: (x.type === '전시' ? '' : '[마감] ') + x.title, start: x.type === '전시' ? x.start : x.end, end: x.end, sub: x.sub, link: /^https?:/.test(x.link || '') ? x.link : location.origin + (x.link || '') }; }), 'KCAP 관심 목록');
    });
    document.addEventListener('kcap:saved', paint); paint();
  }
})();
