'use strict';
/**
 * 한국콘텐츠진흥원(KOCCA) 지원공고
 * https://www.kocca.kr/kocca/pims/list.do?menuNo=204104&pageIndex=N
 * 열: 구분(모집공모/자유공모/지정공모…) · 제목 · 공고일(YY.MM.DD) · 접수기간(YY.MM.DD ~ YY.MM.DD) · 조회
 */

const L = require('../lib');

const meta = { key: 'kocca', name: '한국콘텐츠진흥원', homepage: 'https://www.kocca.kr' };
const LIST = `${meta.homepage}/kocca/pims/list.do?menuNo=204104`;

async function collect() {
  const year = new Date().getFullYear();
  const items = new Map();
  for (let page = 1; page <= L.PAGE_LIMIT; page++) {
    const $ = await L.safe(() => L.fetchHtml(`${LIST}&pageIndex=${page}`), `kocca p${page}`);
    if (!$) break;
    let n = 0;
    for (const tr of $('table tbody tr').toArray()) {
      const a = $(tr).find('a[href*="pims/view.do"]').first();
      if (!a.length) continue;
      const title = L.clean(a.text());
      const url = L.absUrl(a.attr('href'), LIST);
      if (!title || items.has(url)) continue;
      n++;
      const cell = (label) => L.clean($(tr).find(`td[data-label="${label}"]`).text());
      const category = cell('구분');
      const posted = L.parseDate(cell('공고일'), { year });
      const range = L.parseRange(cell('접수기간'), { year });
      items.set(
        url,
        L.makeItem({
          source: meta.key,
          title,
          org: meta.name,
          url,
          posted,
          start: range.start,
          end: range.end,
          body: title,
          summary: `${meta.name} 지원공고${category ? ` · ${category}` : ''}`,
          tags: (() => {
            const t = L.classifyTags(title);
            return t.includes('전체') ? ['콘텐츠'] : t;
          })(),
          kind: '공모',
        }),
      );
    }
    if (!n) break;
  }
  return [...items.values()];
}

module.exports = { meta, collect };
