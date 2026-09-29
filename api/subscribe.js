// Vercel 서버리스 함수: /api/subscribe — 공모 알림(이메일) 구독
//   POST {email, who:'개인'|'단체'|'', age:number|null, tags:[...], reg:'all'|지역키}
//        → KV에 저장(미확인 상태) 후 확인 메일 발송. 응답 {ok:true, sent:true}
//   GET  ?confirm=<token>&k=<key>      → 구독 확인(confirmed:true), 한국어 안내 페이지
//   GET  ?unsubscribe=<token>&k=<key>  → 구독 삭제, 안내 페이지
// 필요한 환경변수 (Vercel 프로젝트 → Settings → Environment Variables)
//   KV_REST_API_URL, KV_REST_API_TOKEN : Upstash Redis(Vercel KV) REST 주소·토큰
//   RESEND_API_KEY : resend.com 발송 키
//   MAIL_FROM      : 보내는 사람 (기본 'KCAP 정보마당 <onboarding@resend.dev>')
//   SITE_URL       : 메일 속 링크의 기준 주소 (기본 https://kcap.vercel.app)
// 환경변수가 없으면 200 {ok:false, configured:false, reason:'kv'|'resend'} — 화면은 '준비 중'으로 표시한다.
// 저장 구조: sub:<sha256(email)> = JSON {email, who, age, tags, reg, createdAt, confirmed, token}, 집합 subs 에 키 목록.

const crypto = require('crypto');

const SITE_URL = (process.env.SITE_URL || 'https://kcap.vercel.app').replace(/\/+$/, '');
const MAIL_FROM = process.env.MAIL_FROM || 'KCAP 정보마당 <onboarding@resend.dev>';
const REG_KEYS = ['all', 'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju'];
const TAGS = ['시각', '공연', '문학', '콘텐츠', '교육'];
const WHO = ['', '개인', '단체'];
const RATE_LIMIT = 5; // 분당 IP별 신청 횟수

// ---- KV (Upstash REST). 명령 배열을 보내고 result 를 돌려준다. 여러 명령은 pipeline 으로 한 번에. ----
function kvEnv() {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}
async function kv(...cmd) {
  const env = kvEnv();
  if (!env) throw new Error('kv_not_configured');
  const r = await fetch(env.url, { method: 'POST', headers: { Authorization: 'Bearer ' + env.token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd.map(String)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('kv_error: ' + String(j.error || r.status).slice(0, 120));
  return j.result;
}
async function kvPipeline(cmds) {
  const env = kvEnv();
  if (!env) throw new Error('kv_not_configured');
  const r = await fetch(env.url + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + env.token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds.map((c) => c.map(String))) });
  const j = await r.json().catch(() => []);
  if (!r.ok) throw new Error('kv_error: ' + r.status);
  return (Array.isArray(j) ? j : []).map((x) => (x && x.error ? null : x.result));
}

// ---- Resend ----
async function sendMail({ to, subject, html }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) throw new Error('resend_not_configured');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('resend_error: ' + String(j.message || j.name || r.status).slice(0, 120));
  return j.id || '';
}

// ---- 공용 ----
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const subKey = (email) => 'sub:' + sha256(email.trim().toLowerCase());
function safeEq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function clientIp(req) {
  const h = req.headers || {};
  return String(h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'unknown').trim();
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } }
    return req.body;
  }
  return new Promise((resolve) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
function sendJSON(res, status, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(obj));
}
function sendPage(res, status, title, body) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · KCAP 정보마당</title>
<style>body{margin:0;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:#f6f4ee;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}main{background:#fff;max-width:460px;width:100%;padding:36px 32px;border-top:4px solid #c8102e}h1{font-size:22px;margin:0 0 12px}p{font-size:15px;line-height:1.6;color:#444;margin:0 0 20px}a.btn{display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:99px;font-weight:700;font-size:14px}</style></head>
<body><main><h1>${esc(title)}</h1><p>${body}</p><a class="btn" href="${SITE_URL}/info.html">정보마당으로 돌아가기</a></main></body></html>`);
}

// ---- 입력 검증. 잘못되면 문자열(이유), 맞으면 정리된 객체 ----
function validate(b) {
  if (!b || typeof b !== 'object') return '요청 형식이 잘못되었습니다.';
  const email = String(b.email || '').trim();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return '이메일 주소를 확인해 주세요.';
  const who = String(b.who || '');
  if (WHO.indexOf(who) < 0) return '신청 주체 값이 올바르지 않습니다.';
  let age = b.age === '' || b.age === null || b.age === undefined ? null : Number(b.age);
  if (age !== null && (!Number.isInteger(age) || age < 10 || age > 120)) return '나이는 10~120 사이 숫자로 적어 주세요.';
  let tags = Array.isArray(b.tags) ? b.tags.map(String) : b.tags ? [String(b.tags)] : [];
  tags = tags.filter((t) => TAGS.indexOf(t) > -1); // '전체'는 비운 것과 같다
  const reg = String(b.reg || 'all');
  if (REG_KEYS.indexOf(reg) < 0) return '사는 곳 값이 올바르지 않습니다.';
  return { email, who, age, tags, reg };
}

function confirmMail(sub, key) {
  const link = `${SITE_URL}/api/subscribe?confirm=${sub.token}&k=${key}`;
  const cond = [sub.who || '개인·단체 모두', sub.age ? '만 ' + sub.age + '세' : '', sub.tags.length ? sub.tags.join('·') : '분야 전체', sub.reg === 'all' ? '전국' : sub.reg].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="ko"><body style="font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#111;max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-size:12px;letter-spacing:.2em;color:#c8102e;font-weight:700;margin:0 0 8px">KCAP 정보마당</p>
<h1 style="font-size:22px;margin:0 0 16px">공모 알림 구독을 확인해 주세요</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 18px">아래 버튼을 누르면 매주 월요일 아침, 조건에 맞는 공모(이번 주 마감·새로 올라온 공모)를 이 주소로 보내 드립니다.</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 24px;border-radius:99px;font-weight:700;font-size:15px">구독 확인하기</a></p>
<p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 6px">고른 조건: ${esc(cond)}</p>
<p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 18px">버튼이 열리지 않으면 이 주소를 복사해 열어 주세요:<br><a href="${link}" style="color:#111;word-break:break-all">${link}</a></p>
<p style="font-size:12px;color:#999;line-height:1.6;border-top:1px solid #eee;padding-top:14px">직접 신청하지 않으셨다면 이 메일은 무시하셔도 됩니다. 확인하지 않으면 아무 메일도 가지 않습니다.<br>(사)한국청년문화예술인협회 · <a href="${SITE_URL}/privacy.html" style="color:#999">개인정보처리방침</a></p>
</body></html>`;
}

module.exports = async (req, res) => {
  const method = (req.method || 'GET').toUpperCase();
  const q = req.query || {};
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);

  // ---------- GET: 확인 / 수신 중단 ----------
  if (method === 'GET') {
    const key = String(q.k || '');
    const token = String(q.confirm || q.unsubscribe || '');
    const isUnsub = !!q.unsubscribe;
    if (!key || !token) return sendJSON(res, 400, { ok: false, error: 'confirm 또는 unsubscribe 와 k 가 필요합니다.' });
    if (!/^sub:[0-9a-f]{64}$/.test(key) || !/^[0-9a-f]{32}$/.test(token)) return sendPage(res, 400, '링크가 올바르지 않습니다', '메일에 있는 링크를 그대로 열어 주세요.');
    if (!kvEnv()) return sendPage(res, 200, '알림 서비스를 준비하고 있습니다', '아직 저장소가 연결되지 않았습니다. 잠시 뒤 다시 시도해 주세요.');
    try {
      const raw = await kv('GET', key);
      const sub = raw ? JSON.parse(raw) : null;
      if (!sub || !safeEq(sub.token, token)) return sendPage(res, 404, '링크가 만료되었거나 올바르지 않습니다', '이미 수신을 중단했거나, 새로 신청해 링크가 바뀌었을 수 있습니다. 정보마당에서 다시 신청해 주세요.');
      if (isUnsub) {
        await kvPipeline([['DEL', key], ['SREM', 'subs', key]]);
        return sendPage(res, 200, '수신을 중단했습니다', '더 이상 공모 알림 메일을 보내지 않습니다. 언제든 정보마당에서 다시 신청할 수 있습니다.');
      }
      if (!sub.confirmed) { sub.confirmed = true; sub.confirmedAt = new Date().toISOString(); await kv('SET', key, JSON.stringify(sub)); }
      return sendPage(res, 200, '구독이 확인되었습니다', '매주 월요일 아침, 조건에 맞는 공모를 메일로 보내 드립니다. 모든 메일 아래에 수신 거부 링크가 있습니다.');
    } catch (e) {
      return sendPage(res, 500, '처리 중 문제가 생겼습니다', '잠시 뒤 다시 시도해 주세요.');
    }
  }

  // ---------- POST: 신청 ----------
  if (method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return sendJSON(res, 405, { ok: false, error: 'method' }); }
  if (!kvEnv()) return sendJSON(res, 200, { ok: false, configured: false, reason: 'kv' });
  if (!(process.env.RESEND_API_KEY || '').trim()) return sendJSON(res, 200, { ok: false, configured: false, reason: 'resend' });

  const v = validate(await readBody(req));
  if (typeof v === 'string') return sendJSON(res, 400, { ok: false, error: v });

  try {
    // 가벼운 속도 제한: IP별 분당 5회
    const rk = 'rl:' + sha256(clientIp(req)).slice(0, 24);
    const [n] = await kvPipeline([['INCR', rk], ['EXPIRE', rk, 60]]);
    if (Number(n) > RATE_LIMIT) return sendJSON(res, 429, { ok: false, error: '잠시 뒤 다시 시도해 주세요.' });

    const key = subKey(v.email);
    const sub = { ...v, createdAt: new Date().toISOString(), confirmed: false, token: crypto.randomBytes(16).toString('hex') };
    await kvPipeline([['SET', key, JSON.stringify(sub)], ['SADD', 'subs', key]]);
    try {
      await sendMail({ to: v.email, subject: '[KCAP 정보마당] 공모 알림 구독을 확인해 주세요', html: confirmMail(sub, key) });
    } catch (e) {
      // 발송 실패 시 저장은 남겨 두지 않는다 (확인 링크가 전달되지 않았으므로)
      await kvPipeline([['DEL', key], ['SREM', 'subs', key]]).catch(() => {});
      return sendJSON(res, 502, { ok: false, error: '확인 메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
    }
    return sendJSON(res, 200, { ok: true, sent: true });
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: '처리 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' });
  }
};

// 테스트·notify 에서 재사용
module.exports.helpers = { kv, kvPipeline, kvEnv, sendMail, validate, subKey, sha256, esc, SITE_URL, MAIL_FROM };
