'use strict';
/**
 * 알림 구독 로컬 테스트 — 실제 KV·Resend 없이 fetch 를 가로채 메모리 저장소와 가짜 발송기로 검사한다.
 *   node scripts/test-alerts.js
 * 검사 항목: 환경변수 없음 → configured:false / 신청 저장·확인 메일 / confirm 으로 confirmed 전환 /
 *           unsubscribe 삭제 / notify 매칭 규칙(주체·나이·분야·지역·마감·신규) / 같은 날 중복 발송 방지 / 속도 제한
 */
const assert = require('assert');
const path = require('path');

// ---------------------------------------------------------------------------
// 가짜 Upstash REST + 가짜 Resend
// ---------------------------------------------------------------------------
const store = new Map();   // key → string | Set
const mails = [];          // 보낸 메일
function exec(cmd) {
  const [c, ...a] = cmd.map(String);
  switch (c.toUpperCase()) {
    case 'GET': return store.has(a[0]) && typeof store.get(a[0]) === 'string' ? store.get(a[0]) : null;
    case 'SET': store.set(a[0], a[1]); return 'OK';
    case 'DEL': { const n = store.delete(a[0]) ? 1 : 0; return n; }
    case 'INCR': { const v = (parseInt(store.get(a[0]) || '0', 10) + 1); store.set(a[0], String(v)); return v; }
    case 'EXPIRE': return 1;
    case 'SADD': { const s = store.get(a[0]) instanceof Set ? store.get(a[0]) : new Set(); s.add(a[1]); store.set(a[0], s); return 1; }
    case 'SREM': { const s = store.get(a[0]); return s instanceof Set && s.delete(a[1]) ? 1 : 0; }
    case 'SMEMBERS': { const s = store.get(a[0]); return s instanceof Set ? [...s] : []; }
    default: throw new Error('unsupported ' + c);
  }
}
const KV_URL = 'https://fake-kv.test';
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  const body = opt.body ? JSON.parse(opt.body) : null;
  if (u.startsWith(KV_URL)) {
    assert.strictEqual(opt.headers.Authorization, 'Bearer fake-token', 'KV 토큰 헤더');
    if (u.endsWith('/pipeline')) return new Response(JSON.stringify(body.map((c) => ({ result: exec(c) }))), { status: 200 });
    return new Response(JSON.stringify({ result: exec(body) }), { status: 200 });
  }
  if (u === 'https://api.resend.com/emails') {
    assert.strictEqual(opt.headers.Authorization, 'Bearer fake-resend', 'Resend 키 헤더');
    if (body.to[0] === 'bounce@example.com') return new Response(JSON.stringify({ message: 'fail' }), { status: 422 });
    mails.push(body); return new Response(JSON.stringify({ id: 'm' + mails.length }), { status: 200 });
  }
  throw new Error('unexpected fetch ' + u);
};

// ---------------------------------------------------------------------------
// 가짜 req/res
// ---------------------------------------------------------------------------
function mkRes() {
  const r = { headers: {}, code: 200, body: '' };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.json = () => JSON.parse(r.body);
  return r;
}
async function call(handler, { method = 'GET', query = {}, body, headers = {}, ip = '127.0.0.1' } = {}) {
  const res = mkRes();
  await handler({ method, query, body, headers: { 'x-forwarded-for': ip, ...headers }, socket: { remoteAddress: ip } }, res);
  return res;
}
function fresh(mod) { const p = require.resolve(mod); delete require.cache[p]; return require(p); }
function setEnv(on) {
  if (on) { process.env.KV_REST_API_URL = KV_URL; process.env.KV_REST_API_TOKEN = 'fake-token'; process.env.RESEND_API_KEY = 'fake-resend'; }
  else { delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; delete process.env.RESEND_API_KEY; }
}
process.env.SITE_URL = 'https://kcap.test';
process.env.CRON_SECRET = 'cron-secret';

// ---------------------------------------------------------------------------
// 표본 데이터 — 오늘(KST) 기준 상대 날짜
// ---------------------------------------------------------------------------
const NOW = Date.now();
const today = new Date(NOW + 9 * 3600 * 1000).toISOString().slice(0, 10);
const d = (n) => { const x = new Date(today + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const item = (o) => ({ id: o.id, title: o.id + ' 제목', org: '기관', url: 'https://x.test/' + o.id, posted: '', start: '', end: '', who: [], age: null, tags: ['전체'], reg: '전국', summary: '', source: 'gokams', kind: '공모', ...o });
const CALLS = { updated: '', count: 6, items: [
  item({ id: 'A-due-all', end: d(3), posted: d(-20) }),                                   // 3일 뒤 마감, 전국, 전체 — 모두에게 '마감 임박'
  item({ id: 'B-new-seoul-visual', end: d(30), posted: d(-2), tags: ['시각'], reg: '서울' }), // 새로 올라온, 서울, 시각
  item({ id: 'C-team-only', end: d(5), who: ['단체'], posted: d(-1) }),                     // 단체만
  item({ id: 'D-age34', end: d(2), age: 34, tags: ['공연'], posted: d(-1) }),                // 만 34세 이하, 공연
  item({ id: 'E-old', end: d(40), posted: d(-30) }),                                         // 오래된 것, 마감도 멀다 → 아무에게도 안 감
  item({ id: 'F-expired', end: d(-1), posted: d(-1) }),                                      // 이미 마감
  item({ id: 'G-notice', end: d(1), kind: '공지' }),                                          // 공지는 제외
] };

(async () => {
  let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
  // ---- 1) 환경변수 없음 ----
  setEnv(false);
  let sub = fresh('../api/subscribe.js');
  let r = await call(sub, { method: 'POST', body: { email: 'a@b.co' } });
  assert.deepStrictEqual(r.json(), { ok: false, configured: false, reason: 'kv' }); ok('KV 없음 → configured:false reason:kv');
  process.env.KV_REST_API_URL = KV_URL; process.env.KV_REST_API_TOKEN = 'fake-token';
  r = await call(sub, { method: 'POST', body: { email: 'a@b.co' } });
  assert.deepStrictEqual(r.json(), { ok: false, configured: false, reason: 'resend' }); ok('Resend 없음 → configured:false reason:resend');
  let nf = fresh('../api/notify.js');
  r = await call(nf, { headers: { authorization: 'Bearer cron-secret' } });
  assert.strictEqual(r.json().configured, false); ok('notify: Resend 없음 → configured:false');

  // ---- 2) 신청 ----
  setEnv(true);
  sub = fresh('../api/subscribe.js'); nf = fresh('../api/notify.js');
  r = await call(sub, { method: 'POST', body: { email: 'not-an-email' } });
  assert.strictEqual(r.code, 400); ok('잘못된 이메일 → 400');
  r = await call(sub, { method: 'POST', body: { email: 'x@y.co', reg: 'mars' } });
  assert.strictEqual(r.code, 400); ok('잘못된 지역 → 400');

  const SUBS = [
    { email: 'all@example.com', who: '', age: null, tags: [], reg: 'all' },                 // 조건 없음
    { email: 'seoul@example.com', who: '개인', age: 28, tags: ['시각'], reg: 'seoul' },      // 서울·시각·개인·28
    { email: 'busan@example.com', who: '개인', age: 40, tags: ['공연'], reg: 'busan' },      // 부산·공연·40 (D 는 나이 초과)
    { email: 'team@example.com', who: '단체', age: null, tags: ['문학'], reg: 'jeju' },       // 단체·문학·제주
    { email: 'young@example.com', who: '', age: 20, tags: ['공연', '시각'], reg: 'all' },     // 20세, 공연+시각
    { email: 'never@example.com', who: '개인', age: null, tags: ['교육'], reg: 'jeonnam' },   // 확인 안 함
  ];
  for (const s of SUBS) { r = await call(sub, { method: 'POST', body: s, ip: '10.0.0.' + SUBS.indexOf(s) }); assert.deepStrictEqual(r.json(), { ok: true, sent: true }, s.email); }
  ok('신청 6건 저장 + 확인 메일 6통');
  assert.strictEqual(mails.length, 6);
  assert.ok(mails[0].html.includes('/api/subscribe?confirm='), '확인 링크 포함');
  const subsSet = store.get('subs'); assert.strictEqual(subsSet.size, 6); ok('SADD subs = 6');
  let stored = JSON.parse(store.get([...subsSet][0])); assert.strictEqual(stored.confirmed, false); assert.strictEqual(stored.email, 'all@example.com'); ok('저장값 confirmed:false');

  // 발송 실패 → 저장 되돌림
  r = await call(sub, { method: 'POST', body: { email: 'bounce@example.com' } });
  assert.strictEqual(r.code, 502); assert.strictEqual(subsSet.size, 6); ok('메일 발송 실패 → 502, 저장 취소');

  // 속도 제한 (같은 IP 5회 초과) — 6번째부터 429, 저장도 되지 않는다
  for (let i = 0; i < 5; i++) { r = await call(sub, { method: 'POST', body: { email: 'rl' + i + '@example.com' }, ip: '10.9.9.9' }); assert.strictEqual(r.code, 200); }
  r = await call(sub, { method: 'POST', body: { email: 'rl5@example.com' }, ip: '10.9.9.9' });
  assert.strictEqual(r.code, 429); assert.strictEqual(subsSet.size, 11); ok('IP 당 분당 5회 초과 → 429');
  for (let i = 0; i < 5; i++) { const k = [...subsSet].find((key) => JSON.parse(store.get(key)).email === 'rl' + i + '@example.com'); store.delete(k); subsSet.delete(k); }
  mails.splice(6);

  // ---- 3) 확인 (confirm) ----
  const linkOf = (email) => { const m = mails.find((x) => x.to[0] === email).html.match(/confirm=([0-9a-f]+)&k=(sub:[0-9a-f]+)/); return { confirm: m[1], k: m[2] }; };
  r = await call(sub, { query: { confirm: 'deadbeef'.repeat(4), k: linkOf('all@example.com').k } });
  assert.strictEqual(r.code, 404); ok('틀린 토큰 → 404');
  for (const s of SUBS.slice(0, 5)) { r = await call(sub, { query: linkOf(s.email) }); assert.strictEqual(r.code, 200); assert.ok(r.body.includes('구독이 확인되었습니다')); }
  stored = JSON.parse(store.get(linkOf('all@example.com').k)); assert.strictEqual(stored.confirmed, true); ok('confirm → confirmed:true, 안내 페이지 (5명 확인, 1명 미확인)');

  // ---- 4) notify ----
  r = await call(nf, {}); assert.strictEqual(r.code, 401); ok('notify 인증 없음 → 401');
  r = await call(nf, { headers: { authorization: 'Bearer wrong' } }); assert.strictEqual(r.code, 401); ok('notify 틀린 비밀 → 401');

  mails.length = 0;
  const out = await nf.internals.run({ now: NOW, calls: JSON.parse(JSON.stringify(CALLS)) });
  console.log('   notify 결과:', JSON.stringify(out));
  assert.strictEqual(out.subs, 5, '확인된 구독자 5');
  const byTo = {}; mails.forEach((m) => { byTo[m.to[0]] = m; });
  const ids = (email) => { const m = byTo[email]; if (!m) return []; return ['A-due-all', 'B-new-seoul-visual', 'C-team-only', 'D-age34', 'E-old', 'F-expired', 'G-notice'].filter((id) => m.html.includes('call.html?id=' + id)); };
  const sect = (email, id) => { const h = byTo[email].html; const i = h.indexOf('새로 올라온 공모'); const j = h.indexOf('call.html?id=' + id); return j < i ? 'due' : 'fresh'; };

  // 첫 실행: seen 키가 없었으므로 posted 기준으로만 신규 판단 (E-old 는 신규 아님)
  assert.deepStrictEqual(ids('all@example.com'), ['A-due-all', 'B-new-seoul-visual', 'C-team-only', 'D-age34']); ok('조건 없음 → 마감·신규 4건 (E 오래됨·F 마감·G 공지 제외)');
  assert.strictEqual(sect('all@example.com', 'A-due-all'), 'due'); assert.strictEqual(sect('all@example.com', 'B-new-seoul-visual'), 'fresh'); ok('A 는 마감 임박, B 는 새로 올라온 구역');
  assert.deepStrictEqual(ids('seoul@example.com'), ['A-due-all', 'B-new-seoul-visual']); ok('서울·시각·개인·28 → A, B (C 단체만·D 공연 제외)');
  assert.deepStrictEqual(ids('busan@example.com'), ['A-due-all']); ok('부산·공연·40 → A 만 (D 는 만 34세 이하, B 는 서울)');
  assert.deepStrictEqual(ids('team@example.com'), ['A-due-all', 'C-team-only']); ok('단체·문학·제주 → A, C (전국 공모는 지역 무관, 전체 태그 통과)');
  assert.deepStrictEqual(ids('young@example.com'), ['A-due-all', 'B-new-seoul-visual', 'C-team-only', 'D-age34']); ok('20세·주체 미지정·공연+시각 → A, B, C, D');
  assert.ok(!byTo['never@example.com'], '미확인 구독자에게는 안 감'); ok('미확인 구독자 제외');
  assert.strictEqual(out.sent, 5); assert.strictEqual(out.skipped, 0);
  assert.ok(byTo['all@example.com'].html.includes('/api/subscribe?unsubscribe='), '수신 거부 링크'); ok('메일에 수신 거부 링크');
  assert.ok(byTo['all@example.com'].subject.includes('마감 임박 3건 · 새 공모 1건'), byTo['all@example.com'].subject); ok('제목에 건수');
  assert.ok(store.has('seen:A-due-all') && store.has('seen:E-old')); ok('seen:<id> 처음 본 날짜 기록');

  // 같은 날 재실행 → 전부 건너뜀
  mails.length = 0;
  const out2 = await nf.internals.run({ now: NOW, calls: JSON.parse(JSON.stringify(CALLS)) });
  assert.strictEqual(out2.sent, 0); assert.strictEqual(out2.skipped, 5); assert.strictEqual(mails.length, 0); ok('같은 날 재실행 → sent 0, skipped 5 (sent:<key>:<날짜>)');

  // 다음 날 + 아무 조건에도 안 맞는 항목만 남으면 발송 없음
  const NOW2 = NOW + 86400000;
  for (const k of [...store.keys()]) if (k.startsWith('sent:')) store.delete(k);
  store.set('seen:H-far', d(-30)); // 오래전에 이미 본 항목
  const only = { items: [item({ id: 'H-far', end: d(60), posted: d(-30) })] };
  const out3 = await nf.internals.run({ now: NOW2, calls: only });
  assert.strictEqual(out3.sent, 0); assert.strictEqual(out3.skipped, 5); ok('보낼 항목 없음(오래전 본 항목, 마감 멀음) → 발송 없음');

  // 두 번째 실행부터는 처음 본 항목이 posted 없이도 '신규'로 잡힌다
  const first = { items: [item({ id: 'I-first-seen', end: d(60), posted: '' })] };
  mails.length = 0;
  const out4 = await nf.internals.run({ now: NOW2, calls: first });
  assert.strictEqual(out4.sent, 5); assert.ok(mails[0].html.includes('I-first-seen')); ok('posted 없는 새 항목 → seen 기준으로 신규 판단');

  // ---- 5) 수신 중단 ----
  const un = byTo['all@example.com'].html.match(/unsubscribe=([0-9a-f]+)&k=(sub:[0-9a-f]+)/);
  r = await call(sub, { query: { unsubscribe: un[1], k: un[2] } });
  assert.strictEqual(r.code, 200); assert.ok(r.body.includes('수신을 중단했습니다')); assert.ok(!store.has(un[2])); assert.strictEqual(subsSet.size, 5); ok('unsubscribe → 삭제 + subs 에서 제거 + 안내 페이지');

  // 비밀값이 응답에 새지 않는지
  assert.ok(!JSON.stringify(mails).includes('fake-resend') && !JSON.stringify(mails).includes('fake-token')); ok('메일 본문에 비밀값 없음');

  console.log(`\n모두 통과: ${n}개 검사`);
})().catch((e) => { console.error('\n실패:', e && e.stack || e); process.exit(1); });
