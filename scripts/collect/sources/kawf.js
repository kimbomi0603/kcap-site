'use strict';
/**
 * 한국예술인복지재단 공지사항
 * https://www.kawf.kr/notice/sub01.do  (pageIndex=N)
 *
 * 특징
 * - 목록에는 등록일(YY.MM.DD)만 있고 접수기간이 없다.
 * - 제목이 공모 성격이면 상세(/notice/sub01View.do?selIdx=)를 열어 본문에서 접수기간을 찾는다.
 */

const L = require('../lib');

const meta = { key: 'kawf', name: '한국예술인복지재단', homepage: 'https://www.kawf.kr' };
const LIST = `${meta.homepage}/notice/sub01.do`;

function parseList($) {
  const rows = [];
  $('.board-list li[role="row"]').each((_, li) => {
    const t = $(li).find('.title.Common_Bbs_Table_Type1_Item');
    if (!t.length) return;
    const idx = t.attr('data-pidx') || t.attr('data-pIdx') || '';
    const pUrl = t.attr('purl') || t.attr('pUrl') || '';
    const title = L.clean(t.text());
    if (!title) return;
    const date = L.clean($(li).find('.date').text());
    const url = pUrl ? L.absUrl(pUrl, meta.homepage) : `${meta.homepage}/notice/sub01View.do?selIdx=${idx}`;
    rows.push({ idx, title, date, url, external: !!pUrl });
  });
  return rows;
}

async function fetchDetail(url) {
  const $ = await L.fetchHtml(url);
  const box = $('.view-con').length ? $('.view-con') : $('.board-wrap');
  return L.textOf($, box);
}

async function collect() {
  const year = new Date().getFullYear();
  const items = new Map();
  let detailCount = 0;

  for (let page = 1; page <= L.PAGE_LIMIT; page++) {
    const $ = await L.safe(() => L.fetchHtml(`${LIST}?pageIndex=${page}`), `kawf p${page}`);
    if (!$) break;
    const rows = parseList($);
    if (!rows.length) break;
    for (const r of rows) {
      if (items.has(r.url)) continue;
      const posted = L.parseDate(r.date, { year });
      const kind = L.classifyKind(r.title);
      let body = r.title;
      let range = L.parseRange(r.title, { year });
      if (kind === '공모' && !r.external && detailCount < L.DETAIL_LIMIT) {
        detailCount++;
        const text = await L.safe(() => fetchDetail(r.url), `kawf detail ${r.idx}`);
        if (text) {
          body = text;
          const rr = L.parseRange(text, { year });
          if (rr.end) range = rr;
        }
      }
      items.set(
        r.url,
        L.makeItem({
          source: meta.key,
          id: r.idx || undefined,
          title: r.title,
          org: meta.name,
          url: r.url,
          posted,
          start: range.start,
          end: range.end,
          body,
          summary: body === r.title ? '' : body,
          kind,
        }),
      );
    }
  }
  return [...items.values()];
}

module.exports = { meta, collect };
