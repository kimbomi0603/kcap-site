'use strict';
/**
 * 예술경영지원센터(GOKAMS)
 * - 공지사항   https://www.gokams.or.kr/01_news/notice_list.aspx?page=N
 *   센터 자체 사업공고. 목록에 작성일만 있고 본문은 대부분 PDF/HWP 첨부라 마감은 제목에서만 잡힌다.
 * - 공모ㆍ기금ㆍ행사 https://www.gokams.or.kr/01_news/event_list.aspx?flag=34&page=N
 *   여러 기관의 공모·기금 소식을 모은 게시판. 목록에 주최기관과 기간("2026-10-01 ~ 10-24")이 있다.
 */

const L = require('../lib');

const meta = { key: 'gokams', name: '예술경영지원센터', homepage: 'https://www.gokams.or.kr' };
const NOTICE = `${meta.homepage}/01_news/notice_list.aspx`;
const EVENT = `${meta.homepage}/01_news/event_list.aspx`;

async function fetchNoticeDetail(url) {
  const $ = await L.fetchHtml(url);
  // 본문 영역이 정형화돼 있지 않아 제목 이후 텍스트에서 라벨을 찾는다.
  const cont = $('.board_view, .boardView, .view_con, .con, #contents').first();
  const text = cont.length ? L.textOf($, cont) : L.textOf($, $('body'));
  return text;
}

async function collectNotices(items, year) {
  let detailCount = 0;
  for (let page = 1; page <= 2; page++) {
    const $ = await L.safe(() => L.fetchHtml(`${NOTICE}?page=${page}`), `gokams notice p${page}`);
    if (!$) break;
    let n = 0;
    for (const tr of $('table tbody tr').toArray()) {
      const a = $(tr).find('a[href*="notice_view.aspx"]').first();
      if (!a.length) continue;
      const title = L.clean(a.text());
      const url = L.absUrl(a.attr('href'), NOTICE);
      if (!title || items.has(url)) continue;
      n++;
      const tds = $(tr).find('td').map((_, td) => L.clean($(td).text())).get();
      const posted = L.parseDate(tds.find((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)) || '', { year });
      const kind = L.classifyKind(title);
      let range = L.parseRange(title, { year });
      let body = title;
      if (kind === '공모' && !range.end && detailCount < 10) {
        detailCount++;
        const text = await L.safe(() => fetchNoticeDetail(url), `gokams detail ${url}`);
        if (text) {
          const i = text.indexOf(title);
          body = (i >= 0 ? text.slice(i + title.length) : text)
            // "공지사항 내용 담당부서 X 작성일 YYYY-MM-DD 조회수 N 파일 ..." 머리말 제거
            .replace(/^\s*공지사항\s*내용\s*담당부서.*?조회수\s*\d+\s*/s, '')
            .replace(/^\s*파일(\s+\S+\.(pdf|hwp|hwpx|docx?|xlsx?|zip|jpg|png))+\s*/i, '')
            .trim();
          body = `${title}\n${body}`;
          const rr = L.parseRange(body.slice(0, 3000), { year });
          if (rr.end) range = rr;
        }
      }
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
          body,
          summary: body === title ? '' : body.slice(title.length + 1, title.length + 400),
          kind,
        }),
      );
    }
    if (!n) break;
  }
}

async function collectEvents(items, year) {
  for (let page = 1; page <= L.PAGE_LIMIT; page++) {
    const $ = await L.safe(() => L.fetchHtml(`${EVENT}?flag=34&page=${page}`), `gokams event p${page}`);
    if (!$) break;
    let n = 0;
    for (const tr of $('table tbody tr').toArray()) {
      const a = $(tr).find('a[href*="event_view.aspx"]').first();
      if (!a.length) continue;
      const tds = $(tr).find('td');
      const category = L.clean(tds.eq(1).find('img').attr('alt') || '');
      const title = L.clean(a.text());
      const url = L.absUrl(a.attr('href'), EVENT);
      if (!title || items.has(url)) continue;
      n++;
      const org = L.clean(tds.eq(3).text());
      const period = L.clean(tds.eq(4).text());
      const range = L.parseRange(period, { year });
      items.set(
        url,
        L.makeItem({
          source: meta.key,
          title,
          org,
          url,
          start: range.start,
          end: range.end,
          body: `${title} ${org}`,
          summary: `${org} · ${category}${period ? ` · ${period}` : ''}`,
          kind: /공모|기금/.test(category) ? '공모' : L.classifyKind(title),
        }),
      );
    }
    if (!n) break;
  }
}

async function collect() {
  const year = new Date().getFullYear();
  const items = new Map();
  await collectNotices(items, year);
  await collectEvents(items, year);
  return [...items.values()];
}

module.exports = { meta, collect };
