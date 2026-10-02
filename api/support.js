// Vercel 서버리스 함수: /api/support?q=예술&region=jn&src=gov24|youth
// 공공 Open API를 서버에서 대신 호출해 인증키를 숨기고, 결과를 한 형식으로 정리해 돌려준다.
// 필요한 환경변수 (Vercel 프로젝트 → Settings → Environment Variables)
//   DATA_GO_KR_KEY : 공공데이터포털 인증키 (전시 캘린더와 같은 키. '행정안전부_대한민국 공공서비스(혜택) 정보' 활용신청 필요)
//   YOUTH_KEY : 온통청년 Open API 인증키 (온통청년 마이페이지 또는 공공데이터포털 발급)
// 키가 없으면 configured:false 를 돌려주고, 화면은 추천 공모·바로가기 링크만 보여준다.

const REGIONS = {
  all: { names: [], zip: [] },
  gwangju: { names: ['광주광역시', '광주시', '광주'], zip: ['29'] },
  jeonnam: { names: ['전라남도', '전남'], zip: ['46'] },
  jn: { names: ['전남광주', '전라남도', '광주광역시', '광주시'], zip: ['46', '29'] }, // 옛 링크 호환
  gangjin: { names: ['강진'], zip: ['46810'] }, // 옛 링크 호환
  seoul: { names: ['서울'], zip: ['11'] },
  busan: { names: ['부산'], zip: ['26'] },
  daegu: { names: ['대구'], zip: ['27'] },
  incheon: { names: ['인천'], zip: ['28'] },
  daejeon: { names: ['대전'], zip: ['30'] },
  ulsan: { names: ['울산'], zip: ['31'] },
  sejong: { names: ['세종'], zip: ['36'] },
  gyeonggi: { names: ['경기'], zip: ['41'] },
  gangwon: { names: ['강원'], zip: ['51', '42'] },
  chungbuk: { names: ['충청북도', '충북'], zip: ['43'] },
  chungnam: { names: ['충청남도', '충남'], zip: ['44'] },
  jeonbuk: { names: ['전북', '전라북도'], zip: ['52', '45'] },
  gyeongbuk: { names: ['경상북도', '경북'], zip: ['47'] },
  gyeongnam: { names: ['경상남도', '경남'], zip: ['48'] },
  jeju: { names: ['제주'], zip: ['50'] },
};

// 신청기한 문자열에서 마지막 날짜(마감일)를 YYYY-MM-DD로 뽑는다. 없으면 '' ('상시' 등)
function lastDate(s) {
  const t = String(s || '');
  const re = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})|(20\d{2})(\d{2})(\d{2})/g;
  let m, last = '';
  while ((m = re.exec(t))) {
    const y = m[1] || m[4], mo = m[2] || m[5], d = m[3] || m[6];
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) last = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return last;
}
const clip = (s, n) => (s ? String(s).replace(/\s+/g, ' ').trim().slice(0, n) : '');

// 장르 단어로 찾을 때 함께 볼 단어. 정부 사업 · 청년정책 이름에는 '미술' 같은 장르 이름이 드물어서
// '미술'로 찾으면 0건이 나오곤 했다. terms = 정부24 서비스명 검색어, re = 찾은 사업이 그 장르인지 보는 기준.
// '전시'는 '대전시' · '안전시설' 같은 말에도 들어 있어, 찾은 뒤에 앞뒤 글자를 보고 한 번 더 가린다.
const GENRES = [
  { alias: ['미술', '시각', '시각예술', '전시'], terms: ['미술', '시각예술', '전시', '작가', '갤러리', '공예'], re: /미술|시각예술|(?<![대안발사])전시(?!설)|작가|갤러리|회화|조각|(?<!공)공예/ },
  { alias: ['음악', '밴드'], terms: ['음악', '밴드', '뮤지션', '인디', '버스킹'], re: /음악|밴드|뮤지션|인디|버스킹|작곡|연주/ },
  { alias: ['공연', '연극', '무용', '뮤지컬'], terms: ['공연', '연극', '무용', '뮤지컬', '극단'], re: /(?<!공)공연|연극|무용|뮤지컬|극단/ },
  { alias: ['문학', '출판'], terms: ['문학', '출판', '웹소설'], re: /문학|출판|작가|웹소설|시인|소설/ },
  { alias: ['영상', '영화', '미디어'], terms: ['영상', '영화', '애니메이션', '웹툰'], re: /영상|영화|미디어|애니메이션|웹툰/ },
  { alias: ['공예', '도예', '도자', '디자인'], terms: ['공예', '도예', '도자', '디자인', '공방'], re: /(?<!공)공예|도예|도자|디자인|공방/ },
];
const genreOf = (w) => GENRES.find((g) => g.alias.includes(w)) || null;
// 청년정책 · 정부 사업 설명에서 낱말 하나를 찾는다 (장르 단어면 묶음 기준으로)
const hasWord = (h, w) => { const g = genreOf(w); return g ? g.re.test(h) : h.includes(w); };

async function getJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// 1) 정부24 공공서비스(중앙부처 + 지자체) — 서비스명 검색
//   검색어가 없으면 서비스명에 '예술 · 창작 · 공연'이 들어간 사업은 모두, '문화'가 들어간 사업은
//   설명에 예술 활동 단어가 있는 것만 남긴다 ('다문화 가족', '기업문화' 같은 사업이 섞이지 않게).
const GOV_URL = 'https://api.odcloud.kr/api/gov24/v3/serviceList';
const GOV_NOT = /다문화|기업문화|조직문화|직장문화|가족문화|음주문화|교통문화|안전문화|장례문화|음식문화|식문화|선거문화|기부문화|문화누리|통합문화이용권|티켓\s*할인|입장료|관람료/;
const GOV_TITLE = /예술|창작|(?<!공)공연/; // '공공연구'의 '공연'은 빼고 본다
const GOV_EXPAND_NOT = /수출|무역|박람회|해외\s*전시회|전시회\s*참가|산업전|기업|창업|농업|어업|축산|관광객|소상공인|체험료|관람|이용료|북카페|예식|결혼|무료\s*이용/;
// 장르 단어로 넓혀 찾은 사업은 이름 · 설명 · 대상 어딘가에 예술가를 위한 사업이라는 말이 있어야 남긴다
const ARTIST_SIGNAL = /예술|창작|작가|작품|아티스트|공예인|공예가|미술인|음악인|연주자|무용수|배우|극단|밴드|뮤지션|문인/;
const GOV_ARTS = /예술|창작|(?<!공)공연|전시|미술|작가|공예|음악|연극|무용|국악|레지던시|콘텐츠|영상|출판|문학|웹툰|만화|애니메이션|사진|디자인|공방/;
async function gov24Page(key, term, page, ms) {
  const u = new URL(GOV_URL);
  u.searchParams.set('page', String(page));
  u.searchParams.set('perPage', '100');
  u.searchParams.set('returnType', 'JSON');
  u.searchParams.set('serviceKey', key);
  u.searchParams.set('cond[서비스명::LIKE]', term);
  const j = await getJSON(u, ms);
  return { list: j.data || [], total: +(j.matchCount != null ? j.matchCount : j.totalCount) || 0 };
}
async function gov24Term(key, term, maxPages, deadline) {
  const left = () => Math.max(1500, deadline - Date.now());
  const first = await gov24Page(key, term, 1, left());
  const pages = Math.min(maxPages, Math.ceil(first.total / 100) || 1);
  const rest = await Promise.allSettled(Array.from({ length: pages - 1 }, (_, i) => gov24Page(key, term, i + 2, left())));
  return first.list.concat(...rest.filter((x) => x.status === 'fulfilled').map((x) => x.value.list));
}
async function gov24(q, region) {
  let key = (process.env.DATA_GO_KR_KEY || process.env.GOV24_KEY || '').trim();
  if (!key) return { configured: false, items: [] };
  if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key); // URLSearchParams가 다시 인코딩하므로
  const deadline = Date.now() + 7500;
  const genre = q && !/\s/.test(q) ? genreOf(q) : null;
  const terms = genre ? genre.terms : q ? [q] : ['예술', '문화', '창작', '공연'];
  const got = await Promise.allSettled(terms.map((t) => gov24Term(key, t, t === '문화' ? 4 : genre ? 1 : 2, deadline)));
  if (got.every((x) => x.status === 'rejected')) throw got[0].reason;
  const t = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const qNot = q && GOV_NOT.test(q); // '다문화'처럼 직접 찾는 경우는 막지 않는다
  const seen = new Set(); const items = []; let pool = 0;
  got.forEach((x) => {
    if (x.status !== 'fulfilled') return;
    for (const d of x.value) {
      if (!d || seen.has(d['서비스ID'])) continue;
      seen.add(d['서비스ID']); pool++;
      const name = String(d['서비스명'] || '');
      if (!qNot && GOV_NOT.test(name)) continue;
      if (!q && !GOV_TITLE.test(name) && !GOV_ARTS.test(`${name} ${d['서비스목적요약'] || ''} ${d['지원내용'] || ''} ${d['지원대상'] || ''}`)) continue;
      // 장르 묶음으로 넓혀 찾은 경우: 창업 · 수출처럼 예술가 지원이 아닌 사업과, 장르에 맞지 않는 사업은 뺀다
      if (genre && (GOV_EXPAND_NOT.test(name) || !genre.re.test(name) || !ARTIST_SIGNAL.test(`${name} ${d['서비스목적요약'] || ''} ${d['지원대상'] || ''} ${d['지원내용'] || ''}`))) continue;
      const org = `${d['소관기관명'] || ''} ${d['접수기관'] || ''}`;
      if (region.names.length && !region.names.some((n) => org.includes(n))) continue;
      const end = lastDate(d['신청기한']);
      if (end && end < t) continue; // 신청 기간이 끝난 사업은 뺀다
      items.push({
        src: 'gov24',
        title: clip(name, 80),
        org: clip(d['소관기관명'], 40),
        orgType: clip(d['소관기관유형'], 20),
        summary: clip(d['서비스목적요약'] || d['지원내용'], 160),
        target: clip(d['지원대상'], 120),
        period: clip(d['신청기한'], 60),
        end,
        url: d['상세조회URL'] || `https://www.gov.kr/portal/rcvfvrSvc/dtlEx/${d['서비스ID']}`,
        updated: clip(d['수정일시'], 10),
        arts: GOV_TITLE.test(name),
      });
    }
  });
  items.sort((a, b) => (b.arts - a.arts) || (b.updated || '').localeCompare(a.updated || ''));
  return { configured: true, items: items.slice(0, 60), stats: { pool, matched: items.length } };
}

// 2) 온통청년 청년정책 — 예술인에게 맞는 정책만 골라 낸다
//   ① 정책중분류 '예술인지원' 전부  ② '문화활동 및 생활지원' 가운데 제목에 예술 단어가 있는 것
//   ③ 정책명에 예술 · 창작 · 공연이 들어간 정책. 마감이 지난 정책은 뺀다.
//   (온통청년 OPEN API 제공목록: mclsfNm·plcyNm 요청 파라미터, zipCd = 5자리 법정시군구코드)
const YOUTH_URL = 'https://www.youthcenter.go.kr/go/ythip/getPlcy';
const ARTS_CAT = '예술인지원';
const CULTURE_CAT = '문화활동 및 생활지원';
const ARTS_TITLE = /예술|창작|(?<!공)공연|전시|작가|미술|음악|연극|무용|국악|공예|레지던시|아트|갤러리|뮤지컬|밴드|버스킹|웹툰|애니메이션|영화|사진|디자인|문학|출판/;
const NOT_ARTS = /기업문화|조직문화|직장문화|가족친화|음식|급식|아침밥|식비|이스포츠|e스포츠|박람회|수출|무역/;
// 온통청년 분류가 '예술인지원'이어도 제목·설명에 예술 활동이 없으면 뺀다 (예: 청년농 미디어커머스, 해외배낭연수, 정책 상담)
const ARTS_SIGNAL = /예술|창작|(?<!공)공연|전시|작가|미술|음악|연극|무용|국악|공예|레지던시|아트|갤러리|뮤지컬|밴드|버스킹|웹툰|애니메이션|영화|사진|디자인|문학|출판|인디|뮤지션|k-?pop|케이팝|오페라|성악|청년문화|문화공간/i;
const YOUTH_TTL = 30 * 60 * 1000; // 같은 서버 인스턴스에서는 30분 동안 받아 둔 목록을 다시 쓴다
let youthCache = { at: 0, pool: null };

async function youthPage(key, params, pageNum, ms) {
  const u = new URL(YOUTH_URL);
  u.searchParams.set('apiKeyNm', key);
  u.searchParams.set('rtnType', 'json');
  u.searchParams.set('pageType', '1');
  u.searchParams.set('pageNum', String(pageNum));
  u.searchParams.set('pageSize', '100');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const j = await getJSON(u, ms);
  const r = j.result || j;
  return { list: r.youthPolicyList || r.policyList || [], total: +((r.pagging && r.pagging.totCount) || 0) };
}
// 조건 하나를 끝까지(최대 maxPages쪽) 받아 온다
async function youthAll(key, params, maxPages, deadline) {
  const left = () => Math.max(1500, deadline - Date.now()); // 함수 제한 시간(10초) 안에 끝내도록
  const first = await youthPage(key, params, 1, left());
  const pages = Math.min(maxPages, Math.ceil(first.total / 100) || 1);
  const rest = await Promise.allSettled(Array.from({ length: pages - 1 }, (_, i) => youthPage(key, params, i + 2, left())));
  return first.list.concat(...rest.filter((x) => x.status === 'fulfilled').map((x) => x.value.list));
}
// 지역: 정책거주지역코드(zipCd)가 고른 시도로 시작하거나, 지역 제한이 없는(전국) 정책
function youthInRegion(p, region) {
  if (!region.zip.length && !region.names.length) return true;
  const zips = String(p.zipCd || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!zips.length || zips.length > 200) return true; // 전국 대상
  if (zips.some((c) => region.zip.some((pre) => c.startsWith(pre)))) return true;
  const org = `${p.rgtrHghrkInstCdNm || ''} ${p.sprvsnInstCdNm || ''} ${p.rgtrInstCdNm || ''}`;
  return region.names.some((n) => org.includes(n));
}

// 나이 조건: 0 · 빈칸은 제한 없음, 99세 이상은 상한 없음으로 본다
function ageText(min, max) {
  const a = +min || 0, b = +max || 0, hasMax = b > 0 && b < 99;
  if (!a && !hasMax) return '';
  if (a && hasMax) return `만 ${a}~${b}세`;
  return a ? `만 ${a}세 이상` : `만 ${b}세 이하`;
}
// 20261008 → 2026.10.08
const ymdText = (s) => { const t = String(s || '').replace(/(20\d{2})(\d{2})(\d{2})/g, '$1.$2.$3').replace(/\s*~\s*/g, ' ~ ').trim(); return /^[\s~]*$/.test(t) ? '' : t; };
async function youth(q, region) {
  let key = process.env.YOUTH_KEY;
  if (!key) return { configured: false, items: [] };
  if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key);
  let pool = youthCache.pool && Date.now() - youthCache.at < YOUTH_TTL ? youthCache.pool : null;
  if (!pool) {
    const deadline = Date.now() + 7500;
    const jobs = [
      youthAll(key, { mclsfNm: ARTS_CAT }, 5, deadline),
      youthAll(key, { mclsfNm: CULTURE_CAT }, 3, deadline),
      ...['예술', '창작', '공연'].map((w) => youthAll(key, { plcyNm: w }, 2, deadline)),
    ];
    const got = await Promise.allSettled(jobs);
    if (got.every((x) => x.status === 'rejected')) throw got[0].reason;
    const seen = new Set(); pool = [];
    got.forEach((x) => { if (x.status === 'fulfilled') x.value.forEach((p) => { const id = p && (p.plcyNo || p.plcyNm); if (id && !seen.has(id)) { seen.add(id); pool.push(p); } }); });
    if (got.every((x) => x.status === 'fulfilled')) youthCache = { at: Date.now(), pool };
  }

  const t = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); // 띄어 쓴 단어가 모두 들어 있어야 한다
  const items = pool
    .filter((p) => p && p.plcyNm)
    .filter((p) => {
      const cat = String(p.mclsfNm || '');
      const name = `${p.plcyNm} ${p.plcyKywdNm || ''}`;
      if (NOT_ARTS.test(name)) return false;
      if (cat.includes(ARTS_CAT)) return ARTS_SIGNAL.test(`${name} ${p.plcyExplnCn || ''}`);
      return ARTS_TITLE.test(name);
    })
    .filter((p) => youthInRegion(p, region))
    .filter((p) => { if (!words.length) return true; const h = `${p.plcyNm} ${p.plcyKywdNm || ''} ${p.plcyExplnCn || ''} ${p.plcySprtCn || ''}`.toLowerCase(); return words.every((w) => hasWord(h, w)); })
    .map((p) => ({
      src: 'youth',
      title: clip(p.plcyNm, 80),
      org: clip(p.sprvsnInstCdNm || p.rgtrInstCdNm || p.operInstCdNm, 40),
      orgType: clip(p.mclsfNm || p.lclsfNm, 20),
      summary: clip(p.plcyExplnCn || p.plcySprtCn, 160),
      target: ageText(p.sprtTrgtMinAge, p.sprtTrgtMaxAge),
      period: clip(ymdText(p.aplyYmd || (p.bizPrdBgngYmd ? `${p.bizPrdBgngYmd}~${p.bizPrdEndYmd || ''}` : '')), 60),
      end: lastDate(p.aplyYmd || p.bizPrdEndYmd),
      url: p.aplyUrlAddr || p.refUrlAddr1 || (p.plcyNo ? `https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${p.plcyNo}` : 'https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch'),
      updated: clip(p.lastMdfcnDt || p.frstRegDt, 10),
      arts: String(p.mclsfNm || '').includes(ARTS_CAT),
    }))
    .filter((it) => !it.end || it.end >= t) // 마감 지난 정책 제외
    .filter((it, i, arr) => arr.findIndex((x) => x.title === it.title && x.org === it.org) === i) // 같은 제목·기관은 하나만
    .sort((a, b) => (b.arts - a.arts) || (a.end || '9999').localeCompare(b.end || '9999'));
  return { configured: true, items: items.slice(0, 80), stats: { pool: pool.length, matched: items.length } };
}

module.exports = async (req, res) => {
  const qs = req.query || {};
  const q = clip(qs.q, 30);
  const region = REGIONS[qs.region] || REGIONS.all;
  const src = qs.src === 'youth' ? 'youth' : 'gov24';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const out = src === 'youth' ? await youth(q, region) : await gov24(q, region);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(JSON.stringify({ ok: true, src, ...out }));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(JSON.stringify({ ok: false, src, configured: true, error: String(e.message || e), items: [] }));
  }
};
module.exports._test = { gov24, youth, REGIONS, lastDate, genreOf, hasWord };
