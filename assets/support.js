/* 지원사업 찾기 — 맞춤 찾기 · 추천 공모 필터 · 연간 달력 · 정부/지자체 실시간 검색 */
(function () {
  var K = window.KCAP, $ = function (s) { return document.querySelector(s); };
  var DATA = []; try { DATA = JSON.parse(($('#picksData') || {}).textContent || '[]'); } catch (e) {}
  var byId = {}; DATA.forEach(function (p) { byId[p.id] = p; });
  var month = new Date().getMonth() + 1;
  var cards = [].slice.call(document.querySelectorAll('.pk'));

  // ---- 맞춤 찾기 (조건은 이 브라우저에만 저장) ----
  var PKEY = 'kcap_profile_v1';
  function getPf() { try { return JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch (e) { return {}; } }
  function setPf(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} }
  var pf = getPf();
  var F = { who: $('#pfWho'), age: $('#pfAge'), tag: $('#pfTag'), reg: $('#pfReg'), proof: $('#pfProof') };
  if (F.who) { F.who.value = pf.who || ''; F.age.value = pf.age || ''; F.tag.value = pf.tag || '전체'; F.reg.value = pf.reg || 'all'; F.proof.value = pf.proof || ''; }
  var hasPf = function () { return !!(pf.who || pf.age || (pf.tag && pf.tag !== '전체') || (pf.reg && pf.reg !== 'all') || pf.proof); };

  // 공모 1건이 조건에 맞는지 (맞지 않는 이유도 함께)
  function fit(p) {
    var why = [];
    if (pf.who && p.who.indexOf(pf.who) < 0) why.push(pf.who + ' 신청 불가');
    if (pf.age && p.age && +pf.age > p.age) why.push('만 ' + p.age + '세 이하');
    if (pf.tag && pf.tag !== '전체' && p.tags.indexOf('전체') < 0 && p.tags.indexOf(pf.tag) < 0) why.push('분야 다름');
    if (pf.reg && pf.reg !== 'all' && p.reg === '강진' && ['jn', 'gangjin', 'jeonnam'].indexOf(pf.reg) < 0) why.push('강진 지역 사업');
    return why;
  }
  function applyPf() {
    var ok = 0;
    cards.forEach(function (c) {
      var p = byId[c.dataset.id], why = fit(p), m = c.querySelector('.mt');
      c.classList.toggle('fit', hasPf() && !why.length); c.classList.toggle('nofit', hasPf() && why.length > 0);
      c.dataset.fit = why.length ? '' : '1';
      var tags = [];
      if (hasPf() && !why.length) { ok++; tags.push('<span class="bdg on">나에게 맞음</span>'); }
      if (hasPf() && why.length) tags.push('<span class="bdg past">' + why.join(' · ') + '</span>');
      if (p.months.length === 12) tags.push('<span class="bdg new">연중</span>');
      else if (p.months.indexOf(month) > -1) tags.push('<span class="bdg hot">이번 달 접수</span>');
      else if (p.months.length) { var nx = p.months.map(function (x) { return (x - month + 12) % 12; }).sort(function (a, b) { return a - b; })[0]; tags.push('<span class="bdg soon">' + nx + '개월 뒤 접수 예상</span>'); }
      if (p.proof && pf.proof !== 'y') tags.push('<span class="bdg warn">예술활동증명 필요</span>');
      m.innerHTML = tags.join('');
    });
    var out = $('#pfOut'); if (!out) return;
    if (!hasPf()) { out.innerHTML = '조건을 고르면 신청할 수 있는 공모를 먼저 보여 드립니다.'; return; }
    var tip = '';
    if (pf.proof === 'n' || pf.proof === '') tip = ' <a class="tip" href="https://www.kawfartist.kr/" target="_blank" rel="noopener">예술로 · 창작준비금은 예술활동증명이 먼저 필요합니다 → 신청하기 ↗</a>';
    if (pf.age && +pf.age <= 34 && pf.who !== '단체') tip += ' <span class="tip2">만 34세 이하 대상인 「청년예술가도약지원」도 살펴보세요.</span>';
    out.innerHTML = '<b>' + ok + '건</b>이 조건에 맞습니다.' + tip + ' <button type="button" id="pfReset">조건 지우기</button>';
    $('#pfReset').onclick = function () {
      pf = {}; setPf(pf); F.who.value = ''; F.age.value = ''; F.tag.value = '전체'; F.reg.value = 'all'; F.proof.value = ''; $('#pkOnly').checked = false; applyPf(); filt();
      // 실시간 검색 지역도 전국으로 되돌리고 다시 찾는다
      var lr = $('#lsr'); if (lr && lr.value !== 'all') { lr.value = 'all'; lr.dispatchEvent(new Event('change')); }
    };
  }
  Object.keys(F).forEach(function (k) {
    if (!F[k]) return;
    F[k].addEventListener(k === 'age' ? 'input' : 'change', function () {
      pf = { who: F.who.value, age: F.age.value, tag: F.tag.value, reg: F.reg.value, proof: F.proof.value }; setPf(pf);
      if (k === 'reg' && $('#lsr')) $('#lsr').value = F.reg.value;
      if (hasPf()) $('#pkOnly').checked = true;
      applyPf(); filt();
    });
  });

  // ---- 추천 공모 필터 ----
  var q = $('#pkq');
  function filt() {
    var words = (q && q.value || '').trim().split(/\s+/).filter(Boolean), only = $('#pkOnly').checked, now = $('#pkNow').checked, mine = $('#pkMine').checked;
    cards.forEach(function (c) {
      var p = byId[c.dataset.id], k = c.getAttribute('data-k');
      var show = words.every(function (w) { return k.indexOf(w) > -1; }) && (!only || c.dataset.fit === '1') && (!now || p.months.indexOf(month) > -1) && (!mine || K.saved.has('pk:' + p.id));
      c.style.display = show ? '' : 'none';
    });
  }
  if (q) q.addEventListener('input', filt);
  ['#pkOnly', '#pkNow', '#pkMine'].forEach(function (s) { var el = $(s); if (el) el.addEventListener('change', filt); });
  function paintSaved() { cards.forEach(function (c) { var b = c.querySelector('[data-psave]'), on = K.saved.has('pk:' + c.dataset.id); b.classList.toggle('on', on); b.textContent = on ? '♥ 관심' : '♡ 관심'; }); }
  document.addEventListener('click', function (e) {
    var s = e.target.closest('[data-psave]'), h = e.target.closest('[data-pshare]');
    if (s) { var p = byId[s.dataset.psave]; var on = K.saved.toggle({ id: 'pk:' + p.id, type: '공모', title: p.n, sub: p.a + ' · ' + p.w, url: p.u, link: '/support.html#picks' }); K.toast(on ? '관심 목록에 담았습니다' : '관심 목록에서 뺐습니다'); paintSaved(); filt(); }
    if (h) { var p2 = byId[h.dataset.pshare]; K.share(p2.n + ' — ' + p2.a, p2.u); }
  });
  if ($('#pkOnly') && hasPf()) $('#pkOnly').checked = true;
  applyPf(); paintSaved(); filt();

  // ---- 연간 달력: 이번 달 표시 ----
  [].forEach.call(document.querySelectorAll('.yr [data-m="' + month + '"]'), function (td) { td.classList.add('now'); });

  // ---- 정부 · 지자체 실시간 검색 (/api/support) ----
  var form = $('#ls'), out = $('#lsout');
  if (!form) return;
  var src = 'gov24', last = [];
  if (pf.reg && $('#lsr')) $('#lsr').value = pf.reg;
  function pressSrc(cur) { [].forEach.call(document.querySelectorAll('.seg button[data-src]'), function (x) { var on = x === cur; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); }
  pressSrc(document.querySelector('.seg button[data-src].on'));
  [].forEach.call(document.querySelectorAll('.seg button[data-src]'), function (b) {
    b.addEventListener('click', function () { src = b.getAttribute('data-src'); pressSrc(b); run(); });
  });
  function fallback(msg) {
    out.innerHTML = '<div class="lsmsg"><b>' + msg + '</b><p>아래 포털에서 바로 검색하실 수 있습니다.</p><div class="lsfb">' +
      '<a href="https://plus.gov.kr/search/?srhQuery=' + encodeURIComponent($('#lsq').value || '예술') + '" target="_blank" rel="noopener">정부24에서 검색 ↗</a>' +
      '<a href="https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch" target="_blank" rel="noopener">온통청년 ↗</a>' +
      '<a href="https://www.ncas.or.kr" target="_blank" rel="noopener">NCAS ↗</a></div></div>';
  }
  function row(it, i) {
    var b = it.end ? K.badge(null, it.end, 'apply') : null, id = 'gv:' + (it.src || '') + ':' + (it.url || it.title), on = K.saved.has(id);
    return '<article class="lsi"><div class="m">' + (b ? '<span class="bdg ' + b.cls + '">' + b.txt + '</span>' : '') + '<b>' + K.esc(it.org) + '</b>' + (it.orgType ? '<span>' + K.esc(it.orgType) + '</span>' : '') + '</div>' +
      '<h3><a href="' + K.esc(it.url) + '" target="_blank" rel="noopener">' + K.esc(it.title) + '</a></h3>' + (it.summary ? '<p>' + K.esc(it.summary) + '</p>' : '') +
      '<div class="f">' + (it.target ? '<span>대상 · ' + K.esc(it.target) + '</span>' : '') + (it.period ? '<span>신청 · ' + K.esc(it.period) + '</span>' : '') + '</div>' +
      '<div class="ac"><button type="button" class="' + (on ? 'on' : '') + '" data-gsave="' + i + '">' + (on ? '♥ 관심' : '♡ 관심') + '</button>' + (it.end ? '<a href="' + K.esc(K.gcal({ title: '[마감] ' + it.title, start: it.end, end: it.end, link: it.url })) + '" target="_blank" rel="noopener">마감일 캘린더에</a>' : '') + '<button type="button" data-gshare="' + i + '">공유</button></div></article>';
  }
  out.addEventListener('click', function (e) {
    var s = e.target.closest('[data-gsave]'), h = e.target.closest('[data-gshare]');
    if (s) { var it = last[+s.dataset.gsave]; var on = K.saved.toggle({ id: 'gv:' + (it.src || '') + ':' + (it.url || it.title), type: it.src === 'youth' ? '청년정책' : '정부·지자체', title: it.title, sub: it.org, end: it.end, url: it.url }); s.classList.toggle('on', on); s.textContent = on ? '♥ 관심' : '♡ 관심'; K.toast(on ? '관심 목록에 담았습니다' : '관심 목록에서 뺐습니다'); }
    if (h) { var it2 = last[+h.dataset.gshare]; K.share(it2.title, it2.url); }
  });
  function run() {
    var qv = $('#lsq').value.trim(), rv = $('#lsr').value;
    out.innerHTML = '<div class="lsmsg">검색 중…</div>';
    fetch('/api/support?src=' + src + '&region=' + encodeURIComponent(rv) + '&q=' + encodeURIComponent(qv))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.configured) return fallback('실시간 검색을 준비하고 있습니다.');
        if (!j.ok) return fallback('공공 API 응답이 늦어지고 있습니다.');
        var t = K.today();
        last = j.items.filter(function (it) { return !it.end || it.end >= t; }) // 이미 마감된 사업은 뺀다
          .sort(function (a, b) { return (a.end || '9999').localeCompare(b.end || '9999'); });
        if (!last.length) return fallback('조건에 맞는 사업이 없습니다. 검색어나 지역을 바꿔 보세요.');
        out.innerHTML = '<div class="lscount">' + last.length + '건 · 마감이 가까운 순</div>' + last.map(row).join('');
      })
      .catch(function () { fallback('지금은 실시간 검색을 이용할 수 없습니다.'); });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
  $('#lsr').addEventListener('change', run);
  run();
})();
