# 워크샵 게임 프로젝트

워크샵에서 쓰는 브라우저 게임. 사용자는 한국어로 소통한다.

**세션을 시작하면 먼저 `docs/progress.md`(진행 현황·다음 할 일)를 읽을 것. 작업을 마칠 때 이 문서를 갱신할 것.**

## 현재 게임: 교섭의 도박사들 : Deal or No Deal
- 규칙의 기준 문서는 `docs/rules.md`. 규칙을 바꾸면 문서·`src/deal/data.ts`·엔진·테스트를 함께 맞출 것
- 진행 방식 두 가지
  - **현장 진행(`board.html`, 기본)**: 프로젝터 한 화면만 쓰고, 보조자가 손으로 걷은 제출 용지를 입력. 서버 없이 localStorage에 저장. `?console`로 연 진행자 창과 storage 이벤트로 동기화. 게임 설명·예시 라운드(튜토리얼) 포함
  - **폰 제출(`host.html` + `play.html`)**: 사회자 화면 하나를 모두가 보고, 팀 대표 5명만 폰으로 제출 (Firebase). **현장에서 쓰지 않기로 함** (2026-10-15). 공용 코드가 컴파일되게만 유지하고 새 기능은 넣지 않음
- 요구 수치는 블라인드(처음 값도 비공개). 합의된 안건만 `GameEvent.demand`·`trail`로 처음 수치와 깎인 이력 공개. 이력은 `secret.trail`에 쌓임
- 테이블에는 픽토그램·노조 요구안·보상만. 회사 제시안(타결 내용)은 합의 사건이 공개될 때만 표시. 안건 번호는 화면에 쓰지 않음
- 전리품은 `data.ts`의 `LOOT`(앞쪽 안건부터 `LOOT_ORDER` 순). 화면·`pub`에는 '특수 카드'/`GameEvent.loot`로만, 카드 종류는 팀 메시지·진행자 창에만
- 게임 설명 뒤 연습 게임 1라운드: `practiceSetup()`으로 안건·전리품 무작위, 수치는 연습용 (`EngineState.setup`이 있으면 연습 게임). 화면은 `useSetup()`으로 그 배치의 대기열·전리품을 그림
- 페이크 안건은 `Agenda.fake`, 최종 결과 뒤 안건 공개 화면에서 강조. 합의된 안건은 `TableState.done`에 쌓여 테이블 뒤에 표시
- 비공개 정보(처음·남은 수치, 깎인 이력, 보유 카드, 제출 내용, 스카우터 결과, 실무 교섭 병행)는 사회자 화면과 `pub`에 절대 넣지 않음. 현장 진행에서는 진행자 창·펼친 입력 패널·스카우터 팝업에만 표시

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
- CSS 클래스 주의: `style.css`에 이미 `.board`, `.table` 같은 이름이 있어 겹치면 레이아웃이 깨짐 (현장 진행 body 클래스는 `live`)
- 판정은 사회자 브라우저가 담당(엔진 실행 후 multi-path update). 대표는 `submissions`·`requests`·`teams/{t}`에만 씀
- 공개 연출: `pub.events`에 사건마다 테이블·점수 스냅샷을 담고 `pub.revealed`만큼 보여줌
- 보안 규칙 `database.rules.json`은 콘솔에 직접 게시해야 함. 바꾼 뒤 `npm run check:rules`로 검증

## 공통 규칙
- 사용자 입력은 HTML에 넣을 때 반드시 `esc()` 사용, 버튼은 `data-action`으로 연결 (`onAction`)
- Firebase에 쓸 값은 `clean()`으로 undefined 제거, 읽을 때는 `norm*()`으로 빈 배열·객체 기본값 채움

## 명령
- `npm run dev` / `npm test` / `npm run build` (tsc 포함) / `npm run check:rules`
