'use strict';
/**
 * 한국문화예술교육진흥원(ARTE)
 * - 사업공모 https://arte.or.kr/notice/business/notice/Business_BoardList.do?page_no=N
 *   열: No · 제목 · 상태(진행중/마감) · 접수시작일 · 접수마감일 · 조회수
 * - 공지사항 https://arte.or.kr/information/notice/Notice_BoardList.do
 *   열: No · 제목 · 담당부서 · 등록일. 모집 공지가 섞여 있어 제목이 공모 성격이면 상세 본문을 본다.
 * 상세 URL: .../Business_BoardView.do?board_id=BRD_ID... / .../Notice_BoardView.do?board_id=...
 */

const L = require('../lib');

const meta = { key: 'arte', name: '한국문화예술교육진흥원', homepage: 'https://arte.or.kr' };
const BIZ_LIST = `${meta.homepage}/notice/business/notice/Business_BoardList.do`;
const BIZ_VIEW = `${meta.homepage}/notice/business/notice/Business_BoardView.do`;
const NOTICE_LIST = `${meta.homepage}/information/notice/Notice_BoardList.do`;
const NOTICE_VIEW = `${meta.homepage}/information/notice/Notice_BoardView.do`;

function boardId(a) {
  const m = /fnView\('([^']+)'\)/.exec(a.attr('href') || '');
  return m ? m[1] : '';
}

async function fetchDetail(url) {
  const $ = await L.fetchHtml(url);
  const box = $('.board_view .comm_view').length ? $('.board_view .comm_view') : $('.board_view');
  return L.textOf($, box);
}

async function collectBusiness(items, year) {
  for (let page = 1; page <= L.PAGE_LIMIT; page++) {
    const $ = await L.safe(() => L.fetchHtml(`${BIZ_LIST}?page_no=${page}`), `arte biz p${page}`);
    if (!$) break;
    let n = 0;
    for (const tr of $('table tbody tr').toArray()) {
      const a = $(tr).find('a').first();
      const id = boardId(a);
      if (!id) continue;
      const tds = $(tr).find('td').map((_, td) => L.clean($(td).text())).get();
      const title = L.clean(a.text());
      const url = `${BIZ_VIEW}?board_id=${id}`;
      if (!title || items.has(url)) continue;
      n++;
      const status = tds[2] || '';
      const start = L.parseDate(tds[3] || '', { year });
      const end = L.parseDate(tds[4] || '', { year });
      items.set(
        url,
        L.makeItem({
          source: meta.key,
          id,
          title,
          org: meta.name,
          url,
          posted: start,
          start,
          end,
          body: title,
          summary: `${meta.name} 사업공모${status ? ` · ${status}` : ''}`,
          kind: '공모',
        }),
      );
    }
    if (!n) break;
  }
}

async function collectNotices(items, year) {
  let detailCount = 0;
  for (let page = 1; page <= 2; page++) {
    const $ = await L.safe(() => L.fetchHtml(`${NOTICE_LIST}?page_no=${page}`), `arte notice p${page}`);
    if (!$) break;
    let n = 0;
    for (const tr of $('table tbody tr').toArray()) {
      const a = $(tr).find('a').first();
      const id = boardId(a);
      if (!id) continue;
      const tds = $(tr).find('td').map((_, td) => L.clean($(td).text())).get();
      const title = L.clean(a.text());
      const url = `${NOTICE_VIEW}?board_id=${id}`;
      if (!title || items.has(url)) continue;
      n++;
      const dept = tds[2] || '';
      const posted = L.parseDate(tds[3] || '', { year });
      const kind = L.classifyKind(title);
      let range = L.parseRange(title, { year });
      let body = title;
      if (kind === '공모' && !range.end && detailCount < L.DETAIL_LIMIT) {
        detailCount++;
        const text = await L.safe(() => fetchDetail(url), `arte detail ${id}`);
        if (text) {
          body = text;
          const rr = L.parseRange(text, { year });
          if (rr.end) range = rr;
        }
      }
      items.set(
        url,
        L.makeItem({
          source: meta.key,
          id,
          title,
          org: meta.name,
          url,
          posted,
          start: range.start,
          end: range.end,
          body,
          summary: body === title ? `${meta.name} 공지${dept ? ` · ${dept}` : ''}` : body,
          kind,
        }),
      );
    }
    if (!n) break;
  }
}

async function collect() {
  const year = new Date().getFullYear();
  const items = new Map();
  await collectBusiness(items, year);
  await collectNotices(items, year);
  return [...items.values()];
}

module.exports = { meta, collect };
