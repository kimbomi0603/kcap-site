/* 공모 데이터(data/calls.json) 공통 — 홈 마감 대시보드 · 공모 목록(calls.html) · 공모 상세(call.html)
   데이터: 협회 추천 공모(data/picks.csv → source 'kcap') + 주요 기관 자동 수집. 매일 05:30 GitHub Actions 가 갱신한다. */
(function (w) {
  var K = w.KCAP = w.KCAP || {}, $ = function (s) { return document.querySelector(s); };
  var REG_NAME = { all: '', seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '경기', gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북', jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주', jn: '광주', gangjin: '전남' };
  var SRC = { kcap: '협회 추천', arko: '한국문화예술위원회', ncas: '국가문화예술지원시스템', kawf: '한국예술인복지재단', gokams: '예술경영지원센터', arte: '한국문화예술교육진흥원', kocca: '한국콘텐츠진흥원' };
  var ready, byId = {};

  K.calls = {
    load: function () {
      if (!ready) ready = fetch('data/calls.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return { updated: '', count: 0, items: [] }; });
      return ready;
    },
    profile: function () { try { return JSON.parse(localStorage.getItem('kcap_profile_v1') || '{}'); } catch (e) { return {}; } },
    regName: function (k) { return REG_NAME[k] || ''; },
    srcName: function (k) { return SRC[k] || k; },
    // 내 조건(지원사업 찾기에서 저장)에 맞는가. 조건이 비어 있으면 전부 맞는다.
    fits: function (it, pf) {
      pf = pf || K.calls.profile();
      if (pf.who && it.who && it.who.length && it.who.indexOf(pf.who) < 0) return false;
      if (pf.age && it.age && +pf.age > it.age) return false;
      if (pf.tag && pf.tag !== '전체' && it.tags && it.tags.length && it.tags.indexOf('전체') < 0 && it.tags.indexOf(pf.tag) < 0) return false;
      var rn = REG_NAME[pf.reg];
      if (rn && it.reg && it.reg !== '전국' && it.reg !== rn) return false;
      return true;
    },
    open: function (it, t) { t = t || K.today(); return it.kind !== '공지' && (!it.end || it.end >= t) && (!it.start || it.start <= t || K.diff(t, it.start) <= 60); },
    // 마감 배지. 마감 미상이면 접수시기(매년 n월)로
    badge: function (it) {
      var t = K.today();
      if (it.end) return K.badge(it.start, it.end, 'apply');
      if (it.months && it.months.length) {
        var m = new Date().getMonth() + 1;
        if (it.months.length === 12) return { cls: 'on', txt: '연중 접수' };
        return it.months.indexOf(m) > -1 ? { cls: 'hot', txt: '이번 달 접수' } : { cls: 'soon', txt: '매년 ' + it.months[0] + '월' + (it.months.length > 1 ? '–' + it.months[it.months.length - 1] + '월' : '') };
      }
      return { cls: 'on', txt: '공고 확인' };
    },
    row: function (it) {
      var b = K.calls.badge(it), meta = [it.org, it.end ? '마감 ' + it.end.replace(/-/g, '.') : (it.when || ''), it.reg && it.reg !== '전국' ? it.reg : ''].filter(Boolean).join(' · ');
      var on = !!(K.saved && K.saved.has(it.id));
      byId[it.id] = it;
      // 줄 전체는 상세로 가는 링크, 오른쪽 ♡는 관심 목록 담기 (링크 밖에 두어 눌러도 이동하지 않는다)
      return '<div class="crow-w"><a class="crow' + (it.source === 'kcap' ? ' pick' : '') + '" data-tag="' + K.esc((it.tags || [])[0] || '전체') + '" href="call.html?id=' + encodeURIComponent(it.id) + '">' +
        '<span class="bdg ' + b.cls + '">' + K.esc(b.txt) + '</span>' + (it.source === 'kcap' ? '<span class="bdg new">협회 추천</span>' : '') +
        '<b>' + K.esc(it.title) + '</b><small>' + K.esc(meta) + '</small></a>' +
        '<button type="button" class="crow-sv' + (on ? ' on' : '') + '" data-csave="' + K.esc(it.id) + '" aria-pressed="' + on + '" aria-label="관심 목록에 담기" title="관심 목록에 담기">' + (on ? '♥' : '♡') + '</button></div>';
    },
    // 대시보드 숫자: 접수 중 · 이번 주 마감 · 다음 주 마감 · 내 조건
    stats: function (items, pf) {
      var t = K.today(), w1 = K.addDays(t, 7), w2 = K.addDays(t, 14), o = { open: 0, week: 0, next: 0, mine: 0 };
      items.forEach(function (it) {
        if (!K.calls.open(it, t)) return;
        o.open++;
        if (it.end && it.end <= w1) o.week++; else if (it.end && it.end <= w2) o.next++;
        if (K.calls.fits(it, pf)) o.mine++;
      });
      return o;
    },
    sortByEnd: function (a, b) { if (a.end && b.end) return a.end < b.end ? -1 : 1; if (a.end) return -1; if (b.end) return 1; return (a.source === 'kcap') === (b.source === 'kcap') ? 0 : a.source === 'kcap' ? -1 : 1; },
    updatedText: function (iso) { if (!iso) return ''; var d = new Date(iso); return d.getMonth() + 1 + '.' + d.getDate() + '. ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' 갱신'; }
  };

  // ---- 홈 마감 대시보드 ----
  var dash = $('#dash');
  if (dash) K.calls.load().then(function (d) {
    var pf = K.calls.profile(), hasPf = !!(pf.who || pf.age || (pf.tag && pf.tag !== '전체') || (pf.reg && pf.reg !== 'all'));
    var t = K.today(), open = d.items.filter(function (it) { return K.calls.open(it, t); });
    var s = K.calls.stats(d.items, pf);
    var nums = [['접수 중', s.open, 'calls.html'], ['이번 주 마감', s.week, 'calls.html?w=week'], ['다음 주 마감', s.next, 'calls.html?w=next'], [hasPf ? '내 조건에 맞는' : '조건 저장하고 내 것만', hasPf ? s.mine : '→', hasPf ? 'calls.html?mine=1' : 'support.html#picks']];
    $('#dashNums').innerHTML = nums.map(function (n) { return '<a href="' + n[2] + '"><b>' + n[1] + (typeof n[1] === 'number' ? '<small>건</small>' : '') + '</b><span>' + n[0] + '</span></a>'; }).join('');
    var list = (hasPf ? open.filter(function (it) { return K.calls.fits(it, pf); }) : open).filter(function (it) { return it.end; }).sort(K.calls.sortByEnd).slice(0, 8);
    if (list.length < 4) list = list.concat(open.filter(function (it) { return it.end && list.indexOf(it) < 0; }).sort(K.calls.sortByEnd).slice(0, 8 - list.length));
    $('#dashList').innerHTML = list.length ? list.map(K.calls.row).join('') : '<p class="none">접수 중인 공모를 불러오지 못했습니다. <a href="support.html">지원사업 찾기 →</a></p>';
    var u = $('#dashUpd'); if (u) u.textContent = K.calls.updatedText(d.updated);
    if (hasPf) { var h = $('#dashHint'); if (h) h.innerHTML = '내 조건(' + [pf.who, pf.age && '만 ' + pf.age + '세', pf.tag !== '전체' && pf.tag, REG_NAME[pf.reg]].filter(Boolean).join(' · ') + ') 기준. <a href="support.html#picks">조건 바꾸기</a>'; }
  });

  // ---- 공모 목록 (calls.html) ----
  var cl = $('#callList');
  if (cl) {
    var P = new URLSearchParams(location.search), pf = K.calls.profile();
    var S = { w: P.get('w') || 'open', mine: P.get('mine') === '1', q: P.get('q') || '', src: P.get('src') || '', tag: P.get('tag') || '', reg: P.get('reg') || '' };
    var all = [];
    function apply() {
      var t = K.today(), w1 = K.addDays(t, 7), w2 = K.addDays(t, 14), q = S.q.toLowerCase();
      var a = all.filter(function (it) {
        if (S.w === 'open' && !K.calls.open(it, t)) return false;
        if (S.w === 'week' && !(it.end && it.end >= t && it.end <= w1 && it.kind !== '공지')) return false;
        if (S.w === 'next' && !(it.end && it.end > w1 && it.end <= w2 && it.kind !== '공지')) return false;
        if (S.w === 'pick' && it.source !== 'kcap') return false;
        if (S.w === 'notice' && it.kind !== '공지') return false;
        if (S.mine && !K.calls.fits(it, pf)) return false;
        if (S.src && it.source !== S.src) return false;
        if (S.tag && !(it.tags || []).some(function (x) { return x === S.tag || x === '전체'; })) return false;
        if (S.reg && it.reg !== '전국' && it.reg !== S.reg) return false;
        if (q && (it.title + ' ' + it.org + ' ' + it.summary).toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).sort(K.calls.sortByEnd);
      cl.innerHTML = a.length ? a.map(K.calls.row).join('') : '<p class="none">조건에 맞는 공모가 없습니다. 조건을 넓혀 보세요.</p>';
      $('#callMeta').textContent = a.length + '건' + (S.mine ? ' · 내 조건' : '');
      [].forEach.call(document.querySelectorAll('#cw button'), function (b) { var on = b.dataset.w === S.w; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      var mine = $('#cmine'); if (mine) mine.checked = S.mine;
      var u = new URLSearchParams(); if (S.w !== 'open') u.set('w', S.w); if (S.mine) u.set('mine', '1'); if (S.q) u.set('q', S.q); if (S.src) u.set('src', S.src); if (S.tag) u.set('tag', S.tag); if (S.reg) u.set('reg', S.reg);
      history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
    }
    K.calls.load().then(function (d) {
      all = d.items; var u = $('#callUpd'); if (u) u.textContent = K.calls.updatedText(d.updated);
      var srcSel = $('#csrc'); if (srcSel) { var keys = {}; all.forEach(function (it) { keys[it.source] = 1; }); srcSel.innerHTML = '<option value="">모든 기관</option>' + Object.keys(keys).map(function (k) { return '<option value="' + k + '"' + (k === S.src ? ' selected' : '') + '>' + K.esc(K.calls.srcName(k)) + '</option>'; }).join(''); }
      var st = $('#cstatus'); if (st) fetch('data/collect-status.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { st.innerHTML = (j.sources || []).map(function (s) { return '<span class="' + (s.ok ? 'ok' : s.stale ? 'stale' : 'bad') + '"' + (s.stale ? ' title="오늘 수집에 실패해 직전 자료를 그대로 보여 줍니다"' : '') + '>' + K.esc(s.name) + ' ' + (s.ok ? s.count + '건' : s.stale ? '직전 자료 ' + s.count + '건' : '실패') + '</span>'; }).join(''); }).catch(function () {});
      if ($('#cq')) $('#cq').value = S.q; if ($('#ctag')) $('#ctag').value = S.tag; if ($('#creg')) $('#creg').value = S.reg;
      apply();
    });
    document.addEventListener('click', function (e) { var b = e.target.closest('#cw button'); if (!b) return; S.w = b.dataset.w; apply(); });
    if ($('#cmine')) $('#cmine').addEventListener('change', function () { S.mine = this.checked; apply(); });
    if ($('#cq')) $('#cq').addEventListener('input', function () { S.q = this.value.trim(); apply(); });
    ['csrc', 'ctag', 'creg'].forEach(function (id) { var el = $('#' + id); if (el) el.addEventListener('change', function () { S[id.slice(1)] = el.value; apply(); }); });
  }

  // ---- 공모 상세 (call.html?id=) ----
  var cd = $('#callDetail');
  if (cd) K.calls.load().then(function (d) {
    var id = new URLSearchParams(location.search).get('id'), it = d.items.filter(function (x) { return x.id === id; })[0];
    if (!it) { cd.innerHTML = '<p class="none">이 공모를 찾을 수 없습니다. 접수가 끝나 목록에서 내려갔을 수 있습니다. <a href="calls.html">공모 전체 →</a></p>'; return; }
    document.title = it.title + ' | (사)한국청년문화예술인협회';
    var b = K.calls.badge(it), t = K.today(), left = it.end && it.end >= t ? K.diff(t, it.end) : -1, dday = left === 0 ? 'D-day' : left > 0 ? 'D-' + left : '';
    var dot = function (d) { return (d || '').replace(/-/g, '.'); };
    var sub = it.org + (it.end ? ' · 마감 ' + dot(it.end) : '');
    var saved = K.saved.has(it.id);
    cd.innerHTML = '<div class="cd-top"><span class="bdg ' + b.cls + '">' + K.esc(b.txt) + '</span>' + (it.source === 'kcap' ? '<span class="bdg new">협회 추천</span>' : '<span class="bdg">자동 수집 · ' + K.esc(K.calls.srcName(it.source)) + '</span>') + '</div>' +
      '<h1 class="cd-title">' + K.esc(it.title) + '</h1>' +
      '<dl class="dl cd-dl"><dt>주관</dt><dd>' + K.esc(it.org || '-') + '</dd>' +
      '<dt>접수</dt><dd>' + (it.start || it.end ? K.esc(dot(it.start) + (it.end ? ' ~ ' + dot(it.end) : '')) + (dday ? ' <b class="cd-dday">' + dday + '</b>' : '') : K.esc(it.when || '공고 확인')) + '</dd>' +
      '<dt>대상</dt><dd>' + K.esc((it.who && it.who.length ? it.who.join(' · ') : '공고 확인') + (it.age ? ' (만 ' + it.age + '세 이하)' : '')) + '</dd>' +
      '<dt>분야</dt><dd>' + K.esc((it.tags || []).join(' · ') || '전체') + '</dd><dt>지역</dt><dd>' + K.esc(it.reg || '전국') + '</dd></dl>' +
      (it.summary ? '<p class="cd-sum">' + K.esc(it.summary) + '</p>' : '') +
      '<div class="cd-ac"><a class="btn red" href="' + K.esc(it.url) + '" target="_blank" rel="noopener">공고 원문 보기 <span class="ar">↗</span></a>' +
      '<button type="button" class="btn line" id="cdSave">' + (saved ? '♥ 관심 목록에 있음' : '♡ 관심 목록에 담기') + '</button>' +
      (it.end ? '<a class="btn line" id="cdCal" href="#">캘린더에 마감 담기</a>' : '') + '<button type="button" class="btn line" id="cdShare">공유</button></div>' +
      '<p class="note">' + (it.source === 'kcap' ? '협회가 확인한 공모입니다. ' : '기관 게시판에서 자동으로 수집한 공고라 대상·기간이 실제와 다를 수 있습니다. ') + '신청 전에 반드시 원문을 확인하세요.</p>';
    $('#cdSave').onclick = function () { var on = K.saved.toggle({ id: it.id, type: '공모', title: it.title, sub: sub, start: it.start, end: it.end, url: it.url, link: 'call.html?id=' + encodeURIComponent(it.id) }); this.textContent = on ? '♥ 관심 목록에 있음' : '♡ 관심 목록에 담기'; K.toast(on ? '관심 목록에 담았습니다' : '관심 목록에서 뺐습니다'); };
    if ($('#cdCal')) $('#cdCal').onclick = function (e) { e.preventDefault(); K.ics({ id: it.id, title: '[마감] ' + it.title, start: it.end, end: it.end, sub: sub, link: it.url }, it.title); };
    $('#cdShare').onclick = function () { K.share(it.title, location.href); };
    // 비슷한 공모
    var rel = d.items.filter(function (x) { return x.id !== it.id && K.calls.open(x) && (x.tags || []).some(function (g) { return (it.tags || []).indexOf(g) > -1 && g !== '전체'; }); }).sort(K.calls.sortByEnd).slice(0, 5);
    var r = $('#callRelated'); if (r) r.innerHTML = rel.length ? rel.map(K.calls.row).join('') : '<p class="none">비슷한 분야의 접수 중 공모가 없습니다.</p>';
  });

  // 공모 줄의 ♡: 관심 목록(이 브라우저 localStorage)에 담고 빼기. 정보마당 「관심 목록」에서 모아 보고 캘린더(.ics)로 옮길 수 있다.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-csave]'); if (!btn) return;
    e.preventDefault();
    var it = byId[btn.getAttribute('data-csave')]; if (!it || !K.saved) return;
    var on = K.saved.toggle({ id: it.id, type: '공모', title: it.title, sub: it.org + (it.end ? ' · 마감 ' + it.end.replace(/-/g, '.') : ''), start: it.start, end: it.end, url: it.url, link: 'call.html?id=' + encodeURIComponent(it.id) });
    [].forEach.call(document.querySelectorAll('[data-csave]'), function (x) {
      if (x.getAttribute('data-csave') !== it.id) return;
      x.classList.toggle('on', on); x.textContent = on ? '♥' : '♡'; x.setAttribute('aria-pressed', on);
    });
    if (K.toast) K.toast(on ? '관심 목록에 담았습니다' : '관심 목록에서 뺐습니다');
  });
})(window);
