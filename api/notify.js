// Vercel 서버리스 함수: /api/notify — 확인된 구독자에게 주간 공모 알림 메일 발송 (vercel.json 크론: 매주 월요일 08:00 KST)
//   GET, 보호됨: Authorization: Bearer ${CRON_SECRET}
//                (CRON_SECRET 이 없을 때만 Vercel 크론 요청(x-vercel-cron 헤더 또는 vercel-cron UA)을 그대로 허용)
//   한 통에 두 부분: "이번 주 마감 (7일 이내)" + "새로 올라온 공모 (지난 7일)"
//   - 새로 올라온: posted 가 7일 이내이거나, KV의 seen:<id>(처음 본 날짜)가 7일 이내
//     (맨 첫 실행은 notify:init 키로 구분해 posted 기준만 쓴다 — 기존 공모 전체가 '신규'로 쏟아지지 않게)
//   - 구독자 1명당 1회/실행, sent:<key>:<YYYY-MM-DD> 로 같은 날 재실행 시 중복 방지
//   - 보낼 항목이 없으면 건너뜀. 약 9초를 넘기기 전에 멈추고 partial:true 로 보고
// 응답: {ok, subs, sent, skipped, partial?, errors?}
// 환경변수: KV_REST_API_URL, KV_REST_API_TOKEN, RESEND_API_KEY, MAIL_FROM, SITE_URL, CRON_SECRET

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { kv, kvPipeline, kvEnv, sendMail, esc, SITE_URL } = require('./subscribe.js').helpers;

const REG_NAME = { seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '경기', gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북', jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주' };
const WINDOW_DAYS = 7;   // 마감 임박·신규 판단 기간
const MAX_PER_SECTION = 30;
const TIME_BUDGET_MS = 8800; // Vercel Hobby 10초 제한 대비
const SEND_DELAY_MS = 250;

// ---- 날짜 (KST 기준 YYYY-MM-DD) ----
function todayKST(now) { return new Date((now || Date.now()) + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

// ---- 공모 데이터 ----
function loadCalls() {
  try { return require('../data/calls.json'); } catch (e) { /* 번들에 없으면 파일에서 */ }
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'calls.json'), 'utf8'));
}

// ---- 매칭 규칙: 구독 조건에 맞는 공모인지 ----
function matches(sub, it) {
  if (it.kind !== '공모') return false;
  if (sub.who && Array.isArray(it.who) && it.who.length && it.who.indexOf(sub.who) < 0) return false;
  if (it.age && sub.age && sub.age > it.age) return false;
  const tags = Array.isArray(it.tags) ? it.tags : [];
  const subTags = Array.isArray(sub.tags) ? sub.tags : [];
  if (subTags.length && tags.indexOf('전체') < 0 && !subTags.some((t) => tags.indexOf(t) > -1)) return false;
  if (sub.reg && sub.reg !== 'all') {
    const name = REG_NAME[sub.reg];
    if (!name) return false;
    if (it.reg !== '전국' && it.reg !== name) return false;
  }
  return true;
}

// 구독자 1명에게 보낼 두 목록 (마감 임박 / 신규). 신규 목록에는 마감 임박과 겹치는 항목을 넣지 않는다.
function pick(sub, items, today) {
  const end7 = addDays(today, WINDOW_DAYS);
  const since = addDays(today, -WINDOW_DAYS);
  const fit = items.filter((it) => matches(sub, it));
  const due = fit.filter((it) => it.end && it.end >= today && it.end <= end7).sort((a, b) => a.end.localeCompare(b.end));
  const dueIds = new Set(due.map((i) => i.id));
  const fresh = fit.filter((it) => !dueIds.has(it.id) && ((it.posted && it.posted >= since) || (it.firstSeen && it.firstSeen >= since)))
    .sort((a, b) => (b.posted || b.firstSeen || '').localeCompare(a.posted || a.firstSeen || ''));
  return { due: due.slice(0, MAX_PER_SECTION), fresh: fresh.slice(0, MAX_PER_SECTION) };
}

// ---- 메일 본문 ----
function itemHtml(it, today) {
  const dn = it.end ? daysBetween(today, it.end) : null;
  const due = it.end ? `마감 ${esc(it.end)} (${dn === 0 ? '오늘 마감' : 'D-' + dn})` : '마감 정보 없음';
  return `<li style="margin:0 0 14px;padding:0 0 14px;border-bottom:1px solid #eee;list-style:none">
<a href="${esc(it.url)}" style="font-size:15.5px;font-weight:700;color:#111;text-decoration:none;line-height:1.45">${esc(it.title)}</a>
<div style="font-size:13px;color:#555;margin-top:4px">${esc(it.org || '')} · ${due}${it.reg && it.reg !== '전국' ? ' · ' + esc(it.reg) : ''}</div>
<div style="font-size:12.5px;margin-top:6px"><a href="${SITE_URL}/call.html?id=${encodeURIComponent(it.id)}" style="color:#c8102e;font-weight:700;text-decoration:none">관심 · 상세 보기 →</a></div></li>`;
}
function section(title, list, today, empty) {
  return `<h2 style="font-size:16px;margin:26px 0 12px;padding-bottom:8px;border-bottom:2px solid #111">${esc(title)} <span style="color:#c8102e">${list.length}</span></h2>` +
    (list.length ? `<ul style="margin:0;padding:0">${list.map((it) => itemHtml(it, today)).join('')}</ul>` : `<p style="font-size:13.5px;color:#888;margin:0">${esc(empty)}</p>`);
}
function buildMail(sub, key, { due, fresh }, today) {
  const unsub = `${SITE_URL}/api/subscribe?unsubscribe=${sub.token}&k=${key}`;
  const cond = [sub.who || '개인·단체', sub.age ? '만 ' + sub.age + '세' : '', sub.tags && sub.tags.length ? sub.tags.join('·') : '분야 전체', sub.reg === 'all' || !sub.reg ? '전국' : REG_NAME[sub.reg] + '·전국'].filter(Boolean).join(' · ');
  const subject = `[KCAP 정보마당] ${today} 공모 알림 — 마감 임박 ${due.length}건 · 새 공모 ${fresh.length}건`;
  const html = `<!doctype html><html lang="ko"><body style="font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#111;max-width:600px;margin:0 auto;padding:28px 20px">
<p style="font-size:12px;letter-spacing:.2em;color:#c8102e;font-weight:700;margin:0 0 8px">KCAP 정보마당 · 주간 공모 알림</p>
<h1 style="font-size:21px;margin:0 0 8px">${esc(today)} 기준, 조건에 맞는 공모</h1>
<p style="font-size:13px;color:#666;margin:0">고른 조건: ${esc(cond)}</p>
${section('이번 주 마감 (7일 이내)', due, today, '이번 주에 마감하는 공모는 없습니다.')}
${section('새로 올라온 공모 (지난 7일)', fresh, today, '지난 7일간 새로 올라온 공모는 없습니다.')}
<p style="font-size:12px;color:#999;line-height:1.7;border-top:1px solid #eee;margin-top:26px;padding-top:14px">
전체 공모는 <a href="${SITE_URL}/info.html" style="color:#666">정보마당</a>에서 볼 수 있습니다. 조건을 바꾸려면 정보마당에서 같은 이메일로 다시 신청하세요.<br>
더 받고 싶지 않으면 <a href="${unsub}" style="color:#666">수신 거부</a>를 눌러 주세요. (사)한국청년문화예술인협회</p>
</body></html>`;
  return { subject, html };
}

// ---- 인증 ----
function authorized(req) {
  const h = req.headers || {};
  const secret = (process.env.CRON_SECRET || '').trim();
  const auth = String(h.authorization || '');
  if (secret) {
    const given = auth.replace(/^Bearer\s+/i, '');
    const a = Buffer.from(given), b = Buffer.from(secret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // CRON_SECRET 미설정: Vercel 크론 요청만 허용 (외부에서 흉내 낼 수 있으므로 CRON_SECRET 설정을 권장)
  return !!h['x-vercel-cron'] || /^vercel-cron/i.test(String(h['user-agent'] || ''));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 본 처리 (테스트에서 직접 호출할 수 있게 분리) ----
async function run({ now = Date.now(), calls } = {}) {
  const t0 = Date.now();
  const today = todayKST(now);
  const data = calls || loadCalls();
  const items = (data.items || []).filter((it) => it && it.kind === '공모' && it.end && it.end >= today);
  const out = { ok: true, date: today, subs: 0, sent: 0, skipped: 0, errors: 0 };

  // 1) 처음 본 날짜 기록 (seen:<id>). 키가 하나도 없으면 첫 실행 → posted 기준으로만 '신규'를 정한다 (전체가 신규로 쏟아지지 않게).
  if (items.length) {
    const [init, ...seen] = await kvPipeline([['GET', 'notify:init'], ...items.map((it) => ['GET', 'seen:' + it.id])]);
    const firstRun = !init;
    const toSet = firstRun ? [['SET', 'notify:init', today]] : [];
    items.forEach((it, i) => {
      if (seen[i]) it.firstSeen = String(seen[i]);
      else { it.firstSeen = firstRun ? '' : today; toSet.push(['SET', 'seen:' + it.id, today, 'EX', String(120 * 86400)]); }
    });
    if (toSet.length) await kvPipeline(toSet);
  }

  // 2) 구독자
  const keys = (await kv('SMEMBERS', 'subs')) || [];
  if (!keys.length) return out;
  const raws = await kvPipeline(keys.map((k) => ['GET', k]));
  const subs = [];
  keys.forEach((k, i) => { try { const s = raws[i] ? JSON.parse(raws[i]) : null; if (s && s.confirmed && s.email) subs.push({ key: k, sub: s }); } catch (e) { /* 손상된 항목 무시 */ } });
  out.subs = subs.length;
  if (!subs.length) return out;
  const sentFlags = await kvPipeline(subs.map((s) => ['GET', `sent:${s.key}:${today}`]));

  // 3) 발송 (순차, 시간 예산 안에서)
  for (let i = 0; i < subs.length; i++) {
    if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; break; }
    const { key, sub } = subs[i];
    if (sentFlags[i]) { out.skipped++; continue; }
    const lists = pick(sub, items, today);
    if (!lists.due.length && !lists.fresh.length) { out.skipped++; continue; }
    try {
      const mail = buildMail(sub, key, lists, today);
      await sendMail({ to: sub.email, subject: mail.subject, html: mail.html });
      await kv('SET', `sent:${key}:${today}`, '1', 'EX', String(3 * 86400));
      out.sent++;
    } catch (e) {
      out.errors++;
    }
    if (i < subs.length - 1) await sleep(SEND_DELAY_MS);
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if ((req.method || 'GET').toUpperCase() !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).send(JSON.stringify({ ok: false, error: 'method' })); }
  if (!authorized(req)) return res.status(401).send(JSON.stringify({ ok: false, error: 'unauthorized' }));
  if (!kvEnv()) return res.status(200).send(JSON.stringify({ ok: false, configured: false, reason: 'kv' }));
  if (!(process.env.RESEND_API_KEY || '').trim()) return res.status(200).send(JSON.stringify({ ok: false, configured: false, reason: 'resend' }));
  try {
    const out = await run();
    return res.status(200).send(JSON.stringify(out));
  } catch (e) {
    return res.status(500).send(JSON.stringify({ ok: false, error: String(e && e.message || e).replace(/Bearer\s+\S+/g, 'Bearer ***').slice(0, 200) }));
  }
};

module.exports.internals = { run, matches, pick, buildMail, todayKST, addDays, REG_NAME };
