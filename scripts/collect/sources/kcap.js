'use strict';
/**
 * 협회 추천·확인 공모 — data/picks.csv (기본) 또는 구글시트 '웹에 게시' CSV (환경변수 PICKS_SHEET_CSV)
 * 열 순서(헤더 필수): id,제목,주관기관,링크,신청주체,나이상한,분야,지역,접수시작,접수마감,접수시기(매년),대상설명,메모
 *   - 신청주체: "개인 단체" 처럼 공백 구분. 분야: 시각/공연/문학/콘텐츠/교육/전체 공백 구분
 *   - 접수시작/접수마감: YYYY-MM-DD (알면 적는다). 접수시기(매년): "9 10" 처럼 달 번호 공백 구분
 * 협회 담당자는 시트만 고치면 다음 수집 때 반영된다. 이 소스의 항목은 source='kcap', confirmed=true 로 상단 고정된다.
 */
const fs = require('fs');
const path = require('path');
const { makeItem, parseDate } = require('../lib');

const meta = { key: 'kcap', name: '협회 추천·확인 공모', homepage: 'https://kcap.vercel.app/support.html' };
const CSV_FILE = path.resolve(__dirname, '../../../data/picks.csv');

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
  return rows.filter((r) => r.some((x) => x));
}
const ymd = (s) => { const m = /(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/.exec(String(s || '')); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
const split = (s) => String(s || '').split(/[\s,·/]+/).filter(Boolean);

async function collect() {
  let text = '';
  const sheet = (process.env.PICKS_SHEET_CSV || '').trim();
  if (sheet) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(sheet, { signal: ctl.signal }); clearTimeout(t);
      if (r.ok) text = await r.text();
    } catch (e) { /* 시트가 안 열리면 파일로 */ }
  }
  if (!text && fs.existsSync(CSV_FILE)) text = fs.readFileSync(CSV_FILE, 'utf8').replace(/^﻿/, '');
  if (!text) return [];
  const rows = parseCSV(text);
  const head = rows.shift() || [];
  const col = (name) => head.findIndex((h) => h.replace(/\s/g, '') === name);
  const C = { id: col('id'), title: col('제목'), org: col('주관기관'), url: col('링크'), who: col('신청주체'), age: col('나이상한'), tags: col('분야'), reg: col('지역'), start: col('접수시작'), end: col('접수마감'), months: col('접수시기(매년)'), target: col('대상설명'), memo: col('메모') };
  const get = (r, k) => (C[k] >= 0 ? r[C[k]] || '' : '');
  const out = [];
  for (const r of rows) {
    const title = get(r, 'title'); if (!title) continue;
    const idRaw = get(r, 'id') || title;
    const months = split(get(r, 'months')).map(Number).filter((n) => n >= 1 && n <= 12);
    const age = parseInt(get(r, 'age'), 10);
    const it = makeItem({
      id: idRaw.replace(/[^\w가-힣-]/g, '').slice(0, 40),
      title, org: get(r, 'org'), url: get(r, 'url') || meta.homepage,
      posted: '', start: ymd(get(r, 'start')), end: ymd(get(r, 'end')),
      who: split(get(r, 'who')).filter((w) => w === '개인' || w === '단체'),
      age: Number.isFinite(age) ? age : null,
      tags: split(get(r, 'tags')).filter((t) => ['시각', '공연', '문학', '콘텐츠', '교육', '전체'].includes(t)),
      reg: get(r, 'reg') || '전국',
      summary: [get(r, 'target'), get(r, 'memo')].filter(Boolean).join(' · ').slice(0, 160),
      source: meta.key, kind: '공모',
    });
    it.months = months; it.confirmed = true; it.when = get(r, 'memo');
    if (!it.tags.length) it.tags = ['전체'];
    out.push(it);
  }
  return out;
}
module.exports = { meta, collect };
