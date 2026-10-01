'use strict';
/**
 * 공모 자동 수집 러너
 *   node scripts/collect.js          → data/calls.json, data/collect-status.json 생성
 *   COLLECT_DEBUG=1 로 실행하면 소스별 경고를 출력한다.
 *
 * 모든 소스를 병렬(Promise.allSettled)로 돌리고, id로 중복을 제거한 뒤
 * 마감이 30일 넘게 지난 항목을 버리고 마감 오름차순(마감 미상은 뒤)으로 정렬한다.
 */

const fs = require('fs');
const path = require('path');

const SOURCES = ['kcap', 'arko', 'ncas', 'kawf', 'gokams', 'arte', 'kocca'].map((k) => require(`./collect/sources/${k}`));

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CALLS = path.join(DATA_DIR, 'calls.json');
const STATUS = path.join(DATA_DIR, 'collect-status.json');

const DAY = 86400000;
const KEEP_PAST_DAYS = 30;

function isValidItem(it) {
  return it && typeof it.id === 'string' && it.id && typeof it.title === 'string' && it.title && typeof it.url === 'string';
}

async function runSource(src) {
  const t0 = Date.now();
  const status = { key: src.meta.key, name: src.meta.name, ok: false, count: 0, ms: 0, error: '' };
  let items = [];
  try {
    const out = await src.collect();
    items = (Array.isArray(out) ? out : []).filter(isValidItem);
    status.ok = true;
    status.count = items.length;
  } catch (e) {
    status.error = String((e && e.message) || e).slice(0, 300);
  }
  status.ms = Date.now() - t0;
  return { status, items };
}

async function main() {
  const updated = new Date().toISOString();
  const results = await Promise.allSettled(SOURCES.map(runSource));

  const statuses = [];
  const merged = new Map();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      statuses.push(r.value.status);
      for (const it of r.value.items) if (!merged.has(it.id)) merged.set(it.id, it);
    } else {
      const src = SOURCES[i];
      statuses.push({ key: src.meta.key, name: src.meta.name, ok: false, count: 0, ms: 0, error: String(r.reason && r.reason.message) });
    }
  });

  // 같은 공고가 여러 기관 게시판에 올라오는 경우(제목이 같고 마감이 같음) 하나만 남긴다. 협회 확인 > ARKO > 나머지 순으로 우선.
  const PRIO = { kcap: 0, arko: 1, ncas: 2, kawf: 3, gokams: 4, arte: 5, kocca: 6 };
  // 괄호 안(기간 · 시각 · 기관명 등)은 빼고 비교한다. '(~10.2.(금) 16:00)'처럼 겹친 괄호도 안쪽부터 지운다.
  const normTitle = (t) => {
    let s = String(t || ''), prev;
    do { prev = s; s = s.replace(/[\[\(（【][^\[\]\(\)（）【】]*[\]\)）】]/g, ''); } while (s !== prev);
    return s.replace(/[^\w가-힣]/g, '').toLowerCase();
  };
  const byTitle = new Map();
  for (const it of merged.values()) {
    const key = normTitle(it.title) + '|' + (it.end || '');
    const prev = byTitle.get(key);
    if (!prev || (PRIO[it.source] ?? 9) < (PRIO[prev.source] ?? 9)) byTitle.set(key, it);
  }
  // 2차: 마감일이 같고 한 제목이 다른 제목을 그대로 품고 있으면 같은 공고로 본다
  // (예: '예술산업보증 10월(7차) 공모' ↔ '2026 예술산업보증 10월(7차) 공모 안내(10.1.~10.12.)').
  // 우선순위가 높은 출처를, 같으면 제목이 짧은 쪽을 남긴다.
  const pool = [...byTitle.values()];
  const drop = new Set();
  const rank = (x) => [(PRIO[x.source] ?? 9), x.title.length];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i], b = pool[j];
      if (!a.end || a.end !== b.end || drop.has(a) || drop.has(b)) continue;
      const na = normTitle(a.title), nb = normTitle(b.title);
      if (Math.min(na.length, nb.length) < 8 || !(na.includes(nb) || nb.includes(na))) continue;
      const [ra, rb] = [rank(a), rank(b)];
      drop.add(ra[0] < rb[0] || (ra[0] === rb[0] && ra[1] <= rb[1]) ? b : a);
    }
  }
  const cutoff = Date.now() - KEEP_PAST_DAYS * DAY;
  const items = pool.filter((x) => !drop.has(x))
    .filter((it) => {
      if (!it.end || it.source === 'kcap') return true;
      const t = Date.parse(it.end + 'T23:59:59+09:00');
      return Number.isNaN(t) ? true : t >= cutoff;
    })
    .sort((a, b) => {
      if (a.end && b.end) return a.end < b.end ? -1 : a.end > b.end ? 1 : a.title.localeCompare(b.title, 'ko');
      if (a.end) return -1;
      if (b.end) return 1;
      return (b.posted || '').localeCompare(a.posted || '') || a.title.localeCompare(b.title, 'ko');
    });

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CALLS, JSON.stringify({ updated, count: items.length, items }, null, 2) + '\n');
  fs.writeFileSync(STATUS, JSON.stringify({ updated, sources: statuses }, null, 2) + '\n');

  for (const s of statuses) {
    console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.key.padEnd(7)} ${String(s.count).padStart(3)} items ${String(s.ms).padStart(6)}ms${s.error ? '  ' + s.error : ''}`);
  }
  console.log(`total ${items.length} items → ${path.relative(ROOT, CALLS)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
