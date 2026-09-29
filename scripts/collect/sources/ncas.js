'use strict';
/**
 * 국가문화예술지원시스템(NCAS)
 * https://www.ncas.or.kr
 *
 * 특징
 * - 지원사업 목록 페이지(/support/main/list)는 로그인이 필요하다.
 * - 대신 첫 화면에 "진행중 / 오늘마감 / 전체 지원사업" 표가 서버에서 그대로 렌더링된다.
 *   (전체 탭: 주관기관 · 상태 · 사업명 · 시작일시 · 마감일시 · 신청대상 · 신청분야 · 상세보기 링크)
 * - 상세보기 버튼의 onclick window.open('...') 에서 원 공고 URL을 꺼낸다.
 */

const L = require('../lib');

const meta = { key: 'ncas', name: '국가문화예술지원시스템', homepage: 'https://www.ncas.or.kr' };

const FIELD_TAGS = [
  ['시각', /시각|미술|공예|사진|건축|디자인/],
  ['공연', /음악|무용|연극|뮤지컬|전통|국악|공연|다원/],
  ['문학', /문학/],
  ['콘텐츠', /콘텐츠|영상|미디어|디자인/],
  ['교육', /교육/],
];

function tagsFromField(field, title) {
  const out = [];
  for (const [tag, re] of FIELD_TAGS) if (re.test(field)) out.push(tag);
  if (out.length) return out;
  return L.classifyTags(title);
}

function whoFromTarget(target) {
  const out = [];
  if (/개인/.test(target)) out.push('개인');
  if (/단체|법인|기관/.test(target)) out.push('단체');
  return out;
}

async function collect() {
  const year = new Date().getFullYear();
  const $ = await L.fetchHtml(meta.homepage + '/');
  const items = new Map();

  // 세 탭 모두 훑되 '전체' 탭(tab1_03)이 가장 넓다. 같은 사업은 URL로 중복 제거.
  $('.proj_list_box .tab__cont').each((_, tab) => {
    $(tab)
      .find('tbody tr[data-item]')
      .each((__, tr) => {
        let info = {};
        try {
          info = JSON.parse($(tr).attr('data-item') || '{}');
        } catch {
          /* ignore */
        }
        const cells = $(tr)
          .find('td')
          .map((___, td) => L.clean($(td).text()))
          .get();
        // 열 구성: [기관, (상태), 사업명, 시작, 마감, 대상, 분야, 상세]
        let idx = 0;
        const org = cells[idx++] || info.instNm || '';
        let status = info.prgsStatus || '';
        if (cells.length >= 8) status = cells[idx++] || status;
        const title = cells[idx++] || '';
        const startTxt = cells[idx++] || '';
        const endTxt = cells[idx++] || '';
        const target = cells[idx++] || '';
        const field = cells[idx++] || '';
        if (!title) return;

        let url = '';
        $(tr)
          .find('button[onclick]')
          .each((___, b) => {
            const m = /window\.open\('([^']+)'/.exec($(b).attr('onclick') || '');
            if (m && !url) url = m[1].replace(/&amp;/g, '&');
          });
        if (!url) url = meta.homepage + '/';

        const key = `${org}|${title}`;
        if (items.has(key)) return;
        const start = L.parseDate(startTxt, { year });
        const end = L.parseDate(endTxt.replace(/\(D-\d+\)/g, ''), { year });
        items.set(
          key,
          L.makeItem({
            source: meta.key,
            id: url === meta.homepage + '/' ? L.stableIdFromUrl(key) : undefined,
            title,
            org,
            url,
            start,
            end,
            who: whoFromTarget(target),
            tags: tagsFromField(field, title),
            summary: `${org} · 대상 ${target || '-'} · 분야 ${field || '-'}${status ? ` · ${status}` : ''}`,
            body: `${title} ${target} ${field}`,
            kind: '공모',
          }),
        );
      });
  });

  return [...items.values()];
}

module.exports = { meta, collect };
