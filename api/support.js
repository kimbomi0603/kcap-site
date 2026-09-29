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
// 예술인에게 의미 있는 결과만 남기기 위한 단어
const ARTS = /예술|문화|창작|공연|전시|미술|작가|공예|콘텐츠|디자인|음악|연극|무용|영상|레지던시/;

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
async function gov24(q, region) {
  let key = (process.env.DATA_GO_KR_KEY || process.env.GOV24_KEY || '').trim();
  if (!key) return { configured: false, items: [] };
  if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key); // URLSearchParams가 다시 인코딩하므로
  const terms = q ? [q] : ['예술', '문화'];
  const seen = new Set(); const items = [];
  for (const term of terms) {
    const u = new URL('https://api.odcloud.kr/api/gov24/v3/serviceList');
    u.searchParams.set('page', '1');
    u.searchParams.set('perPage', '100');
    u.searchParams.set('returnType', 'JSON');
    u.searchParams.set('serviceKey', key);
    u.searchParams.set('cond[서비스명::LIKE]', term);
    const j = await getJSON(u);
    for (const d of j.data || []) {
      if (seen.has(d['서비스ID'])) continue;
      seen.add(d['서비스ID']);
      const org = `${d['소관기관명'] || ''} ${d['접수기관'] || ''}`;
      if (region.names.length && !region.names.some((n) => org.includes(n))) continue;
      items.push({
        src: 'gov24',
        title: clip(d['서비스명'], 80),
        org: clip(d['소관기관명'], 40),
        orgType: clip(d['소관기관유형'], 20),
        summary: clip(d['서비스목적요약'] || d['지원내용'], 160),
        target: clip(d['지원대상'], 120),
        period: clip(d['신청기한'], 60),
        end: lastDate(d['신청기한']),
        url: d['상세조회URL'] || `https://www.gov.kr/portal/rcvfvrSvc/dtlEx/${d['서비스ID']}`,
        updated: clip(d['수정일시'], 10),
      });
    }
  }
  items.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  return { configured: true, items: items.slice(0, 60) };
}

// 2) 온통청년 청년정책 — 전국 + 지자체 청년정책 중 문화·예술 관련
async function youth(q, region) {
  let key = process.env.YOUTH_KEY;
  if (!key) return { configured: false, items: [] };
  if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key);
  const u = new URL('https://www.youthcenter.go.kr/go/ythip/getPlcy');
  u.searchParams.set('apiKeyNm', key);
  u.searchParams.set('rtnType', 'json');
  u.searchParams.set('pageNum', '1');
  u.searchParams.set('pageSize', '100');
  u.searchParams.set('pageType', '1');
  if (q) u.searchParams.set('plcyNm', q);
  if (region.zip.length) u.searchParams.set('zipCd', region.zip.join(','));
  const j = await getJSON(u);
  const r = j.result || j;
  const list = r.youthPolicyList || r.policyList || [];
  const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : ARTS;
  const items = list
    .filter((p) => p && p.plcyNm)
    .filter((p) => re.test(`${p.plcyNm} ${p.plcyKywdNm || ''} ${p.plcyExplnCn || ''} ${p.plcySprtCn || ''} ${p.mclsfNm || ''}`))
    .map((p) => ({
      src: 'youth',
      title: clip(p.plcyNm, 80),
      org: clip(p.sprvsnInstCdNm || p.rgtrInstCdNm || p.operInstCdNm, 40),
      orgType: clip(p.mclsfNm || p.lclsfNm, 20),
      summary: clip(p.plcyExplnCn || p.plcySprtCn, 160),
      target: [p.sprtTrgtMinAge && `만 ${p.sprtTrgtMinAge}세`, p.sprtTrgtMaxAge && `~${p.sprtTrgtMaxAge}세`].filter(Boolean).join(' '),
      period: clip(p.aplyYmd || (p.bizPrdBgngYmd ? `${p.bizPrdBgngYmd}~${p.bizPrdEndYmd || ''}` : ''), 60),
      end: lastDate(p.aplyYmd || p.bizPrdEndYmd),
      url: p.aplyUrlAddr || p.refUrlAddr1 || (p.plcyNo ? `https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${p.plcyNo}` : 'https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch'),
      updated: clip(p.lastMdfcnDt || p.frstRegDt, 10),
    }));
  return { configured: true, items: items.slice(0, 60) };
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
module.exports._test = { gov24, youth, REGIONS, lastDate };
