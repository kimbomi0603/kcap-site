'use strict';
/**
 * 한국문화예술위원회(ARKO) 공모 게시판
 * https://www.arko.or.kr/board/list/4013?bid=463
 *
 * 특징
 * - 기본 목록에는 접수기간이 비어 있다. dateLocation=now(진행중) / after(예정) 필터를 주면
 *   목록에 "2026.07.15 ~ 2026.09.30" 형태의 접수기간이 채워진다.
 * - 항목 상당수가 아트누리(artnuri.or.kr) 외부 링크다. 외부 링크는 상세를 열지 않는다.
 * - 기본 목록(최근순) 1페이지는 접수기간이 없으므로 arko.or.kr 상세를 열어 등록일/본문에서 보충한다.
 */

const L = require('../lib');

const meta = { key: 'arko', name: '한국문화예술위원회', homepage: 'https://www.arko.or.kr' };
const BASE = 'https://www.arko.or.kr';
const LIST = `${BASE}/board/list/4013?bid=463&sf_icon_category=cw00000019`;

function parseList($) {
  const rows = [];
  $('ul.cardBdList > li').each((_, li) => {
    const a = $(li).find('a').first();
    const href = a.attr('href') || '';
    if (!href || href.startsWith('javascript')) return;
    const title = L.clean(a.find('.tit').text());
    if (!title) return;
    const con = L.clean(a.find('.con').text());
    const date = L.clean(a.find('.date').text());
    const state = L.clean(a.find('.state').text());
    rows.push({ href: L.absUrl(href, BASE), title, con, date, state });
  });
  return rows;
}

/** arko.or.kr 내부 상세: 등록일(#writedate) + 본문(#contBody) */
async function fetchDetail(url) {
  const $ = await L.fetchHtml(url);
  const posted = L.parseDate($('#writedate').text());
  const body = L.textOf($, $('#contBody').length ? $('#contBody') : $('.viewCont'));
  return { posted, body, range: L.parseRange(body, { year: new Date().getFullYear() }) };
}

/**
 * 아트누리(artnuri.or.kr) 상세: 위원회 공모 상당수가 여기로 연결된다.
 * 본문에 "신청기간 / 지원대상 / 지역 / 분야" 라벨이 줄 단위로 나온다.
 */
async function fetchArtnuriDetail(url) {
  const $ = await L.fetchHtml(url);
  const text = L.textOf($, $('body'));
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const after = (label, n = 1) => {
    const i = lines.findIndex((l) => l === label);
    return i >= 0 ? lines.slice(i + 1, i + 1 + n).join(' ') : '';
  };
  const period = after('신청기간');
  const target = after('지원대상');
  const region = after('지역');
  // 분야는 첨부파일 라벨 전까지 여러 줄
  let field = '';
  const fi = lines.findIndex((l) => l === '분야');
  if (fi >= 0) {
    const stop = lines.findIndex((l, j) => j > fi && /^(첨부파일|문의처|목록보기|위 사업에)/.test(l));
    field = lines.slice(fi + 1, stop > fi ? Math.min(stop, fi + 12) : fi + 8).join(' ');
  }
  const range = L.parseRange(period, { year: new Date().getFullYear() });
  const who = [];
  if (/개인/.test(target)) who.push('개인');
  if (/단체|법인|기관/.test(target)) who.push('단체');
  return {
    posted: '',
    body: `${target} ${region} ${field} ${period}`,
    range,
    who,
    tags: field ? L.classifyTags(field) : undefined,
    reg: /^(해외|전국)$/.test(region) || !region ? undefined : L.classifyReg(region),
  };
}

async function collect() {
  const year = new Date().getFullYear();
  const seen = new Map();

  // 1) 진행중 + 예정 (접수기간이 목록에 나온다). 각 최대 PAGE_LIMIT 페이지.
  for (const loc of ['now', 'after']) {
    for (let page = 1; page <= L.PAGE_LIMIT; page++) {
      const $ = await L.safe(() => L.fetchHtml(`${LIST}&dateLocation=${loc}&page=${page}`), `arko ${loc} p${page}`);
      if (!$) break;
      const rows = parseList($);
      if (!rows.length) break;
      for (const r of rows) {
        if (seen.has(r.href)) continue;
        const { start, end } = L.parseRange(r.date, { year });
        seen.set(
          r.href,
          L.makeItem({
            source: meta.key,
            title: r.title,
            org: meta.name,
            url: r.href,
            start,
            end,
            summary: r.con,
            body: `${r.title} ${r.con}`,
            kind: '공모',
          }),
        );
      }
      // 총 페이지 수를 넘기면 중단
      const total = +(/총 게시물\s*<span[^>]*>(\d+)/.exec($.html()) || [])[1] || 0;
      if (rows.length * page >= total) break;
    }
  }

  // 2) 기본 목록 1페이지 (최근 게시물, 접수기간 없음) → 내부 링크만 상세 보강
  const $recent = await L.safe(() => L.fetchHtml(`${LIST}&page=1`), 'arko recent');
  if ($recent) {
    let detailCount = 0;
    for (const r of parseList($recent)) {
      if (seen.has(r.href)) continue;
      let posted = '';
      let body = `${r.title} ${r.con}`;
      let range = L.parseRange(r.title, { year });
      let extra = {};
      const isInternal = r.href.startsWith(BASE);
      const isArtnuri = /artnuri\.or\.kr/.test(r.href);
      if ((isInternal || isArtnuri) && detailCount < L.DETAIL_LIMIT) {
        detailCount++;
        const d = await L.safe(
          () => (isInternal ? fetchDetail(r.href) : fetchArtnuriDetail(r.href)),
          `arko detail ${r.href}`,
        );
        if (d) {
          posted = d.posted || '';
          if (d.body) body = `${r.title} ${r.con} ${d.body}`;
          if (d.range && d.range.end) range = d.range;
          extra = { who: d.who, tags: d.tags, reg: d.reg };
        }
      }
      seen.set(
        r.href,
        L.makeItem({
          source: meta.key,
          title: r.title,
          org: meta.name,
          url: r.href,
          posted,
          start: range.start,
          end: range.end,
          summary: r.con,
          body,
          ...extra,
        }),
      );
    }
  }

  return [...seen.values()];
}

module.exports = { meta, collect };
