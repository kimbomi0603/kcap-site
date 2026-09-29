// Vercel 서버리스 함수: GET /api/ics            → 접수 중인 공모 마감 전체를 iCalendar(.ics)로
//                       GET /api/ics?mine=...   (미래: 조건별)  GET /api/ics?pick=1 → 협회 확인 공모만
// 구글 캘린더·아이폰 캘린더에서 "URL로 구독"하면 사이트에 안 들어와도 마감이 개인 일정에 뜬다.
// 데이터: data/calls.json (매일 05:30 자동 수집). 응답은 1시간 캐시.
const path = require('path');
const fs = require('fs');

function load() {
  try { return require('../data/calls.json'); } catch (e) {}
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'calls.json'), 'utf8')); } catch (e) { return { items: [] }; }
}
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');
const d8 = (ymd) => ymd.replace(/-/g, '');
function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// 75자 접기(RFC 5545)
function fold(line) { const out = []; let s = line; while (Buffer.byteLength(s) > 73) { let cut = 73; while (Buffer.byteLength(s.slice(0, cut)) > 73) cut--; out.push(s.slice(0, cut)); s = ' ' + s.slice(cut); } out.push(s); return out.join('\r\n'); }

module.exports = (req, res) => {
  const q = req.query || {};
  const site = (process.env.SITE_URL || 'https://kcap.vercel.app').replace(/\/$/, '');
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const items = (load().items || []).filter((it) => it.end && it.end >= today && it.kind !== '공지' && (!q.pick || it.source === 'kcap'));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KCAP//calls//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(q.pick ? 'KCAP 협회 확인 공모 마감' : 'KCAP 공모 마감'), 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H'];
  for (const it of items) {
    lines.push('BEGIN:VEVENT', 'UID:' + it.id.replace(/[^\w-]/g, '') + '@kcap', 'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + d8(it.end), 'DTEND;VALUE=DATE:' + d8(addDays(it.end, 1)),
      'SUMMARY:' + esc('[마감] ' + it.title), 'DESCRIPTION:' + esc((it.org ? it.org + '\n' : '') + '상세: ' + site + '/call.html?id=' + encodeURIComponent(it.id) + '\n원문: ' + it.url),
      'URL:' + esc(it.url), 'CATEGORIES:' + esc((it.tags || []).join(',')), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="kcap-calls.ics"');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(lines.map(fold).join('\r\n') + '\r\n');
};
