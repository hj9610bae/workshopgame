# 워크샵 게임 프로젝트

워크샵에서 쓰는 브라우저 게임. 사용자는 한국어로 소통한다.

**세션을 시작하면 먼저 `docs/progress.md`(진행 현황·다음 할 일)를 읽을 것. 작업을 마칠 때 이 문서를 갱신할 것.**

## 현재 게임: 오디세이아 : 귀환의 항해 (규칙 v3.4)
- v2.4 「교섭의 도박사들」과 규칙은 같고 컨셉만 바꾼 판. 코드의 안건·테이블·합의(deal)·팀 = 화면의 역경·해역·돌파·함대
- 규칙의 기준 문서는 `docs/rules.md`. 규칙을 바꾸면 문서·`src/deal/data.ts`·엔진·테스트를 함께 맞출 것
- 진행 방식 두 가지
  - **현장 진행(`board.html`, 기본)**: 프로젝터 한 화면만 쓰고, 보조자가 손으로 걷은 포스트잇을 입력. 서버 없이 localStorage에 저장. `?console`로 연 진행자 창과 storage 이벤트로 동기화. 항해 설명·연습 항해(튜토리얼) 포함
  - **폰 제출(`host.html` + `play.html`)**: **현장에서 쓰지 않기로 함** (2026-10-15). 공용 코드가 컴파일되게만 유지하고 새 기능·컨셉 변경은 넣지 않음 (교섭 문구가 남아 있음)
- 10일(`ROUNDS`), 역경 22개(최종 결전 포함). 실제 게임은 출항 때 `shuffledSetup()`(구간 하·중·상 안에서만 섞고 처음 5개에 전리품)을 `EngineState.setup`에 저장. `SETUP`은 테스트·설명 예시용 기준 배치. 연습 항해는 `Setup.practice`.
- 최종 결전은 `FINAL_OPEN_ROUND`(8일차) 순서 발표 때 4번 해역. 그 전엔 4번 해역을 화면·입력 패널에 그리지 않음(`board.ts` `visibleTables`)
- 스핑크스(구조선 퀴즈) hidden event: `RESCUE_ROUND`(7일차) 공개 뒤 `openRescue`(3·4·5등, 동점은 computeOrder 규칙) → `markQuiz`(함대가 고른 난도·정답) · `startQuizTimer`(`QUIZ_THINK_SECONDS`) → `settleRescue`(`pub.rescue.rewards`, `QUIZ_REWARD` 하2·중3·상6, 오답 벌칙 없음). 모두 계속 항해. 문제 순서 `quizQueue`(하부터). 1~7일차 화면·버튼에 4번 해역 예고 금지
- 점수: 엔진 `score`는 v2.4 주도권 그대로(시작 10, 높을수록 좋음). 화면은 `distanceOf(score)` = 고국과의 거리(시작 15해리, 낮을수록 좋음). 돌파 보상 = `Setup.demand`(처음 생명력)
- 처음 생명력은 공개, 남은 생명력은 비공개. 공격 이력도 비공개: `secret.trail`에만 쌓이고 진행자 창에만 표시. 돌파된 역경의 이력은 `secret.history`로 옮겨 두었다가 최종 결과 뒤 항해 일지에서만 공개. 돌파 사건에는 마지막 일격 함대와 그 무기(`GameEvent.weapon`)만. 특수 무기면 `CARDS.effect` 짧은 설명을 붙임(`view.ts` `describeEvent`)
- 역경 카드 `adversaryCard()`(`felt.ts`) = 픽토그램 + 역경 이름 + 생명력 + 전리품 특수 무기 이름 (구분선 없음, 전진 거리 = 생명력이라 생략). 실제 게임·연습·설명 모두 이 양식. 무기 카드 `weaponCard()`도 같은 양식(픽토그램 + 이름 + `CARDS.powerText`). 구간·교섭 안건은 항해 일지에만. 안건 번호는 화면에 쓰지 않음
- 특수 무기 이름: `CARDS.name` = 풀네임(항해 설명에만), `CARDS.short` = 짧은 이름(연습·실제 게임 화면, 엔진 메시지). 2026-10-22에 이름을 돌려 바꿈: −6 = 🔱 포세이돈의 삼지창(`blitz`), 매일 −1 = 🏹 아폴론의 전갈 화살(`promo`), 동결 = ⛓️ 아테나의 쇠사슬(`hold`)
- 전리품은 `data.ts`의 `LOOT`(앞쪽 역경부터 `LOOT_ORDER` 순). 무기 이름은 공개(역경 카드, `GameEvent.loot` = 무기 id). 자세한 효과는 함대 메시지·실물 카드
- 설명 뒤 연습 항해 하루: `practiceSetup()`으로 역경 순서·전리품 무작위 (`Setup.practice`가 있으면 연습 게임). 화면은 `useSetup()`으로 그 배치의 대기열·생명력·전리품을 그림
- 함대 자리는 바다 지도 `seaMap()`(`felt.ts`): 왼쪽 이타카(0 = 항구, 음수 = 섬 안쪽) ↔ 오른쪽 트로이, 거리 비율·자동 축척
- 돌파된 역경은 `TableState.done`에 쌓여 해역 뒤에 표시. 최종 결과 뒤 '항해 일지'에서 역경·교섭 안건·돌파 함대 공개
- 비공개 정보(남은 생명력, 공격 이력, 보유 무기, 제출 내용, 예지 결과, 투척 창)는 프로젝터 화면과 `pub`에 절대 넣지 않음. 현장 진행에서는 진행자 창·펼친 입력 패널·예지 팝업에만 표시

## 스택
- Vite + TypeScript (프레임워크 없음, HTML 문자열 렌더링), vitest
- Firebase Realtime Database + 익명 로그인 (서버 코드 없음). 프로젝트: `workshopgame-cd3fb` (asia-southeast1)
- GitHub Pages 배포 (`.github/workflows/deploy.yml`, `base: './'`)

## 구조
- `src/deal/engine.ts`: 규칙 엔진 (순수 함수, 입력 불변). 테스트 `engine.test.ts`
- `src/deal/sync.ts`: Firebase 데이터 구조와 읽기/쓰기. 경로 설명은 파일 상단 주석
- `src/deal/view.ts`: 사회자·폰 공용 화면 조각, `src/host.ts`·`src/play.ts`: 각 화면
- `src/board.ts`·`src/board.css`: 현장 진행 화면, `src/deal/felt.ts`: 테이블·팀 자리 그림, `src/deal/local.ts`: localStorage 저장·되돌리기
- `src/deal/tutorial.ts`: 설명 슬라이드 + 연습 게임 배치(`practiceSetup`). 테스트 `tutorial.test.ts`
- 디자인(2026-10-20 기획서): `board.css` 맨 위 `body.live` 변수(네이비 `--navy`·금 `--gold`/`--gold-deep`·빨강 `--red` 생명력·민트 `--mint` 거리/승리). 제목 `--font-title`(Cinzel + Noto Serif KR), 본문 Pretendard — `board.html`에서 CDN으로 불러옴. 아이콘: 투척 창 ⚡, 예지 👁️, 순풍 🌬️, 이타카 🏛️ (겹치던 역경 아이콘은 바람 자루 💨·충전소 🔌·키클롭스 🧿·제우스의 벼락 🌩️로 바꿈)
- CSS 클래스 주의: `style.css`에 이미 `.board`, `.table` 같은 이름이 있어 겹치면 레이아웃이 깨짐 (현장 진행 body 클래스는 `live`)
- 판정은 사회자 브라우저가 담당(엔진 실행 후 multi-path update). 대표는 `submissions`·`requests`·`teams/{t}`에만 씀
- 공개 연출: `pub.events`에 사건마다 테이블·점수 스냅샷을 담고 `pub.revealed`만큼 보여줌
- 보안 규칙 `database.rules.json`은 콘솔에 직접 게시해야 함. 바꾼 뒤 `npm run check:rules`로 검증

## 공통 규칙
- 사용자 입력은 HTML에 넣을 때 반드시 `esc()` 사용, 버튼은 `data-action`으로 연결 (`onAction`)
- Firebase에 쓸 값은 `clean()`으로 undefined 제거, 읽을 때는 `norm*()`으로 빈 배열·객체 기본값 채움

## 명령
- `npm run dev` / `npm test` / `npm run build` (tsc 포함) / `npm run check:rules`
