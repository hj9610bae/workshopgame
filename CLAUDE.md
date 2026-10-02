# 워크샵 게임 프로젝트

워크샵에서 쓰는 브라우저 게임. 사용자는 한국어로 소통한다.

## 현재 게임: 교섭의 도박사들 : Deal or No Deal
- 규칙의 기준 문서는 `docs/rules.md`. 규칙을 바꾸면 문서·`src/deal/data.ts`·엔진·테스트를 함께 맞출 것
- 사회자 화면(프로젝터, `host.html`) 하나를 모두가 보고, 팀 대표 5명만 폰(`play.html`)으로 제출
- 비공개 정보(남은 수치, 보유 카드, 제출 내용, 스카우터 결과, 실무 교섭 병행)는 사회자 화면과 `pub`에 절대 넣지 않음

## 스택
- Vite + TypeScript (프레임워크 없음, HTML 문자열 렌더링), vitest
- Firebase Realtime Database + 익명 로그인 (서버 코드 없음). 프로젝트: `workshopgame-cd3fb` (asia-southeast1)
- GitHub Pages 배포 (`.github/workflows/deploy.yml`, `base: './'`)

## 구조
- `src/deal/engine.ts`: 규칙 엔진 (순수 함수, 입력 불변). 테스트 `engine.test.ts`
- `src/deal/sync.ts`: Firebase 데이터 구조와 읽기/쓰기. 경로 설명은 파일 상단 주석
- `src/deal/view.ts`: 사회자·폰 공용 화면 조각, `src/host.ts`·`src/play.ts`: 각 화면
- 판정은 사회자 브라우저가 담당(엔진 실행 후 multi-path update). 대표는 `submissions`·`requests`·`teams/{t}`에만 씀
- 공개 연출: `pub.events`에 사건마다 테이블·점수 스냅샷을 담고 `pub.revealed`만큼 보여줌
- 보안 규칙 `database.rules.json`은 콘솔에 직접 게시해야 함. 바꾼 뒤 `npm run check:rules`로 검증

## 공통 규칙
- 사용자 입력은 HTML에 넣을 때 반드시 `esc()` 사용, 버튼은 `data-action`으로 연결 (`onAction`)
- Firebase에 쓸 값은 `clean()`으로 undefined 제거, 읽을 때는 `norm*()`으로 빈 배열·객체 기본값 채움

## 명령
- `npm run dev` / `npm test` / `npm run build` (tsc 포함) / `npm run check:rules`
