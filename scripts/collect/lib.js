'use strict';
/**
 * 공모 자동 수집 공용 라이브러리
 * - fetchText / fetchHtml : 타임아웃·재시도가 있는 fetch 래퍼 (Node 20 내장 fetch)
 * - 날짜 파서            : parseDate / findDates / parseRange
 * - 분류 헬퍼            : classifyWho / classifyAge / classifyTags / classifyReg / classifyKind
 * - 아이템 생성          : makeItem (스키마 정규화)
 */

const cheerio = require('cheerio');
const crypto = require('crypto');

const DEFAULT_TIMEOUT = 10000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 kcap-collector/1.0';

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------

/**
 * URL을 받아 텍스트를 돌려준다. 10초 타임아웃, 실패 시 1회 재시도.
 * 인코딩이 UTF-8이 아닌 사이트(EUC-KR 등)는 `encoding` 옵션으로 지정.
 */
async function fetchText(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, headers = {}, method = 'GET', body, retries = 1, encoding } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        body,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'ko-KR,ko;q=0.9,en;q=0.5',
          ...headers,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (encoding) return new TextDecoder(encoding).decode(buf);
      // content-type charset을 존중하고, 없으면 meta charset을 살핀다.
      const ct = res.headers.get('content-type') || '';
      const m = /charset=([\w-]+)/i.exec(ct);
      let cs = m ? m[1].toLowerCase() : '';
      if (!cs) {
        const head = buf.subarray(0, 4096).toString('latin1');
        const mm = /charset=["']?([\w-]+)/i.exec(head);
        if (mm) cs = mm[1].toLowerCase();
      }
      if (cs && cs !== 'utf-8' && cs !== 'utf8') {
        try {
          return new TextDecoder(cs).decode(buf);
        } catch {
          /* fall through */
        }
      }
      return buf.toString('utf8');
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(500);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function fetchHtml(url, opts) {
  const html = await fetchText(url, opts);
  return cheerio.load(html);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// 텍스트 유틸
// ---------------------------------------------------------------------------

function clean(s) {
  return String(s || '')
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** cheerio 요소의 텍스트를 줄바꿈을 살려 뽑는다 (본문 파싱용). */
function textOf($, el) {
  const html = $(el).html() || '';
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|dd|dt)>/gi, '\n');
  return cheerio
    .load(`<div>${withBreaks}</div>`)('div')
    .text()
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function absUrl(href, base) {
  if (!href) return '';
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

function truncate(s, n = 160) {
  s = clean(s);
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

/** URL에서 안정적인 id를 뽑는다. 게시글 번호 파라미터 우선, 없으면 해시. */
function stableIdFromUrl(url) {
  try {
    const u = new URL(url);
    const keys = ['cid', 'Idx', 'idx', 'selIdx', 'board_id', 'intcNo', 'docid', 'bbsSn', 'nttId', 'seq', 'no', 'id', 'key'];
    for (const k of keys) {
      const v = u.searchParams.get(k);
      if (v && /^[\w-]{1,40}$/.test(v)) return v;
    }
    const m = /\/(\d{3,})(?:\/|\.\w+)?$/.exec(u.pathname);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 10);
}

// ---------------------------------------------------------------------------
// 날짜 파서
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0');

function validYMD(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  if (!(y >= 2000 && y <= 2100)) return false;
  return true;
}

function fmt(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** 날짜 파싱 전 잡음 제거: 요일 괄호, 전각 문자, 시각 등 */
function normalizeDateText(text) {
  return String(text || '')
    .replace(/ /g, ' ')
    .replace(/[～〜]/g, '~')
    .replace(/[．]/g, '.')
    .replace(/[－–—]/g, '-')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/\(\s*[월화수목금토일]\s*(?:요일)?\s*\)/g, ' ') // (수) (월요일)
    .replace(/\d{1,2}\s*:\s*\d{2}/g, ' ') // 16:00 같은 시각
    .replace(/[ \t]+/g, ' ');
}

/**
 * 텍스트 안의 날짜 토큰을 위치와 함께 모두 찾는다.
 * 토큰: { y, m, d, index, end, full }  (y는 없을 수 있음)
 */
function findDates(text) {
  const t = normalizeDateText(text);
  const out = [];
  // 1) 연-월-일 (4자리 연도): 2026.10.15 / 2026-10-15 / 2026/10/15 / 2026년 10월 15일 / 2026. 9. 29.
  const reFull =
    /(?<![\d.])((?:19|20)\d{2})\s*(?:년|[.\-/])\s*(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})\s*(?:일)?\.?(?!\d)/g;
  // 2) 두 자리 연도: 26.09.17 / 26-09-17
  const reShortY = /(?<![\d.])(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?(?![\d.])/g;
  // 3) 월.일 / 월-일 / 월월 일일: 10.15 / 10. 30. / 10월 30일 / 10-24
  const reMD = /(?<![\d.\-])(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})\s*(?:일)?\.?(?![\d.]|\s*[.\-/]\s*\d)/g;

  const taken = [];
  const overlaps = (a, b) => taken.some(([s, e]) => a < e && b > s);

  let m;
  while ((m = reFull.exec(t))) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (!validYMD(y, mo, d)) continue;
    out.push({ y, m: mo, d, index: m.index, end: m.index + m[0].length, full: true });
    taken.push([m.index, m.index + m[0].length]);
  }
  while ((m = reShortY.exec(t))) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const yy = +m[1], mo = +m[2], d = +m[3];
    // 앞 두 자리가 월로 해석될 수 없거나(>12), 세 토막이 모두 있을 때만 연도로 본다.
    const y = 2000 + yy;
    if (!validYMD(y, mo, d)) continue;
    if (yy <= 12 && d > 12 && mo <= 12) {
      // 08.09.17 같은 모호한 경우: 최근 연도 범위(20~40)면 연도로 본다.
      if (yy < 20 || yy > 40) continue;
    }
    out.push({ y, m: mo, d, index: m.index, end: m.index + m[0].length, full: true });
    taken.push([m.index, m.index + m[0].length]);
  }
  while ((m = reMD.exec(t))) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const mo = +m[1], d = +m[2];
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
    // "1.5배" 같은 소수 오탐 방지: 뒤에 한글 단위가 바로 붙으면 제외
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (/[배%명개건원회차]/.test(after)) continue;
    out.push({ y: null, m: mo, d, index: m.index, end: m.index + m[0].length, full: false });
    taken.push([m.index, m.index + m[0].length]);
  }
  out.sort((a, b) => a.index - b.index);
  return { text: t, tokens: out };
}

/** 단일 날짜 문자열 → YYYY-MM-DD ('' if none). */
function parseDate(text, { year } = {}) {
  const { tokens } = findDates(text);
  if (!tokens.length) return '';
  const tk = tokens[0];
  const y = tk.y || year || new Date().getFullYear();
  return validYMD(y, tk.m, tk.d) ? fmt(y, tk.m, tk.d) : '';
}

const RANGE_LABEL =
  /(접수\s*기간|신청\s*기간|모집\s*기간|공모\s*기간|응모\s*기간|접수\s*일정|신청\s*일정|접수\s*및\s*신청|접수\s*:|신청\s*:|접수\s*마감|신청\s*마감|마감\s*일?|마감\s*:|~\s*까지|까지)/g;

/**
 * 텍스트에서 접수 시작/마감을 추정한다.
 * 우선순위: 라벨(접수기간/신청기간/마감…) 뒤 → '~'가 있는 범위 → 첫 날짜 두 개.
 * 연도가 없는 토큰은 앞 토큰의 연도 → 옵션 year → 현재 연도 순으로 채운다.
 * 마감 월이 시작 월보다 작으면 다음 해로 본다.
 * @returns {{start:string,end:string}}
 */
function parseRange(text, { year } = {}) {
  const { text: t, tokens } = findDates(text);
  const baseYear = year || new Date().getFullYear();
  if (!tokens.length) return { start: '', end: '' };

  const yearOf = (tk, fallback) => tk.y || fallback;

  // 후보 구간을 정한다: 라벨이 있으면 라벨 뒤 ~120자
  const segments = [];
  const labelRe = new RegExp(RANGE_LABEL.source, 'g');
  let lm;
  while ((lm = labelRe.exec(t))) {
    segments.push({ from: lm.index, to: lm.index + lm[0].length + 120, label: lm[0] });
  }

  const inSeg = (seg) => tokens.filter((tk) => tk.index >= seg.from - 25 && tk.index < seg.to);

  // 라벨 뒤에서 범위 찾기 (기간 라벨 우선, 마감 라벨은 end만)
  const isEndOnlyLabel = (label) => /마감|까지/.test(label) && !/기간|일정/.test(label);
  const periodSegs = segments.filter((s) => !isEndOnlyLabel(s.label));
  const endSegs = segments.filter((s) => isEndOnlyLabel(s.label));

  const pickRange = (tks, sliceFrom) => {
    if (!tks.length) return null;
    const a = tks[0];
    const between = (x, y) => t.slice(x.end, y.index);
    if (tks.length >= 2 && /^[\s~\-부터]*(?:\s*\(.*?\))?\s*[~\-부터]?\s*$/.test(between(a, tks[1])) && /[~\-부터]/.test(between(a, tks[1]))) {
      const b = tks[1];
      let sy = yearOf(a, baseYear);
      let ey = yearOf(b, sy);
      if (!b.y && b.m < a.m) ey = sy + 1;
      if (!a.y && b.y && a.m > b.m) sy = ey - 1;
      return { start: fmt(sy, a.m, a.d), end: fmt(ey, b.m, b.d) };
    }
    // '~ 10.30' 처럼 물결표가 앞에만 있으면 마감만
    const before = t.slice(Math.max(0, a.index - 6), a.index);
    if (/~\s*$/.test(before) || /까지|마감/.test(t.slice(a.end, a.end + 8))) {
      return { start: '', end: fmt(yearOf(a, baseYear), a.m, a.d) };
    }
    if (sliceFrom === 'label') {
      // 라벨 바로 뒤 단일 날짜: 기간 라벨이면 시작일로 보기 애매하므로 마감으로 본다.
      return { start: '', end: fmt(yearOf(a, baseYear), a.m, a.d) };
    }
    return null;
  };

  for (const seg of periodSegs) {
    const r = pickRange(inSeg(seg).filter((tk) => tk.index >= seg.from), 'label');
    if (r && (r.start || r.end)) return r;
  }
  for (const seg of endSegs) {
    const tks = inSeg(seg);
    // '10.30(금)까지' 처럼 라벨이 날짜 뒤에 오는 경우
    const beforeLabel = tks.filter((tk) => tk.end <= seg.from + 3 && tk.index >= seg.from - 25);
    const afterLabel = tks.filter((tk) => tk.index >= seg.from);
    // '10.30까지'는 날짜가 라벨 앞에, '마감: 10.30'은 라벨 뒤에 온다.
    const isKkaji = /까지/.test(seg.label);
    const tk = isKkaji
      ? beforeLabel[beforeLabel.length - 1] || afterLabel[0]
      : afterLabel[0] || beforeLabel[beforeLabel.length - 1];
    if (tk) {
      if (!isKkaji) {
        // 마감 라벨 뒤에 범위가 있으면 범위로
        const r = pickRange(afterLabel, 'label');
        if (r && r.start) return r;
      }
      return { start: '', end: fmt(yearOf(tk, baseYear), tk.m, tk.d) };
    }
  }

  // 라벨 없음: 전체에서 첫 '~' 범위
  for (let i = 0; i < tokens.length; i++) {
    const r = pickRange(tokens.slice(i, i + 2), 'any');
    if (r) return r;
  }
  // 라벨도 물결표도 없고 날짜가 딱 하나면 그 날짜를 마감으로 본다 (제목 등 짧은 문자열용)
  if (tokens.length === 1 && t.length <= 120) {
    const tk = tokens[0];
    return { start: '', end: fmt(yearOf(tk, baseYear), tk.m, tk.d) };
  }
  return { start: '', end: '' };
}

// ---------------------------------------------------------------------------
// 분류 헬퍼
// ---------------------------------------------------------------------------

const WHO_INDIVIDUAL = /예술인|예술가|작가|개인(?!정보)|창작자|아티스트|청년|신진|참가자|수강|인력|큐레이터|기획자|디자이너|감독/;
const WHO_GROUP = /단체|법인|기관|기업|극단|사업자|브랜드|컴퍼니|협동조합|스타트업|공연장|미술관|갤러리|협회/;

function classifyWho(text) {
  const t = clean(text);
  const ind = WHO_INDIVIDUAL.test(t);
  const grp = WHO_GROUP.test(t);
  const out = [];
  if (ind) out.push('개인');
  if (grp) out.push('단체');
  return out;
}

function classifyAge(text) {
  const t = clean(text).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
  let m = /만\s*(\d{2})\s*세\s*(이하|미만|까지)/.exec(t) || /(\d{2})\s*세\s*(이하|미만|까지)/.exec(t);
  if (m) {
    const n = +m[1];
    return m[2] === '미만' ? n - 1 : n;
  }
  m = /만?\s*\d{1,2}\s*세?\s*[~\-]\s*(?:만\s*)?(\d{2})\s*세/.exec(t);
  if (m) return +m[1];
  return null;
}

const TAG_RULES = [
  ['시각', /시각|미술|회화|조각|공예|사진|설치|전시|갤러리|큐레이|판화|드로잉|미디어아트|아트페어/],
  ['공연', /공연|음악|연극|무용|국악|뮤지컬|오페라|극단|밴드|재즈|클래식|축제|전통예술|서커스|연주/],
  ['문학', /문학|출판|시인|소설|문예|희곡|번역|작문|글쓰기|북/],
  ['콘텐츠', /콘텐츠|미디어|디자인|영상|게임|웹툰|애니메이션|만화|방송|영화|음원|패션|캐릭터|기술융합|AI|메타버스/i],
  ['교육', /교육|강좌|강의|아카데미|워크숍|워크샵|연수|특강|교육사/],
];

function classifyTags(text) {
  const t = clean(text);
  const out = [];
  for (const [tag, re] of TAG_RULES) if (re.test(t)) out.push(tag);
  return out.length ? out : ['전체'];
}

const REGIONS = [
  ['서울', /서울/],
  ['부산', /부산/],
  ['대구', /대구/],
  ['인천', /인천/],
  ['광주', /광주/],
  ['대전', /(?<!공모|미술|사진|드로잉|디자인|공예|음악|서예|문학)대전/],
  ['울산', /울산/],
  ['세종', /세종(?!문화회관)/],
  ['경기', /경기(?!장|침체|회복|불황|악화|여건|상황|전망)/],
  ['강원', /강원/],
  ['충북', /충북|충청북도/],
  ['충남', /충남|충청남도/],
  ['전북', /전북|전라북도/],
  ['전남', /전남|전라남도/],
  ['경북', /경북|경상북도/],
  ['경남', /경남|경상남도/],
  ['제주', /제주/],
];

/**
 * 지역 추정. '전국'이 명시되거나 아무 시·도도 안 나오면 '전국'.
 * 제목을 우선 보고, 없으면 본문에서 찾는다 (본문에는 주소 등이 섞여 오탐이 많다).
 */
function classifyReg(title, body = '') {
  const t = clean(title);
  if (/전국/.test(t)) return '전국';
  for (const [name, re] of REGIONS) if (re.test(t)) return name;
  const b = clean(body).slice(0, 400);
  if (/전국/.test(b)) return '전국';
  for (const [name, re] of REGIONS) if (re.test(b)) return name;
  return '전국';
}

const KIND_NOTICE = /결과|용역|우선협상|수상작|당첨|\[신청\s*마감\]|\[마감\]|사칭|주의|선정\s*(자|작|단체|기관)?\s*(발표|안내|공고)|합격자|심의\s*결과|심사\s*결과|당선|채용|입찰|견적|낙찰|마감\s*안내|종료\s*안내|연기\s*안내|취소|정산|보고서\s*제출|설명회\s*자료|질의응답|FAQ|시상식|개최\s*안내|안내문|운영\s*안내|이용\s*안내|휴관|점검/;
const KIND_CALL = /공모|모집|신청|지원\s*사업|지원사업|접수|응모|참가|참여|선발|공고|출품|지원/;

function classifyKind(title, body = '') {
  const t = clean(title);
  if (KIND_NOTICE.test(t)) return '공지';
  if (KIND_CALL.test(t)) return '공모';
  const b = clean(body).slice(0, 600);
  if (/접수\s*기간|신청\s*기간|모집\s*기간|접수\s*마감|신청\s*방법|접수\s*방법/.test(b)) return '공모';
  return '공지';
}

// ---------------------------------------------------------------------------
// 아이템 정규화
// ---------------------------------------------------------------------------

const WHO_ALLOWED = new Set(['개인', '단체']);
const TAG_ALLOWED = new Set(['시각', '공연', '문학', '콘텐츠', '교육', '전체']);
const REG_ALLOWED = new Set(['전국', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']);

/**
 * 부분 정보를 받아 스키마에 맞는 아이템을 만든다.
 * 필수: source, title, url. 나머지는 없으면 제목/본문에서 추정한다.
 */
function makeItem(p) {
  const source = p.source;
  const title = clean(p.title);
  const url = p.url || '';
  const body = p.body || '';
  const ctx = `${title} ${clean(body).slice(0, 1500)}`;
  // 제목을 먼저 보고, 제목에서 아무것도 못 얻을 때만 본문(앞부분)을 본다. 긴 본문은 과잉 태깅을 부른다.
  const bodyHead = clean(body).slice(0, 600);
  const who = (p.who && p.who.length ? p.who : classifyWho(title).length ? classifyWho(title) : classifyWho(bodyHead)).filter(
    (w) => WHO_ALLOWED.has(w),
  );
  const titleTags = classifyTags(title);
  let tags = (p.tags && p.tags.length ? p.tags : titleTags.includes('전체') ? classifyTags(bodyHead) : titleTags).filter((t) =>
    TAG_ALLOWED.has(t),
  );
  if (!tags.length) tags = ['전체'];
  const reg = REG_ALLOWED.has(p.reg) ? p.reg : classifyReg(title, body);
  return {
    id: `${source}-${p.id || stableIdFromUrl(url)}`,
    title,
    org: clean(p.org),
    url,
    posted: p.posted || '',
    start: p.start || '',
    end: p.end || '',
    who,
    age: p.age !== undefined && p.age !== null ? p.age : classifyAge(ctx),
    tags,
    reg,
    summary: truncate(p.summary || body || '', 160),
    source,
    kind: p.kind || classifyKind(title, body),
  };
}

/** 여러 페이지를 돌 때 쓰는 안전 실행: 실패해도 빈 배열. */
async function safe(fn, label = '') {
  try {
    return await fn();
  } catch (e) {
    if (process.env.COLLECT_DEBUG) console.error(`[warn] ${label}: ${e.message}`);
    return null;
  }
}

module.exports = {
  fetchText,
  fetchHtml,
  cheerio,
  sleep,
  clean,
  textOf,
  absUrl,
  truncate,
  stableIdFromUrl,
  normalizeDateText,
  findDates,
  parseDate,
  parseRange,
  classifyWho,
  classifyAge,
  classifyTags,
  classifyReg,
  classifyKind,
  makeItem,
  safe,
  DETAIL_LIMIT: 15,
  PAGE_LIMIT: 3,
};
