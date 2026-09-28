// Vercel 서버리스 함수: 전국 전시 일정
//   GET /api/exhibitions            → 오늘부터 90일 사이에 열리는 전시 목록 (전국)
//   GET /api/exhibitions?seq=123    → 전시 1건 상세 (관람료 · 주소 · 문의 · 공식 링크)
// 데이터: 한국문화정보원 「한눈에보는문화정보조회서비스」 (공공데이터포털, 분야코드 D000=전시)
// 환경변수: DATA_GO_KR_KEY  (공공데이터포털 인증키. 지원사업 검색과 같은 키)
//           EXTRA_SHEET_CSV (선택) 협회가 직접 올리는 전시 — 구글 시트 '웹에 게시' CSV 주소
//             열 순서: 제목,시작일,종료일,장소,시도,시군구,링크,이미지,메모,협회추천(Y)
// 응답은 Vercel 엣지에 6시간 캐시된다 (API 호출량 최소화).

const BASE = 'https://apis.data.go.kr/B553457/cultureinfo';
const PAGE = 100;
const MAX_PAGES = 6;
const BUDGET_MS = 7000; // 함수 제한시간(기본 10초) 안에서만 상세정보를 채운다

function keyParam() {
  const k = (process.env.DATA_GO_KR_KEY || process.env.GOV24_KEY || '').trim();
  if (!k) return '';
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k); // 인코딩 키 · 디코딩 키 모두 허용
}

function kst(d = new Date()) { return new Date(d.getTime() + 9 * 3600 * 1000); }
function ymd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·', nbsp: ' ', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
function decode(s) {
  if (!s) return '';
  let t = String(s).replace(/^<!\[CDATA\[|\]\]>$/g, '');
  for (let i = 0; i < 2; i++) { // 이중 인코딩(&amp;middot;) 대비
    t = t.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
      if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? m : String.fromCodePoint(n); }
      return ENT[e] !== undefined ? ENT[e] : m;
    });
  }
  return t.replace(/\s+/g, ' ').trim();
}
function items(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g; let m;
  while ((m = re.exec(xml))) {
    const o = {}; const f = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g; let g;
    while ((g = f.exec(m[1]))) o[g[1]] = decode(g[2]);
    out.push(o);
  }
  return out;
}
function header(xml) {
  const c = /<resultCode>([^<]*)<\/resultCode>/.exec(xml); const msg = /<resultMsg>([^<]*)<\/resultMsg>/.exec(xml);
  const auth = /<returnAuthMsg>([^<]*)<\/returnAuthMsg>/.exec(xml); // 인증 오류 시 형식
  return { code: c ? c[1].trim() : (auth ? 'AUTH' : ''), msg: (msg ? msg[1] : auth ? auth[1] : '').trim() };
}
async function getText(url, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
const d8 = (s) => { const m = String(s || '').replace(/[^0-9]/g, ''); return m.length >= 8 ? `${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6, 8)}` : ''; };
const https = (u) => (u ? String(u).replace(/^http:\/\//i, 'https://') : '');

function freeOf(price) {
  if (!price) return null;
  const p = price.replace(/\s/g, '');
  const paid = /[1-9][0-9,]*원/.test(p);
  if (/무료/.test(p) && !paid) return true;
  if (paid) return false;
  return null;
}

function norm(it) {
  return {
    id: String(it.seq || '').trim(),
    title: it.title || '',
    start: d8(it.startDate), end: d8(it.endDate),
    place: it.place || '', area: it.area || '', sigungu: it.sigungu || '',
    realm: it.realmName || '',
    thumb: https(it.thumbnail || it.imgUrl || ''),
    lng: parseFloat(it.gpsX) || null, lat: parseFloat(it.gpsY) || null,
  };
}
function addDetail(o, d) {
  if (!d) return o;
  o.price = d.price || '';
  o.free = freeOf(d.price);
  o.url = https(d.url || d.placeUrl || '');
  o.addr = d.placeAddr || '';
  o.phone = d.phone || '';
  if (!o.thumb && d.imgUrl) o.thumb = https(d.imgUrl);
  o.detail = true;
  return o;
}

async function detail(seq, kp) {
  const xml = await getText(`${BASE}/detail2?serviceKey=${kp}&seq=${encodeURIComponent(seq)}`, 6000);
  const h = header(xml); if (h.code && h.code !== '00') throw new Error(h.msg || h.code);
  return items(xml)[0] || null;
}

async function extraSheet() {
  const url = process.env.EXTRA_SHEET_CSV; if (!url) return [];
  try {
    const csv = await getText(url, 5000);
    const rows = parseCSV(csv).slice(1).filter((r) => r[0]);
    return rows.map((r, i) => ({
      id: 'kcap-' + i, title: r[0], start: d8(r[1]), end: d8(r[2]) || d8(r[1]), place: r[3] || '', area: r[4] || '', sigungu: r[5] || '',
      url: r[6] || '', thumb: r[7] || '', note: r[8] || '', pick: /^y/i.test(r[9] || ''), realm: '전시', src: 'kcap', detail: true,
    }));
  } catch (e) { return []; }
}
function parseCSV(s) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur.trim()); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows;
}

async function list(kp) {
  const t0 = Date.now();
  const now = kst(); const to = new Date(now.getTime() + 90 * 86400000);
  const seen = new Map();
  // 1순위: 분야별 조회(전시 D000). 결과가 없으면 기간별 조회(공연/전시)로 받아 '전시'만 거른다
  for (const op of ['realm2', 'period2']) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const extra = op === 'realm2' ? '&realmCode=D000' : '&serviceTp=A';
      const url = `${BASE}/${op}?serviceKey=${kp}${extra}&from=${ymd(now)}&to=${ymd(to)}&PageNo=${page}&numOfrows=${PAGE}&sortStdr=1`;
      const xml = await getText(url);
      const h = header(xml); if (h.code && h.code !== '00') throw new Error(h.msg || ('resultCode ' + h.code));
      const got = items(xml);
      for (const it of got) { const o = norm(it); if (o.id && !seen.has(o.id)) seen.set(o.id, o); }
      if (got.length < PAGE || Date.now() - t0 > 3500) break;
    }
    if (seen.size) break;
  }
  const all = [...seen.values()].filter((o) => o.title && (!o.realm || /전시|미술/.test(o.realm)));
  // 곧 끝나는 전시부터 상세정보(관람료 · 링크)를 채운다 — 시간 예산 안에서만
  const byEnd = [...all].sort((a, b) => (a.end || '9').localeCompare(b.end || '9'));
  let i = 0;
  while (i < byEnd.length && Date.now() - t0 < BUDGET_MS) {
    const batch = byEnd.slice(i, i + 12); i += 12;
    const res = await Promise.allSettled(batch.map((o) => detail(o.id, kp)));
    res.forEach((r, k) => { if (r.status === 'fulfilled') addDetail(batch[k], r.value); });
  }
  return all;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const kp = keyParam();
  if (!kp) {
    const extra = await extraSheet();
    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(200).send(JSON.stringify({ ok: true, configured: false, items: extra }));
  }
  try {
    if (q.seq) {
      const d = await detail(String(q.seq).slice(0, 20), kp);
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).send(JSON.stringify({ ok: !!d, item: d ? addDetail(norm(d), d) : null }));
    }
    const [api, extra] = await Promise.all([list(kp), extraSheet()]);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).send(JSON.stringify({ ok: true, configured: true, updated: new Date().toISOString(), items: extra.concat(api) }));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(JSON.stringify({ ok: false, configured: true, error: String(e.message || e), items: [] }));
  }
};
module.exports._test = { items, decode, freeOf, parseCSV, norm };
