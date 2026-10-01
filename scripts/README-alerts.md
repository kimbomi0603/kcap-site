# 공모 알림 구독 (이메일) — 설정과 시험 방법

매주 월요일 08:00(KST), 확인된 구독자에게 조건에 맞는 공모를 메일로 보낸다.
한 통에 두 부분: **이번 주 마감 (7일 이내)** · **새로 올라온 공모 (지난 7일)**. 보낼 항목이 없으면 보내지 않는다.

## 구성 파일

| 파일 | 역할 |
|---|---|
| `api/subscribe.js` | 신청(POST) · 확인 링크(GET ?confirm) · 수신 중단(GET ?unsubscribe) |
| `api/notify.js` | 발송. `vercel.json` 크론이 부르거나, `CRON_SECRET`으로 직접 호출 |
| `vercel.json` | 크론 `0 23 * * 0` (UTC 일 23:00 = KST 월 08:00) |
| `assets/subscribe.js` | 폼 동작 (미리 채우기 · 전송 · 결과 표시) |
| `scripts/snippets/subscribe-form.html` | 페이지에 붙여 넣는 폼 HTML |
| `assets/site.css` 끝 `/* ---- 알림 구독 ---- */` | 폼 스타일 |
| `scripts/test-alerts.js` | 로컬 시험 (`node scripts/test-alerts.js`) |

폼을 넣을 페이지(예: `info.html`)에 스니펫을 붙이고, 페이지 끝 스크립트 목록에 `<script src="assets/subscribe.js" defer></script>`를 추가한다.

## 환경변수 (Vercel 프로젝트 → Settings → Environment Variables)

| 변수 | 필수 | 어디서 받나 |
|---|---|---|
| `KV_REST_API_URL` | 필수 | Vercel 대시보드 → **Storage** → Create Database → **Upstash (Redis)** 생성 후 프로젝트에 Connect 하면 자동으로 들어온다. (Upstash 콘솔에서 직접 만든 경우 REST URL을 복사. `UPSTASH_REDIS_REST_URL`이라는 이름도 인식한다) |
| `KV_REST_API_TOKEN` | 필수 | 위와 같은 곳. (`UPSTASH_REDIS_REST_TOKEN`도 인식) |
| `RESEND_API_KEY` | 필수 | [resend.com](https://resend.com) 가입 → API Keys → Create. 무료 구간은 하루 100통·월 3,000통 |
| `MAIL_FROM` | 선택 | 보내는 사람. 기본 `KCAP 정보마당 <onboarding@resend.dev>`. **주의:** `onboarding@resend.dev`는 Resend 계정에 등록한 본인 주소로만 보낼 수 있다. 실제 구독자에게 보내려면 Resend → Domains에서 협회 도메인을 인증하고 `KCAP 정보마당 <alert@협회도메인>` 형태로 바꾼다 |
| `SITE_URL` | 선택 | 메일 속 링크의 기준 주소. 기본 `https://kcap.vercel.app`. 도메인을 연결하면 그 주소로 바꾼다 (끝에 `/` 없이) |
| `CRON_SECRET` | 권장 | 아무 긴 무작위 문자열 (`openssl rand -hex 32`). 설정하면 Vercel 크론이 자동으로 `Authorization: Bearer <값>`을 붙여 부르고, 다른 요청은 401로 막는다. 없으면 `x-vercel-cron` 헤더/`vercel-cron` UA 요청만 통과시키는데 외부에서 흉내 낼 수 있으므로 설정을 권장한다 |

KV 또는 Resend 변수가 없으면 API는 `200 {ok:false, configured:false, reason:'kv'|'resend'}`를 돌려주고, 화면에는 「알림 서비스를 준비하고 있습니다」가 표시된다. 환경변수를 넣은 뒤에는 **다시 배포**해야 적용된다.

## KV에 저장되는 것

| 키 | 내용 |
|---|---|
| `sub:<sha256(이메일)>` | `{email, who, age, tags, reg, createdAt, confirmed, token, confirmedAt?}` |
| `subs` (집합) | 구독 키 목록 |
| `seen:<공모id>` | 그 공모를 처음 본 날짜 (120일 뒤 자동 삭제) — '새로 올라온' 판단용 |
| `sent:<구독키>:<YYYY-MM-DD>` | 그날 발송 완료 표시 (3일 뒤 자동 삭제) — 같은 날 재실행 시 중복 방지 |
| `rl:<ip해시>` | IP별 분당 신청 횟수 (60초 뒤 삭제). 5회 초과 시 429 |
| `notify:init` | 첫 발송 실행 날짜. 첫 실행에서는 기존 공모 전체가 '신규'로 쏟아지지 않도록 `posted` 기준으로만 신규를 정한다 |

## 매칭 규칙 (`api/notify.js` → `matches`)

- `kind === '공모'`이고 `end`가 오늘(KST) 이후인 항목만 본다.
- 신청 주체: 구독자가 골랐고 공모의 `who`가 비어 있지 않으면 포함해야 한다.
- 나이: 공모에 `age` 상한이 있고 구독자 나이가 있으면 `구독자 나이 ≤ age`.
- 분야: 구독자가 골랐고 공모 태그가 `['전체']`가 아니면 하나라도 겹쳐야 한다.
- 지역: 구독자가 `all`이면 전부, 아니면 공모 `reg`가 `전국`이거나 그 지역 이름과 같아야 한다.
- 마감 임박 = `오늘 ≤ end ≤ 오늘+7`. 새로 올라온 = `posted` 또는 처음 본 날짜가 최근 7일 (마감 임박과 겹치면 마감 쪽에만).
- 구역별 최대 30건.

## 시험

### 로컬 (실제 KV·Resend 없이)
```bash
node scripts/test-alerts.js
```
fetch를 가로채 메모리 KV와 가짜 Resend로 신청 → 확인 → 발송 → 중복 방지 → 수신 중단까지 검사한다.

### 배포 후
```bash
# 1) 신청 — 확인 메일이 와야 한다 (Resend 무료 계정이면 계정 주소로만)
curl -X POST https://kcap.vercel.app/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"본인주소@example.com","who":"개인","age":28,"tags":["시각"],"reg":"seoul"}'
# → {"ok":true,"sent":true}   /  준비 전: {"ok":false,"configured":false,"reason":"kv"}

# 2) 메일의 '구독 확인하기' 링크를 열면 "구독이 확인되었습니다" 페이지

# 3) 발송을 바로 실행 (크론을 기다리지 않고)
curl -H "Authorization: Bearer <CRON_SECRET>" https://kcap.vercel.app/api/notify
# → {"ok":true,"date":"2026-09-29","subs":1,"sent":1,"skipped":0,"errors":0}
#    같은 날 다시 부르면 sent:0, skipped:1. partial:true 가 나오면 시간 제한(약 9초)으로 중간에 멈춘 것 — 한 번 더 부르면 이어서 보낸다.
```

Vercel 대시보드 → 프로젝트 → **Cron Jobs** 탭에서 등록 여부와 마지막 실행 로그를 볼 수 있다. (Hobby 플랜은 크론이 하루 1회까지, 정확한 분은 보장되지 않는다.)

## 알아 둘 점

- 확인 메일 발송에 실패하면 저장한 신청도 지운다 (확인 링크가 전달되지 않았으므로).
- 같은 이메일로 다시 신청하면 조건이 새로 저장되고 **다시 확인 링크를 눌러야** 발송이 시작된다.
- 메일의 「관심 · 상세 보기」 링크는 `/call.html?id=<공모id>`를 가리킨다. 이 페이지가 아직 없으면 만들거나 `api/notify.js`의 `itemHtml`에서 링크를 `info.html`로 바꾼다.
- 구독자가 수백 명을 넘으면 10초 제한 안에 다 못 보낸다. 그때는 `vercel.json`의 `functions` 설정으로 `maxDuration`을 늘리거나(Pro), 크론을 여러 번 걸어 이어 보내면 된다 (같은 날 재실행은 이미 보낸 사람을 건너뛴다).
