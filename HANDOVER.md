# KCAP 웹사이트 개편 — 인수인계 프롬프트 (2026-09-29)

> 이 문서를 새 계정의 첫 메시지에 그대로 붙여 넣으세요. 이전 계정에서 한 작업의 맥락, 현재 상태, 남은 일, 작업 규칙이 전부 들어 있습니다. 비밀값(인증키·토큰)은 일부러 넣지 않았습니다.

---

## 0. 너에게 주는 지시

너는 (사)한국청년문화예술인협회(KCAP) 웹사이트 개편 작업을 이어받는다. 아래 내용을 먼저 다 읽고, 「7. 남은 일」의 우선순위대로 진행한다. 작업 규칙은 「8. 작업 규칙」을 따른다. 시작할 때 저장소를 클론해 현재 상태를 눈으로 확인한 뒤 착수한다. 모르는 것은 추측하지 말고 물어본다.

## 1. 협회와 사이트

- 단체: 사단법인 한국청년문화예술인협회(KCAP). 2018년 전라남도 설립허가(제326호), 주사무소 전남 강진군 대구면 청자촌길 20-14, 회장 김세진(조각가·미디어아트, 미술학 박사). **전국 협회**다(서경·영중·제전 3개 지부, 전국 2030 회원 300여 명). 광주·전남 지역 협회처럼 읽히는 문구는 쓰지 않는다. 연혁·활동·언론보도·주소·설립허가처럼 사실인 것은 그대로 둔다.
- 의뢰인: 브레인파크 김보미 연구위원(협회 관련 작업을 대행). 협회장이 최종 결정권자.
- 사이트 목적: 협회 소개 사이트 → **예술인이 매일 들어와 공모 마감·전시·지원 정보를 확인하는 사이트**로 바꾸는 중.

## 2. 저장소 · 배포

- GitHub: `kimbomi0603/kcap-site`, 작업 브랜치 **`redesign`** (main에 아직 안 합침. main은 옛 사이트).
- Vercel: 팀 `gangjinbom`, 프로젝트 `kcap`. 미리보기 `https://kcap-git-redesign-gangjinbom.vercel.app` (SSO 보호가 켜져 있어 Vercel 로그인 필요). 운영 도메인 `kcap.vercel.app`은 main 기준이라 새 기능이 없다.
- 구조: 정적 HTML + `api/` Vercel 서버리스 함수(CommonJS) + `scripts/` 수집기(Node 20, cheerio devDependency) + `data/` JSON. 빌드 명령 없음. `package.json`에 `npm run collect`만 있음.
- 배포 방식: redesign에 커밋하면 Vercel이 자동 배포한다.

### 코드를 올리는 방법 (중요)
Claude 세션에 GitHub 저장소가 붙어 있어야 `git push`가 된다. **새 작업을 만들 때 GitHub 저장소 `kimbomi0603/kcap-site`를 선택해서 시작하면** 바로 push된다. 저장소를 붙이지 않고 시작했다면 push가 403으로 막힌다(이전 계정에서 겪음). 그 경우 우회로: 로그인된 크롬(Claude in Chrome)으로 `https://github.com/kimbomi0603/kcap-site/upload/redesign/<폴더>` 를 열고 `file_upload` 도구로 세션 outputs 폴더의 파일을 올린 뒤 커밋 메시지를 넣고 커밋. 요령 — 업로드 후 8~10초 기다린다, 커밋 버튼은 ref 클릭이 아니라 **좌표 클릭**이 확실하다, 커밋 후 URL이 `/tree/redesign`으로 바뀌었는지 확인한다, 끝나면 `git fetch`로 원격과 대조한다. 크롬 자동번역으로 버튼 위치가 바뀔 수 있다. 사진(photos/, works/)은 건드릴 일이 없으니 올리지 않는다.

## 3. 지금까지 한 일 (2026-09-29 기준, 모두 redesign에 반영·배포됨)

### 3-1. 기획서
「KCAP 웹사이트 기능 개선 기획서」(docx, 10쪽)를 만들어 전달했다. 요지: 정보마당을 사이트 중심으로, "마감"과 "알림"을 축으로. 제안 10개를 3단계로 나눔.
- 1단계(완료): 홈 마감 대시보드, 공모 자동 수집, 이메일 알림 구독, 구글시트 데이터 관리, 공모별 개별 URL
- 2단계(미착수): 예술활동증명·창작준비금 가이드, 지원서 서식·도구함, 지부별 예술 자원 지도, 캘린더 통합+ICS 구독
- 3단계(미착수): 참여 작가 30인 개인 페이지, 회원 전용 공간
- 뺀 것: 자유게시판(오픈채팅 대체), 온라인 판매, AI 챗봇, 앱
- 비용: 도메인 외 0원(Vercel·GitHub Actions·Resend·Vercel KV 무료 구간)

### 3-2. 전국 협회 기준 문구 일괄 수정
index(마퀴 "전국 청년 예술가와 함께", 선언문 "어디에 살든"), about("전국의 청년 문화예술인이 각자의 자리에서"), plan("전국에서 작업하는", "사는 곳을 떠나지 않아도"), join("전국 청년들에게"). 정보마당 지역 선택에서 "전남광주"·"강진군" 기본값 제거, 광주·전남 분리, 서울~제주 전국 순서. 전시 캘린더 기본 전국, 지도 중심 한반도, 주요 기관 바로가기를 전국+3개 지부 권역으로 재구성. 옛 링크(`r=jn`, `gangjin`)는 호환 유지.

### 3-3. 공모 자동 수집 (`scripts/`)
- `scripts/collect.js`: 소스 병렬 실행 → id 중복 제거 → **제목(괄호 제거·정규화)+마감일이 같으면 하나만**(우선순위 kcap>arko>ncas>kawf>gokams>arte>kocca) → 마감 30일 지난 것 제거(협회 확인 건은 예외) → 마감 오름차순 → `data/calls.json`, `data/collect-status.json`.
- `scripts/collect/lib.js`: fetch(10초 타임아웃·재시도), 한국어 날짜 파서 `parseRange`(2026.10.15 / 10.15(수) / ~까지 / 접수기간 라벨 등), 분류기(신청주체·나이·분야·지역·공모/공지), `makeItem`.
- 소스(`scripts/collect/sources/`): `kcap`(협회 확인, data/picks.csv 또는 환경변수 `PICKS_SHEET_CSV`의 구글시트 '웹에 게시' CSV), `arko`(예술위 공모 게시판, artnuri 상세), `ncas`(홈 서버렌더 목록 23건, 로그인 필요 페이지는 못 봄), `kawf`(공지 3페이지, 마감은 대부분 포스터 이미지라 미상), `gokams`(공지+공모·기금 게시판 flag=34), `arte`(사업공모 게시판에 접수시작/마감 열 있으나 현재 전부 마감, 공지는 등록일만), `kocca`(진행 중 공모 탭).
- 실행: `cd kcap-site && npm install && NODE_USE_ENV_PROXY=1 npm run collect` (Claude 컨테이너에선 프록시 변수 필요). 결과 약 140건.
- `.github/workflows/collect.yml`: 매일 20:30 UTC(05:30 KST) 수집 후 data/ 커밋. **schedule은 기본 브랜치(main)에서만 돈다** → main 병합 전에는 Actions 탭에서 workflow_dispatch로 수동 실행.
- 데이터 스키마(한 건): `{ id, title, org, url, posted, start, end(YYYY-MM-DD 마감|''), who:['개인','단체'], age:number|null, tags:['시각','공연','문학','콘텐츠','교육','전체'], reg:'전국'|시도명, summary(≤160자), source, kind:'공모'|'공지' }` + 협회 확인 건은 `months:[..], confirmed:true, when:'매년 9–10월'`.
- `data/picks.csv` 열: `id,제목,주관기관,링크,신청주체,나이상한,분야,지역,접수시작,접수마감,접수시기(매년),대상설명,메모` (14건). 협회 담당자가 구글시트로 관리하게 하는 게 목표.

### 3-4. 프런트 (정보마당)
- `assets/calls.js`: calls.json 로더, 내 조건(`localStorage kcap_profile_v1` = support.html '나에게 맞는 공모'의 who/age/tag/reg) 매칭, 배지(D-day·매년 n월), 대시보드·목록·상세 렌더.
- `index.html` 상단 `#dash` 「오늘의 마감」: 접수 중·이번 주 마감·다음 주 마감·내 조건 수치 + 마감순 8건. 홈 정보마당 섹션에 통합 검색창(`info.html?q=&r=`).
- `calls.html` 공모 목록(접수 중/이번 주/다음 주/협회 확인/공지/전체, 내 조건만, 검색·기관·분야·지역 필터, 수집 현황 표시). `call.html?id=` 상세(원문 링크, 관심 담기, ICS 캘린더, 공유, 비슷한 공모).
- 정보마당 메뉴·탭에 「공모 마감」 추가(전 페이지). 통합 검색(`assets/info.js`)에 「공모 마감」 그룹 추가. `.us-out[hidden]` 표시 버그 수정.
- 기존 API 함수: `api/exhibitions.js`(한국문화정보원 한눈에보는문화정보 → 전시 캘린더), `api/support.js`(행안부 공공서비스 gov24 + 온통청년 → 실시간 검색). 지역 키에 `gwangju`,`jeonnam` 추가. `api/health.js`(세 API 연결 상태 점검, 키 값 비노출).

### 3-5. 알림 구독
- `api/subscribe.js`: POST {email, who, age, tags, reg} → Upstash/Vercel KV(REST) 저장(`sub:<sha256>`, `subs` set) → Resend로 확인 메일. GET `?confirm=&k=` 확인, `?unsubscribe=&k=` 삭제. IP당 분당 5회. 환경변수 없으면 `{ok:false, configured:false, reason:'kv'|'resend'}`.
- `api/notify.js`: `Authorization: Bearer ${CRON_SECRET}`로 보호. 확인된 구독자마다 조건 매칭 → "이번 주 마감(7일)" + "새로 올라온 공모" 두 구역 메일. `seen:<id>`, `sent:<key>:<날짜>`로 중복 방지, 8.8초 넘으면 `partial:true`. 첫 실행은 posted 기준으로만 신규 판정.
- `vercel.json`: `{"crons":[{"path":"/api/notify","schedule":"0 23 * * 0"}]}` (월 08:00 KST).
- `assets/subscribe.js` + 폼(`scripts/snippets/subscribe-form.html`을 info.html, calls.html에 삽입).
- 테스트 `scripts/test-alerts.js`(메모리 KV·가짜 Resend, 29건 통과). 안내 `scripts/README-alerts.md`.

## 4. 환경변수 (Vercel kcap 프로젝트, 현재 0개 — 전부 사용자가 직접 넣어야 함)
전부 Sensitive로, Production·Preview·Development 체크 후 Redeploy.
- `DATA_GO_KR_KEY`: 공공데이터포털 일반 인증키(Encoding). 이 계정에 「한국문화정보원_한눈에보는문화정보조회서비스」와 「행정안전부_대한민국 공공서비스(혜택) 정보」가 승인돼 있어야 한다. 브레인허브(brainpark-hub)·kimbomi-site에도 같은 이름의 키가 있지만 Sensitive라 API로 못 읽는다 — 사용자가 복사해 넣어야 한다.
- `YOUTH_KEY`: 온통청년 Open API 키.
- 알림: `KV_REST_API_URL`, `KV_REST_API_TOKEN`(Vercel Storage→Upstash KV 연결 시 자동), `RESEND_API_KEY`, `MAIL_FROM`(도메인 인증 전에는 `onboarding@resend.dev`, 본인 주소로만 발송됨), `SITE_URL`, `CRON_SECRET`.
- 선택: `PICKS_SHEET_CSV`(GitHub Actions secret으로도 넣어야 수집 때 반영), `EXTRA_SHEET_CSV`(협회 등록 전시).
- 공공데이터포털 요령: Encoding 키(`%` 포함)는 URL에 그대로 붙인다. 한 번 더 인코딩하면 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 나는데 미등록이 아니라 인코딩 오류다. 포털은 키가 틀려도 HTTP 200에 오류 본문을 준다.
- 키 값은 대화창에 붙이지 말고 Vercel에 직접 넣게 한다(이전에 노출 사고가 있어 전부 Sensitive로 바꾼 것).

## 5. 확인 방법
- `/api/health` → 세 API 상태(ok/no_key/api_error). 키 넣기 전엔 전부 no_key.
- `/data/calls.json` → 수집 결과. `/calls.html` 하단에 기관별 수집 성공·건수.
- 알림: `curl -X POST .../api/subscribe -d '{...}'`, `curl -H "Authorization: Bearer <CRON_SECRET>" .../api/notify` (README-alerts.md 참조).

## 6. 알려진 문제
- 휴대폰에서 `calls.html` 필터 바(`.cal-bar` sticky)가 목록 위에 겹쳐 보임 → 비고정으로 바꾸거나 배경 불투명 처리.
- kawf·arte는 마감일 대부분 미상(이미지 공고). 협회 시트(picks.csv)에 직접 적는 게 답.
- ncas는 홈 목록만 읽어 페이지 넘김 불가. arko·ncas는 posted 없음.
- 분류(신청주체·분야·지역·나이)는 키워드 기반이라 틀릴 수 있다. 상세 페이지에 "자동 수집, 원문 확인" 문구를 넣어 둠.
- Vercel 미리보기가 SSO 보호라 협회 분들이 못 본다. 운영 공개는 main 병합 + Deployment Protection 해제 또는 자체 도메인.
- `x-robots-tag: noindex`는 Vercel 미리보기 헤더. main/운영에서는 공모별 URL이 검색에 잡히도록 확인.

## 7. 남은 일 (우선순위)
1. **사용자와 함께**: 환경변수 입력 확인(`/api/health` 3/3 ok), redesign→main 병합 시점 결정, SSO 보호·도메인 결정, 협회 시트(구글시트) 생성과 `PICKS_SHEET_CSV` 연결, Resend 도메인 인증.
2. 모바일 필터 바 겹침 수정.
3. **2단계**
   - 예술활동증명·창작준비금 가이드 페이지(한국예술인복지재단 공식 안내 기준, 단계별 체크리스트, 갱신일 표시, 자주 반려되는 이유). 검색 유입 입구.
   - 지원서 서식·도구함(작가노트·활동이력·포트폴리오 서식, 예산서 엑셀 템플릿, 제출 전 체크리스트). 협회가 가진 자료 확보 필요.
   - 지부별(서경·영중·제전) 예술 자원 지도(전시 공간·레지던시·대관 가능 공간·재료상, 대관료·연락처). 카카오맵/네이버 지도 무료 구간. 회원이 써 본 곳부터.
   - 캘린더 통합: 전시+공모 마감+아트페어+협회 행사 한 화면, ICS 구독 주소 제공(현재 관심 목록 ICS 내보내기는 있음).
4. **3단계**: 참여 작가 30인 개인 페이지(협회장 페이지 구성 재사용, 공개 범위 동의서), 회원 전용 공간(초기엔 오픈채팅으로 대체 가능).
5. 데이터 관리: 작가·전시·자원도 구글시트→JSON 자동 반영 구조로(공모와 같은 방식).

## 8. 작업 규칙 (의뢰인 요구)
- 정식 문서(보고서·기획서)는 한글 워드(.docx). 데이터·목록은 엑셀, 발표는 PPT.
- 결론 먼저, 근거는 아래. 바쁜 사람이 한 번 읽고 이해하도록. 상투어(혁신적인, 시너지, leverage 등) 금지, 보도자료 톤 금지.
- 사실·숫자·이름은 임의로 빼거나 바꾸지 않는다. 줄이면 무엇을 왜 뺐는지 밝힌다.
- 애매하면 작업 전에 질문. 코드·문서를 추측으로 쓰지 않는다. 봐주지 않고 문제는 직접 말한다.
- 사이트 문구는 전국 협회 기준. 사실(연혁·주소·설립허가·언론 제목)은 유지.
- 커밋 메시지는 한국어로 무엇을 왜 바꿨는지. 폴더별로 나눠 올려도 된다.
- 인증키·토큰은 대화에 붙이지 않는다. 필요하면 변수 이름만 정해 주고 사용자가 Vercel에 넣게 한다.

## 9. 파일 지도 (redesign 브랜치)
```
index.html  info.html  calls.html  call.html  calendar.html  support.html  join.html  about.html  plan.html ...(협회 소개 페이지들)
api/exhibitions.js  api/support.js  api/health.js  api/subscribe.js  api/notify.js
assets/site.css  assets/kit.js(관심목록·D-day·ICS·공유)  assets/calls.js  assets/info.js  assets/calendar.js  assets/support.js  assets/subscribe.js  assets/main.js
data/calls.json  data/collect-status.json  data/picks.csv
scripts/collect.js  scripts/collect/lib.js  scripts/collect/sources/{kcap,arko,ncas,kawf,gokams,arte,kocca}.js
scripts/test-alerts.js  scripts/README-alerts.md  scripts/snippets/subscribe-form.html
.github/workflows/collect.yml  vercel.json  package.json  .gitignore
```
