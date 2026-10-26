# 💼 교섭의 도박사들 : Deal or No Deal

워크샵용 팀 대항 교섭 게임입니다. 규칙은 [`docs/rules.md`](docs/rules.md)를 참고하세요.

두 가지 진행 방식이 있어요.

**① 현장 진행 (`board.html`, 추천)**: 폰 없이 프로젝터 한 화면만 씁니다.
- 팀은 종이 제출 용지에 [테이블 + 카드](+ 스카우터·새치기)를 적어 보조자에게 냅니다.
- 보조자가 화면에서 클릭으로 입력하면 공개 연출이 진행돼요. Firebase 없이 이 브라우저에만 저장(새로고침해도 이어짐, ↶ 되돌리기 가능).
- 처음 화면의 **📖 게임 설명 & 예시 라운드**로 규칙 설명과 1라운드 예시를 클릭(또는 자동 재생)으로 보여줄 수 있어요.
- 노트북 + 프로젝터를 **확장 모드**로 쓰면 **🖥 진행자 창**을 노트북에 띄워 제출 입력·남은 수치·보유 카드를 비공개로 볼 수 있어요. 진행자 창이 열려 있는 동안 프로젝터 화면에는 조작 버튼이 사라져요.
- 단축키: Space·→ 다음 진행, Ctrl+Z 되돌리기 (프레젠터 리모컨으로 넘길 수 있음)

**② 폰 제출 (`host.html` + `play.html`)**
- **사회자**: 프로젝터에 연결한 PC에서 `host.html`을 열어 방을 만들고 진행해요. 모두가 이 화면을 봐요.
- **팀 대표(5명)**: 폰으로 QR을 찍고 팀을 선택한 뒤, 매 라운드 제안을 제출해요.

기술 스택: Vite + TypeScript, Firebase Realtime Database(실시간 동기화) + 익명 로그인, GitHub Pages(호스팅)

---

## 1. Firebase 설정 (처음 한 번)

1. <https://console.firebase.google.com> 에서 **프로젝트 추가** (Google 애널리틱스는 꺼도 돼요)
2. **빌드 > Realtime Database > 데이터베이스 만들기**
   - 위치: **싱가포르(asia-southeast1)** (한국에서 가장 가까움)
   - 보안 규칙: **잠금 모드**로 시작
   - 만든 뒤 **규칙** 탭에 이 저장소의 `database.rules.json` 내용을 붙여넣고 **게시**
3. **빌드 > Authentication > 시작하기 > 로그인 방법 > 익명** 사용 설정
4. **프로젝트 설정(톱니바퀴) > 일반 > 내 앱 > 웹 앱 추가(</>)**
   - 표시되는 `firebaseConfig` 값을 `src/firebase-config.ts`에 붙여넣기
   - `databaseURL` 이 비어 있으면 Realtime Database 화면 상단의 URL(`https://...firebasedatabase.app`)을 넣어주세요.
5. **Authentication > 설정 > 승인된 도메인**에 `<GitHub아이디>.github.io` 추가

> 무료(Spark) 플랜: 동시 접속 100명, 저장 1GB, 월 다운로드 10GB. 30명 워크샵에는 충분해요.

## 2. 로컬에서 실행

```bash
npm install
npm run dev
```

- 브라우저에서 `http://localhost:5173/host.html` 로 방을 만들고,
  **다른 탭**에서 `http://localhost:5173/play.html` 로 참가해보세요.
- 개발 모드에서는 탭마다 다른 참가자로 인식돼요. (배포 버전은 기기당 한 명)

## 3. GitHub Pages 배포

1. GitHub에 저장소를 만들고 이 프로젝트를 `main` 브랜치에 push
2. 저장소 **Settings > Pages > Source** 를 **GitHub Actions** 로 선택
3. 이후 `main`에 push할 때마다 자동으로 빌드·배포돼요. (`.github/workflows/deploy.yml`)
4. 주소: `https://<GitHub아이디>.github.io/<저장소이름>/`

## 진행 방법 (사회자)

1. `host.html`을 열면 방이 만들어지고 QR이 나와요. 팀 대표들이 QR로 접속해 팀을 선택해요.
2. **게임 시작** → 순서 발표 → **비공개 제출 시작**(2분 타이머) → **제안 공개** → **다음 공개**를 눌러 하나씩 발표 → **다음 라운드**
3. 5라운드가 끝나면 **최종 결과 발표**를 눌러 순위와 클로징 멘트를 띄워요.

- 사회자 PC가 판정을 담당하니 **게임 중에는 사회자 탭을 닫지 마세요.** 실수로 닫았다면 같은 주소로 다시 열면 이어서 진행돼요.
- 대표 폰이 바뀌면 대기실에서 그 팀의 **해제**를 누른 뒤 새 폰으로 다시 선택하세요.

## 구조

| 파일 | 역할 |
|---|---|
| `docs/rules.md` | 규칙서 (구현 기준) |
| `src/deal/data.ts` | 안건·카드·숫자 설정 |
| `src/deal/engine.ts` | 규칙 엔진 (`npm test`로 검증) |
| `src/deal/sync.ts` | Firebase 데이터 구조와 읽기/쓰기 |
| `src/host.ts` / `src/play.ts` | 사회자 화면 / 팀 대표 폰 |
| `database.rules.json` | 보안 규칙. 대표는 다른 팀 카드·남은 수치를 볼 수 없음. 바꾸면 콘솔에 다시 게시 후 `npm run check:rules` |

## 워크샵 당일 체크리스트

- [ ] 행사장 Wi-Fi 또는 모바일 데이터로 접속 테스트
- [ ] 호스트 화면은 노트북/아이패드를 충전기에 연결
- [ ] 팀 대표에게 "화면을 끄지 말고, 끊기면 새로고침" 안내
- [ ] 사회자 PC 절전 모드 해제

## 아이콘 출처
현장 진행 화면의 역경·무기 픽토그램(`src/deal/icons.ts`)은 [game-icons.net](https://game-icons.net)의 아이콘입니다 (Lorc, Delapouite 외, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)).
