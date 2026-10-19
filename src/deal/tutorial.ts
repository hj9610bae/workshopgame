/*
 * 항해 설명 슬라이드 + 연습 게임 배치.
 * 설명이 끝나면 실제 진행 화면으로 1일 연습 항해를 해요. 실제 첫 해역·전리품 위치가 드러나지 않게
 * 연습 게임은 역경 순서·전리품을 무작위로 정해요. (생명력은 처음부터 공개라 실제 값을 그대로 씀)
 */
import { AGENDAS, CARDS, CUT_IN_COST, CUT_IN_NAME, FINAL_AGENDA, FINAL_OPEN_ROUND, LOOT_ORDER, ROUNDS, SCOUT_COST, SCOUT_NAME, START_DISTANCE, SUBMIT_SECONDS, type Setup } from './data';
import type { Rng } from './engine';

export interface Slide {
  kind: 'slide';
  title: string;
  /** 직접 작성한 본문 HTML */
  html: string;
  /** 본문 아래에 예시 바다 지도를 그림 (board.ts) */
  sea?: boolean;
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
  };
}

const cardTile = (id: keyof typeof CARDS, power: string) =>
  `<div class="rule-card ${id}"><div class="rule-card-name">${CARDS[id].name}</div><div class="rule-card-power">${power}</div><p>${CARDS[id].desc}</p></div>`;

const hiddenCard = '<div class="rule-card secret"><div class="rule-card-name">특수 무기</div><div class="rule-card-power">?</div><p>역경을 처치한 전리품으로만 획득</p></div>';

const sample = AGENDAS[1];
const final = AGENDAS[FINAL_AGENDA];

export const INTRO_SLIDES: Slide[] = [
  {
    kind: 'slide',
    title: '⛵ 오디세이아 : 귀환의 항해',
    html: `<p class="lead">트로이 전쟁은 끝났다.<br>신화 속 역경을 물리치고 <b>고국 이타카</b>로 가장 먼저 돌아가라!</p>
      <p>함대마다 무기 카드를 던져 해역의 역경을 쓰러뜨리는 게임입니다.<br>${ROUNDS}일간의 항해가 끝났을 때 <b>고국과의 거리</b>가 가장 짧은 함대가 우승!</p>`,
  },
  {
    kind: 'slide',
    title: '🎯 마지막 일격 시스템',
    html: `<div class="slide-row">
        <div class="mini-table"><div class="mini-icon">${sample.icon}</div><div class="mini-title">${sample.title}</div><div class="mini-gap">❤️ 생명력 ${sample.demand}</div><div class="mini-reward">처치 시 ${sample.demand}해리 전진</div></div>
        <div class="slide-text">
          <p>역경마다 <b>생명력</b>이 있어요.</p>
          <p>각 함대가 무기로 생명력을 깎고,<br><b>0 이하로 만든 함대가 전진 보상을 독식</b>합니다.</p>
          <p class="muted">남이 깎아 둔 역경을 마지막에 가져갈 수도, 뺏길 수도 있어요.</p>
        </div>
      </div>`,
  },
  {
    kind: 'slide',
    title: '👁️ 처음 생명력은 공개, 남은 생명력은 비밀',
    html: `<ul class="slide-list">
        <li>해역에는 역경의 <b>처음 생명력</b>이 보여요. 생명력이 곧 처치했을 때 <b>고국으로 전진하는 거리</b>예요.</li>
        <li>다른 함대의 공격은 <b>처치했는지만</b> 공개돼요. 그래서 지금 <b>얼마나 남았는지는</b> 아무도 몰라요.</li>
        <li>궁금하면 <b>🔮 ${SCOUT_NAME}</b>(${SCOUT_COST}해리 후퇴)로 우리 함대만 몰래 볼 수 있어요.</li>
        <li>역경이 <b>쓰러지는 순간</b> <b>누가 얼마나 깎았는지</b> 공격 이력이 공개돼요.</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: '🧭 고국과의 거리 = 점수',
    sea: true,
    html: `<ul class="slide-list">
        <li>모든 함대는 고국까지 <b>${START_DISTANCE}해리</b>에서 출발해요. 역경을 처치하면 생명력만큼 <b>전진</b>!</li>
        <li><b>순서</b>: 고국에 가까운 함대부터 공격해요. (동점이면 지난 날 뒤 순번이 먼저)</li>
        <li><b>아이템</b>을 쓰면 그만큼 <b>뒤로 밀려요</b>. 지금 쓰면 우승에서 멀어진다는 것!</li>
        <li><b>${ROUNDS}일차 종료</b> 후 고국에 가장 가까운 함대가 우승. <b>음수</b>면 이미 이타카 내륙까지 들어간 완벽한 귀환!</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: '⚔️ 공격 무기: 매일 1장을 해역 1곳에',
    html: `<div class="rule-cards">${cardTile('basic', '−2')}${hiddenCard}</div>
      <ul class="slide-list">
        <li>모든 함대는 <b>${CARDS.basic.name}</b>만 가지고 출발해요. 매일 쓸 수 있어요.</li>
        <li>보상에 <b>'특수 무기'</b>가 붙은 역경을 처치하면 <b>전리품</b>으로 특수 무기를 얻어요.</li>
        <li>특수 무기가 무엇인지, 어떤 힘인지는 <b>얻은 함대만</b> 알아요. 실물 카드에 효과가 적혀 있어요.</li>
        <li>특수 무기 중에는 공격 무기와 <b>함께 추가로</b> 낼 수 있는 것도 있어요.</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: `🔮 아이템 ① ${SCOUT_NAME} (${SCOUT_COST}해리 후퇴)`,
    html: `<ol class="flow">
        <li><b>언제</b><span>제출 시간(${SUBMIT_SECONDS / 60}분) 중 언제든, 몇 번이든</span></li>
        <li><b>신청</b><span>함대 대표가 진행자에게 "<b>N번 해역 예지</b>"</span></li>
        <li><b>바로 확인</b><span>진행자가 그 자리에서 남은 생명력을 <b>우리 함대에게만</b> 보여 줘요</span></li>
        <li><b>활용</b><span>결과를 보고 제출 용지를 쓰거나 고쳐서 내면 돼요</span></li>
      </ol>
      <p class="center muted">확인 시점의 값이에요. 오늘 앞 순번 함대가 먼저 깎으면 내 차례엔 더 줄어 있을 수 있어요.</p>`,
  },
  {
    kind: 'slide',
    title: `💨 아이템 ② ${CUT_IN_NAME} (${CUT_IN_COST}해리 후퇴)`,
    html: `<ol class="flow">
        <li><b>신청</b><span>포스트잇에 <b>"순풍 N번째"</b>를 함께 적어요 (1번째 ~ 마지막)</span></li>
        <li><b>비밀 유지</b><span>다른 함대는 모른 채 각자 제출해요</span></li>
        <li><b>짠! 공개</b><span>모든 용지를 입력하고 공격 공개를 시작할 때 <b>"순풍! 새 순서"</b>가 화면에 떠요</span></li>
        <li><b>적용</b><span>바뀐 순서대로 공격해요. 마지막 일격을 노려 <b>뒤 순번</b>으로 갈 수도 있어요</span></li>
      </ol>
      <div class="cut-example">
        <p><b>2함대 이상 같은 자리를 원하면?</b> 고국에 가까운 함대가 그 자리, 밀린 함대는 <b>바로 다음 빈자리</b>. (같으면 원래 순번이 앞인 함대) 순풍을 쓰지 않은 함대는 남은 자리를 원래 순서대로 채워요. 밀려도 ${CUT_IN_COST}해리 후퇴는 그대로!</p>
        <p class="muted">예) 원래 순서 A(11해리) · B(13) · C(15) · D(16) · E(17)에서 D·E가 모두 "1번째" 신청<br>
          → D가 1번째, E는 2번째 → <b>D → E → A → B → C</b></p>
      </div>`,
  },
  {
    kind: 'slide',
    title: '🔁 하루 항해 진행',
    html: `<ol class="flow">
        <li><b>순서 발표</b><span>고국에 가까운 순</span></li>
        <li><b>포스트잇 작성 (${SUBMIT_SECONDS / 60}분)</b><span>[함대 + 해역 + 무기], 필요하면 예지·순풍</span></li>
        <li><b>보조자가 입력</b><span>포스트잇을 걷어 화면에 입력</span></li>
        <li><b>공격 공개</b><span>순풍 순서 공개 → 1위 함대부터 차례로 처치 여부 발표</span></li>
        <li><b>하루 끝</b><span>고국과의 거리 확인</span></li>
      </ol>
      <p class="center">👑 <b>${FINAL_OPEN_ROUND}일차</b>에는 4번 해역에 <b>${final.title}</b>(생명력 ${final.demand})이 열려요!</p>`,
  },
];

export const OUTRO_SLIDE: Slide = {
  kind: 'slide',
  title: '🎲 연습 항해로 하루 해 볼까요?',
  html: `<ul class="slide-list">
      <li>실제 게임과 똑같은 화면으로 <b>하루만</b> 연습해요. 거리는 실제 게임에 이어지지 않아요.</li>
      <li>연습 항해의 역경 순서·전리품 위치는 <b>무작위</b>라 실제 게임과 달라요.</li>
      <li>남은 생명력은 비밀! 공격 이력은 역경이 <b>쓰러질 때</b> 공개돼요.</li>
    </ul>
    <button class="practice-btn" data-action="practice">▶ 연습 항해 시작</button>`,
};

export const tutorialSteps = (): Slide[] => [...INTRO_SLIDES, OUTRO_SLIDE];
