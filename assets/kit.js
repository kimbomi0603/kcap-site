/* KCAP 정보마당 공통 도구: 관심 목록 · D-day · 캘린더 담기 · 공유 */
(function (w) {
  var K = w.KCAP = w.KCAP || {};
  K.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // 날짜 (브라우저 현지 날짜 기준, YYYY-MM-DD 문자열)
  K.today = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  K.addDays = function (ymd, n) { var d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  K.diff = function (a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); };
  K.md = function (ymd) { if (!ymd) return ''; var p = ymd.split('-'); return +p[1] + '.' + +p[2]; };
  K.range = function (s, e) { if (!s && !e) return ''; if (s === e || !e) return K.md(s); var y = (s || '').slice(0, 4) !== (e || '').slice(0, 4); return (y ? s.slice(0, 4) + '.' : '') + K.md(s) + ' – ' + (y ? e.slice(0, 4) + '.' : '') + K.md(e); };
  // 상태 배지: 곧 시작 / 오늘 시작 / 진행 중 / 마감 D-n
  K.badge = function (start, end, kind) {
    var t = K.today();
    if (end && end < t) return { cls: 'past', txt: kind === 'apply' ? '마감' : '종료' };
    if (start && start > t) { var s = K.diff(t, start); return { cls: 'soon', txt: s === 1 ? '내일 시작' : s + '일 뒤 시작' }; }
    if (end) { var n = K.diff(t, end); if (n === 0) return { cls: 'hot', txt: kind === 'apply' ? '오늘 마감' : '오늘 종료' }; if (n <= 7) return { cls: 'hot', txt: (kind === 'apply' ? '마감 ' : '종료 ') + 'D-' + n }; }
    if (start === t) return { cls: 'new', txt: '오늘 시작' };
    return { cls: 'on', txt: kind === 'apply' ? '접수 중' : '진행 중' };
  };

  // 관심 목록 (이 브라우저에만 저장 · 로그인 없음)
  var KEY = 'kcap_saved_v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function store(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  K.saved = {
    all: load,
    has: function (id) { return load().some(function (x) { return x.id === id; }); },
    toggle: function (item) {
      var a = load(), i = -1;
      a.forEach(function (x, k) { if (x.id === item.id) i = k; });
      if (i > -1) a.splice(i, 1); else a.unshift({ id: item.id, type: item.type, title: item.title, sub: item.sub || '', start: item.start || '', end: item.end || '', url: item.url || '', link: item.link || '' });
      store(a.slice(0, 200));
      document.dispatchEvent(new CustomEvent('kcap:saved'));
      return i === -1;
    }
  };

  // 캘린더 담기
  function compact(ymd) { return (ymd || '').replace(/-/g, ''); }
  K.gcal = function (it) {
    var s = compact(it.start || it.end), e = compact(K.addDays(it.end || it.start, 1));
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(it.title) + '&dates=' + s + '/' + e +
      '&details=' + encodeURIComponent((it.sub ? it.sub + '\n' : '') + (it.link || it.url || location.href)) + '&location=' + encodeURIComponent(it.place || '');
  };
  function vevent(it) {
    var s = compact(it.start || it.end), e = compact(K.addDays(it.end || it.start, 1));
    var esc = function (x) { return String(x || '').replace(/[\\,;]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); };
    return ['BEGIN:VEVENT', 'UID:' + String(it.id || Date.now()).replace(/[^\w-]/g, '') + '@kcap', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART;VALUE=DATE:' + s, 'DTEND;VALUE=DATE:' + e, 'SUMMARY:' + esc(it.title), 'LOCATION:' + esc(it.place), 'DESCRIPTION:' + esc((it.sub ? it.sub + ' ' : '') + (it.link || it.url || '')), 'END:VEVENT'].join('\r\n');
  }
  // 여러 건을 파일 하나로 (휴대폰 · PC 캘린더에서 열면 한 번에 추가)
  K.ics = function (list, name) {
    list = [].concat(list);
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KCAP//info//KO', 'CALSCALE:GREGORIAN'].concat(list.map(vevent), ['END:VCALENDAR']).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    a.download = (name || list[0].title || 'kcap').slice(0, 40).replace(/[\\/:*?"<>|]/g, '') + '.ics'; document.body.appendChild(a); a.click(); a.remove();
  };

  // 공유 (휴대폰은 공유창 — 카카오톡 포함, PC는 링크 복사)
  K.share = function (title, url) {
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
    var done = function () { K.toast('링크를 복사했습니다'); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('링크를 복사하세요', url); });
    else prompt('링크를 복사하세요', url);
  };
  K.toast = function (msg) {
    var t = document.querySelector('.kc-toast'); if (!t) { t = document.createElement('div'); t.className = 'kc-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 1800);
  };
  // 두 좌표 사이 거리(km)
  K.km = function (a, b, c, d) { var R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r; var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2); return 2 * R * Math.asin(Math.sqrt(h)); };
})(window);
