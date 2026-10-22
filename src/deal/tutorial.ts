/*
 * 항해 설명 슬라이드 + 연습 게임 배치.
 * 설명이 끝나면 실제 진행 화면으로 PRACTICE_DAYS 일 연습 항해를 해요. 실제 첫 해역·전리품 위치가 드러나지 않게
 * 연습 게임은 역경 순서·전리품을 무작위로 정해요. (생명력은 처음부터 공개라 실제 값을 그대로 씀)
 */
import { AGENDAS, CARDS, PRACTICE_DAYS, CUT_IN_COST, CUT_IN_NAME, FINAL_AGENDA, INITIAL_TABLES, LOOT, LOOT_ORDER, QUEUE, ROUNDS, SCOUT_COST, SCOUT_NAME, START_DISTANCE, SUBMIT_SECONDS, type CardId, type Setup } from './data';
import { adversaryCard, deckOf, weaponCard } from './felt';
import type { Rng } from './engine';

export interface Slide {
  kind: 'slide';
  title: string;
  /** 직접 작성한 본문 HTML */
  html: string;
  /** 본문 아래에 예시 바다 지도를 그림 (board.ts): start = 모두 출발점, order = 거리가 제각각인 순서 예시 */
  sea?: 'start' | 'order';
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 연습 게임 배치: 최종 결전을 뺀 역경을 섞어 해역 3 + 대기열, 전리품도 무작위 역경에 */
export function practiceSetup(rng: Rng = Math.random): Setup {
  const ids = shuffled(
    Object.values(AGENDAS)
      .map((a) => a.id)
      .filter((id) => id !== FINAL_AGENDA),
    rng,
  );
  const lootAt = shuffled(ids, rng).slice(0, LOOT_ORDER.length);
  return {
    tables: ids.slice(0, 3),
    queue: ids.slice(3),
    demand: Object.fromEntries(ids.map((id) => [id, AGENDAS[id].demand])),
    loot: Object.fromEntries(lootAt.map((id, i) => [id, LOOT_ORDER[i]])),
    practice: true,
  };
}

/** 설명용 역경 카드: 실제 게임과 같은 양식, 무기는 풀네임 */
const card = (id: number, shownHp?: string): string => adversaryCard(id, AGENDAS[id].demand, LOOT[id], shownHp, true);

/** 설명용 해역: 실제 게임의 처음 해역 3곳 + 옆에 대기열 예시 */
const exampleWaters = (): string =>
  `<div class="waters-example">
    <div class="chart-mini">${INITIAL_TABLES.map((id, i) => `<div class="ftable"><div class="ftable-no"><span>⚑ ${i + 1}번 해역</span></div>${card(id)}</div>`).join('')}</div>
    ${deckOf(QUEUE, (id) => AGENDAS[id].demand, (id) => LOOT[id], 6)}
  </div>`;

const weapons = (ids: CardId[], secret = false): string =>
  `<div class="weapon-cards">${ids.map((id) => weaponCard(id, secret && id !== 'basic')).join('')}</div>`;

/* 공격 적용 예시 장면: 실제 게임과 같은 카드로 순서대로 보여 줌 */
const step = (label: string) => `<div class="scene-step"><span>➜</span><small>${label}</small></div>`;
const panel = (inner: string, caption: string, cls = '') => `<figure class="scene-panel ${cls}">${inner}<figcaption>${caption}</figcaption></figure>`;
const [lotus, wind] = INITIAL_TABLES;
const nextInQueue = QUEUE[0];

/** ①: 바람 자루(3)를 C −2(남은 생명력 비공개) → D −2로 돌파, 넘친 1은 소멸 */
const sceneOverkill = (): string =>
  `<div class="scene">
    ${panel(card(wind), '2번 해역')}
    ${step('1번째 · C함대<br>🗡️ 단검 −2')}
    ${panel(card(wind, '?'), '남은 생명력은 <b>비공개</b>', 'mystery')}
    ${step('2번째 · D함대<br>🗡️ 단검 −2')}
    ${panel(`<div class="scene-burst"><b>돌파!</b><span>D함대 ${AGENDAS[wind].demand}해리 전진</span><span>${CARDS[LOOT[wind]!].icon} ${CARDS[LOOT[wind]!].name} 획득</span></div>`, '넘친 공격력 1은 <b>소멸</b>')}
  </div>`;

/** ②: A가 1번 해역 로투스를 돌파 → 마지막 공격 함대 공개 → 대기열 맨 위가 1번 해역으로 → 뒤 순서 B는 새 역경을 공격 */
const sceneRefill = (): string =>
  `<div class="scene">
    ${panel(card(lotus), '1번 해역')}
    ${step('1번째 · A함대<br>🗡️ 단검 −2')}
    ${panel(`<div class="scene-burst"><b>돌파!</b><span>A함대 공개</span><span>${AGENDAS[lotus].demand}해리 전진 · ${CARDS[LOOT[lotus]!].icon} 획득</span></div>`, '마지막 공격 함대가 보상')}
    ${step('대기열 맨 위가<br>빈자리로')}
    ${panel(card(nextInQueue), '새로 온 역경 (1번 해역)')}
    ${step('2번째 · B함대<br>1번 해역 선택')}
    ${panel(`<div class="scene-burst calm"><b>−2</b><span>B함대는 새 역경을 공격</span></div>`, '같은 해역 번호 그대로')}
  </div>`;

export const INTRO_SLIDES: Slide[] = [
  {
    kind: 'slide',
    title: '⛵ 오디세이아 : 귀환의 항해',
    html: `<p class="lead">트로이 전쟁은 끝났다.<br>신화 속 역경을 돌파하고 <b>고국 이타카</b>로 가장 먼저 돌아가라!</p>
      <p>함대마다 무기를 가지고 신화 속 역경을 돌파하는 게임입니다.<br>${ROUNDS}일간의 항해가 끝났을 때 <b>고국과의 거리</b>가 가장 짧은 함대가 우승!</p>`,
  },
  {
    kind: 'slide',
    title: '🧭 고국과의 거리',
    sea: 'start',
    html: `<div class="slide-row">
        <ul class="slide-list">
          <li>모든 함대는 고국에서부터 <b>${START_DISTANCE}해리</b> 떨어진 <b>트로이 전장</b>에서 출발해요.</li>
          <li>모든 함대는 <b>${CARDS.basic.name} (기본 무기)</b>만 가지고 출발해요.</li>
        </ul>
      </div>`,
  },
  {
    kind: 'slide',
    title: '📣 공격 순서 발표',
    sea: 'order',
    html: `<ul class="slide-list">
        <li><b>고국에 가까운 함대부터</b> 공격해요.</li>
        <li>첫날은 <b>랜덤</b>으로 순서가 정해져요.</li>
        <li>단, 둘째 날부터 고국과의 거리가 <b>같은</b> 경우 전날에 공격 순서가 <b>빨랐던 함대를 뒤 순서</b>로 배치해요.</li>
      </ul>
      <p class="muted">예) B·C함대가 모두 9해리, 전날 C함대가 먼저 공격했다면 오늘은 <b>B → C</b></p>`,
  },
  {
    kind: 'slide',
    title: '🗺️ 해역과 대기열',
    html: `${exampleWaters()}
      <ul class="slide-list">
        <li>해역과 대기열에 공격 대상인 <b>'역경'</b>이 화면을 통해 공개되며, 모든 역경은 각기 다른 <b>생명력</b>과 <b>전리품</b>(특수 무기 카드)을 가지고 있어요.</li>
        <li>생명력은 하트와 숫자로 표시되고, 역경을 돌파하면 <b>역경의 생명력만큼 고국으로 전진</b>해요.</li>
        <li>함대는 <b>해역상의 역경만</b> 공격할 수 있어요. (매 라운드 1회 반드시 공격)</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: `⚔️ 해역 및 무기 선택 (${SUBMIT_SECONDS / 60}분)`,
    html: `${weapons(['basic', 'blitz', 'practice', 'promo', 'hold'], true)}
      <ul class="slide-list">
        <li>각 함대는 ${SUBMIT_SECONDS / 60}분 안에 <b>공격할 해역의 번호</b>를 선택하고, 공격에 사용할 <b>무기 카드 1장</b>을 제시하여 <b>포스트잇</b>에 작성해요.</li>
        <li>기본 무기 카드(${CARDS.basic.name})는 제시 후 돌려받지만, <b>특수 무기 카드는 사용 즉시 버려져</b> 돌려받지 못해요.</li>
        <li>공격 시 제출한 무기의 <b>공격력만큼</b> 해당 해역에 있는 역경의 생명력이 감소하며, 생명력이 <b>0</b>이 되면 돌파돼요.</li>
        <li>특수 무기의 <b>이름</b>은 게임 중에 공개되지만, <b>실제 효과</b>는 그 무기를 획득한 함대만 알 수 있어요.</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: '💥 공격 적용 ① 순서대로 자동 공격',
    html: `<ul class="slide-list">
        <li>함대들이 해역 및 무기 선택을 마치면, 정해진 공격 순서에 따라 <b>자동으로 공격</b>이 진행돼요.</li>
        <li>공격 적용 시 역경의 <b>잔여 생명력</b>, 함대의 <b>해역 및 무기 선택 결과</b>는 공개되지 않아요.</li>
        <li>역경의 잔여 생명력보다 더 큰 공격력의 무기가 사용됐다면, 역경은 돌파되고 <b>남은 공격력은 소멸</b>돼요.</li>
      </ul>
      ${sceneOverkill()}`,
  },
  {
    kind: 'slide',
    title: '💥 공격 적용 ② 돌파와 빈자리 채우기',
    html: `<ul class="slide-list">
        <li>역경 돌파 시, 해당 역경을 <b>마지막으로 공격한 함대</b>가 공개되며 그 함대가 고국으로 전진하고 전리품을 획득해요.</li>
        <li>돌파한 역경은 즉시 해역에서 제거되고, <b>대기열 가장 위쪽</b>에 있는 역경이 해당 해역의 빈자리를 채워요.</li>
        <li>이때, 뒤 순서 함대 중 역경이 돌파된 해역을 선택한 함대들은 <b>새로 빈자리를 채운 역경</b>을 공격하게 돼요.</li>
        <li>모든 함대가 공격을 마치면, 라운드가 종료돼요.</li>
      </ul>
      ${sceneRefill()}`,
  },
  {
    kind: 'slide',
    title: '🛒 특수 아이템 구매',
    html: `<p>다음 두 가지의 특수 아이템은 포스트잇 제출 기간 중 언제든지 사용할 수 있어요. 단, 아이템 사용에 따라 <b>고국에서 멀어집니다.</b></p>
      <div class="item-cards">
        <div class="item-card"><span class="pictogram">👁️</span><b>${SCOUT_NAME}</b><span>현재 해역에 있는 역경의 생명력을 확인할 수 있다.</span><em>${SCOUT_COST}해리 후퇴</em></div>
        <div class="item-card"><span class="pictogram">🌬️</span><b>${CUT_IN_NAME}</b><span>자신의 순서를 원하는 순서로 바꾼다.</span><em>${CUT_IN_COST}해리 후퇴</em></div>
      </div>
      <div class="cut-example">
        <p><b>2함대 이상 같은 자리를 원하면?</b> 고국에 가까운 함대가 그 자리, 밀린 함대는 <b>바로 다음 빈자리</b>. (같으면 원래 순번이 앞인 함대) 순풍을 쓰지 않은 함대는 남은 자리를 원래 순서대로 채운다. 밀려도 ${CUT_IN_COST}해리 후퇴는 그대로!</p>
        <p class="muted">예) 원래 순서 A(11해리) · B(13) · C(15) · D(16) · E(17)에서 D·E가 모두 "1번째" 신청<br>
          → D가 1번째, E는 2번째 → <b>D → E → A → B → C</b></p>
      </div>`,
  },
  {
    kind: 'slide',
    title: '🏁 게임 종료',
    html: `<p class="lead">${ROUNDS}일간의 항해가 끝나면 게임이 종료돼요.</p>
      <p>그때 <b>고국과의 거리가 가장 짧은 함대</b>가 우승!</p>`,
  },
];

export const OUTRO_SLIDE: Slide = {
  kind: 'slide',
  title: `🎲 연습 항해로 ${PRACTICE_DAYS}일 해 볼까요?`,
  html: `<ul class="slide-list">
      <li>실제 게임과 똑같은 화면으로 <b>${PRACTICE_DAYS}일</b> 연습해요. 거리는 실제 게임에 이어지지 않아요.</li>
      <li>연습 항해의 역경 순서·전리품 위치는 <b>무작위</b>라 실제 게임과 달라요.</li>
      <li>남은 생명력은 비밀! 역경이 돌파되면 <b>마지막으로 공격한 함대</b>만 공개돼요.</li>
    </ul>
    <button class="practice-btn" data-action="practice">▶ 연습 항해 시작</button>`,
};

export const tutorialSteps = (): Slide[] => [...INTRO_SLIDES, OUTRO_SLIDE];
