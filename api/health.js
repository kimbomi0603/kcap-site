// Vercel 서버리스 함수: GET /api/health
// 정보마당이 쓰는 공공 API 3종을 실제로 한 번씩 불러 상태를 돌려준다. 인증키 값은 절대 응답에 넣지 않는다.
//   cultureinfo : 한국문화정보원 한눈에보는문화정보 (전시 캘린더)   → DATA_GO_KR_KEY
//   gov24       : 행정안전부 대한민국 공공서비스(혜택) 정보 (지원사업) → DATA_GO_KR_KEY
//   youth       : 온통청년 청년정책 (지원사업)                        → YOUTH_KEY
// 상태: ok | no_key | api_error | http_error | timeout

function mask(s) {
  // 오류 메시지에 키가 섞여 돌아오면 지운다
  let t = String(s || '');
  for (const k of [process.env.DATA_GO_KR_KEY, process.env.GOV24_KEY, process.env.YOUTH_KEY]) {
    if (!k) continue;
    for (const v of [k, encodeURIComponent(k), decodeURIComponent(k)]) { if (v) t = t.split(v).join('***'); }
  }
  return t.slice(0, 200);
}
async function probe(name, url, judge) {
  const t0 = Date.now(); const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const body = await r.text();
    if (!r.ok) return { name, status: 'http_error', ms: Date.now() - t0, note: mask('HTTP ' + r.status + ' ' + body.slice(0, 120)) };
    const j = judge(body);
    return { name, status: j.ok ? 'ok' : 'api_error', ms: Date.now() - t0, note: mask(j.note), count: j.count };
  } catch (e) {
    return { name, status: e.name === 'AbortError' ? 'timeout' : 'http_error', ms: Date.now() - t0, note: mask(e.message) };
  } finally { clearTimeout(tm); }
}
function encKey(k) { return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k); }
function decKey(k) { return /%[0-9A-Fa-f]{2}/.test(k) ? decodeURIComponent(k) : k; }

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const dk = (process.env.DATA_GO_KR_KEY || process.env.GOV24_KEY || '').trim();
  const yk = (process.env.YOUTH_KEY || '').trim();
  const jobs = [];
  if (!dk) { jobs.push({ name: 'cultureinfo', status: 'no_key', note: 'DATA_GO_KR_KEY 없음' }, { name: 'gov24', status: 'no_key', note: 'DATA_GO_KR_KEY 없음' }); }
  else {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    jobs.push(probe('cultureinfo', `https://apis.data.go.kr/B553457/cultureinfo/period2?serviceKey=${encKey(dk)}&from=${today}&to=${today}&PageNo=1&numOfrows=1`, (b) => {
      const code = /<resultCode>([^<]*)</.exec(b); const msg = /<resultMsg>([^<]*)</.exec(b) || /<returnAuthMsg>([^<]*)</.exec(b);
      const total = /<totalCount>([^<]*)</.exec(b);
      return { ok: !!code && code[1].trim() === '00', note: msg ? msg[1] : b.slice(0, 120), count: total ? +total[1] : undefined };
    }));
    const u = new URL('https://api.odcloud.kr/api/gov24/v3/serviceList');
    u.searchParams.set('page', '1'); u.searchParams.set('perPage', '1'); u.searchParams.set('returnType', 'JSON'); u.searchParams.set('serviceKey', decKey(dk));
    jobs.push(probe('gov24', u.toString(), (b) => { try { const j = JSON.parse(b); return { ok: Array.isArray(j.data), note: j.msg || j.message || '', count: j.totalCount }; } catch (e) { return { ok: false, note: b.slice(0, 120) }; } }));
  }
  if (!yk) jobs.push({ name: 'youth', status: 'no_key', note: 'YOUTH_KEY 없음' });
  else {
    const u = new URL('https://www.youthcenter.go.kr/go/ythip/getPlcy');
    u.searchParams.set('apiKeyNm', decKey(yk)); u.searchParams.set('rtnType', 'json'); u.searchParams.set('pageNum', '1'); u.searchParams.set('pageSize', '1'); u.searchParams.set('pageType', '1');
    jobs.push(probe('youth', u.toString(), (b) => { try { const j = JSON.parse(b); const r = j.result || j; const list = r.youthPolicyList || r.policyList; return { ok: Array.isArray(list), note: r.resultMessage || j.resultMessage || '', count: r.pagging ? r.pagging.totCount : undefined }; } catch (e) { return { ok: false, note: b.slice(0, 120) }; } }));
  }
  const out = await Promise.all(jobs);
  res.status(200).send(JSON.stringify({ ok: out.every((x) => x.status === 'ok'), checked: new Date().toISOString(), apis: out }, null, 2));
};
