/*
 * 게임 설명 + 예시 1라운드 (docs/rules.md 5장).
 * 예시 장면의 숫자는 규칙 엔진으로 계산하므로 규칙을 바꾸면 자동으로 따라가요.
 */
import { AGENDAS, CARDS, TEAM_IDS, type TeamId } from './data';
import { agendaTitle, beginSubmit, createGame, resolveRound, startRound, type EngineState } from './engine';
import type { Submission, TableState } from './types';

/** 예시 장면: 남은 수치를 공개해서 보여줌 (실제 게임에서는 비공개) */
export interface Scene {
  kind: 'scene';
  title: string;
  /** 직접 작성한 설명 (HTML 허용, 사용자 입력 아님) */
  text: string;
  tables: TableState[];
  remaining: number[];
  scores: Partial<Record<TeamId, number>>;
  order: TeamId[];
  active?: TeamId;
  /** 이번 장면에서 펼쳐 보이는 제출 용지 */
  slips?: { team: TeamId; sub: Submission }[];
  /** 깎인 테이블 (0부터) */
  hit?: { index: number; amount: number };
  deal?: { index: number; team: TeamId; agenda: number; reward: number };
  /** 이번 장면에 새로 들어온 안건이 있는 테이블 (0부터) */
  fresh?: number;
}

export interface Slide {
  kind: 'slide';
  title: string;
  /** 직접 작성한 본문 HTML */
  html: string;
}

export type TutorialStep = Slide | Scene;

const keepOrder = () => 0.999;
const ORDER: TeamId[] = [...TEAM_IDS];

/** 규칙서 5장의 1라운드 제출 */
export const EXAMPLE_SUBS: Record<TeamId, Submission> = {
  A: { table: 1, card: 'basic', cutIn: 0 },
  B: { table: 1, card: 'basic', cutIn: 0 },
  C: { table: 2, card: 'basic', cutIn: 0 },
  D: { table: 2, card: 'basic', cutIn: 0 },
  E: { table: 3, card: 'basic', cutIn: 0 },
};

const scoresOf = (s: EngineState) => Object.fromEntries(s.pub.teamIds.map((t) => [t, s.pub.teams[t]!.score]));

function base(s: EngineState, title: string, text: string, extra: Partial<Scene> = {}): Scene {
  return {
    kind: 'scene',
    title,
    text,
    tables: structuredClone(s.pub.tables),
    remaining: [...s.secret.remaining],
    scores: scoresOf(s),
    order: [...s.pub.order],
    ...extra,
  };
}

const COMMENTS: Partial<Record<TeamId, string>> = {
  A: '수치를 <b>0 이하</b>로 만든 팀이 보상을 독식! 합의된 안건은 사라지고 <b>대기열의 다음 안건</b>이 바로 올라와요.',
  B: 'B팀은 검진비를 노렸지만 이미 합의됐죠. 카드는 <b>테이블</b>에 거는 것이라 <b>새로 온 안건</b>을 깎게 돼요.',
  C: 'C팀이 난임시술을 1까지 깎아 놓았어요. 다음 차례는…',
  D: '<b>막타!</b> C팀이 깎아 둔 안건을 D팀이 가져갔어요. 이것이 이 게임의 핵심 긴장감이에요.',
  E: 'E팀은 체육대회를 1까지 깎았어요. 다음 라운드에 누가 가져갈까요?',
};

/** 예시 1라운드를 한 팀씩 적용하면서 장면을 만듦 */
export function exampleScenes(): Scene[] {
  const start = beginSubmit(startRound(createGame(TEAM_IDS), keepOrder).state, 0);
  const scenes: Scene[] = [
    base(start, '예시 1라운드: 시작', '모든 팀이 주도권 <b>10점</b>, 기본 제시안만 가지고 시작해요. 순서는 추첨으로 <b>A → B → C → D → E</b>.'),
    base(
      start,
      '각 팀이 제출 용지를 냅니다',
      '팀마다 <b>[테이블 번호 + 카드]</b>를 적어 보조자에게 비공개로 내요. 실제 게임에서는 서로의 용지를 볼 수 없어요.',
      { slips: ORDER.map((team) => ({ team, sub: EXAMPLE_SUBS[team] })) },
    ),
  ];

  let prev = start;
  ORDER.forEach((team, k) => {
    // 앞에서부터 k+1 팀까지만 제출했다고 보고 적용 → 이 팀 차례 직후의 상태
    const partial = Object.fromEntries(ORDER.slice(0, k + 1).map((t) => [t, EXAMPLE_SUBS[t]]));
    const next = resolveRound(start, partial).state;
    const sub = EXAMPLE_SUBS[team];
    const i = sub.table - 1;
    const before = prev.secret.remaining[i];
    const beforeAgenda = prev.pub.tables[i].agenda;
    const dealt = next.pub.tables[i].agenda !== beforeAgenda;
    const power = CARDS[sub.card].power;
    const line = `${team}팀: ${sub.table}번 테이블에 [${CARDS[sub.card].name}] → ${agendaTitle(beforeAgenda)} ${before} → ${before - power}`;
    const extra: Partial<Scene> = { active: team, slips: [{ team, sub }], hit: { index: i, amount: power } };
    if (dealt) {
      const a = AGENDAS[beforeAgenda];
      extra.deal = { index: i, team, agenda: a.id, reward: a.reward };
      extra.fresh = i;
    }
    const title = dealt ? `${line} 합의!` : line;
    scenes.push(base(next, title, COMMENTS[team] ?? '', extra));
    prev = next;
  });

  scenes.push(
    base(
      prev,
      '라운드 종료',
      `점수: ${ORDER.map((t) => `${t} ${prev.pub.teams[t]!.score}`).join(' · ')}<br>사회자 화면에는 <b>누가 합의했는지만</b> 나오고, 누가 어디에 어떤 카드를 냈는지와 남은 수치는 비밀이에요.`,
    ),
  );
  const nextRound = startRound(prev).state;
  scenes.push(
    base(
      { ...prev, pub: { ...prev.pub, order: nextRound.pub.order } },
      `2라운드 순서: ${nextRound.pub.order.join(' → ')}`,
      '주도권이 높은 팀부터 제안해요. A·D 동점이면 <b>지난 라운드에 뒤 순번</b>이었던 D가 먼저. B·C·E도 같은 방식으로 <b>E → C → B</b>.',
    ),
  );
  return scenes;
}

const cardTile = (id: keyof typeof CARDS, tag: string) =>
  `<div class="rule-card ${id}"><div class="rule-card-name">${CARDS[id].name}</div><div class="rule-card-power">${tag}</div><p>${CARDS[id].desc}</p></div>`;

export const INTRO_SLIDES: Slide[] = [
  {
    kind: 'slide',
    title: '💼 교섭의 도박사들 : Deal or No Deal',
    html: `<p class="lead">노조 요구안의 타결 장벽을 넘어<br><b>회사의 교섭 주도권</b>을 극대화하라!</p>
      <p>팀별로 협상 테이블에 제시안 카드를 던져 안건을 합의시키는 게임입니다.<br>5라운드 뒤 <b>주도권 점수</b>가 가장 높은 팀이 우승!</p>`,
  },
  {
    kind: 'slide',
    title: '🎯 막타 시스템',
    html: `<div class="slide-row">
        <div class="mini-table"><div class="mini-title">안건 3 · 검진비</div><div class="mini-num">2</div><div class="mini-reward">합의 보상 +2</div></div>
        <div class="slide-text">
          <p>안건마다 <b>노조 요구 수치</b>가 있어요.</p>
          <p>각 팀이 카드로 수치를 깎고,<br><b>0 이하로 만든 팀이 보상을 독식</b>합니다.</p>
          <p class="muted">남이 깎아 둔 안건을 마지막에 가져갈 수도, 뺏길 수도 있어요.</p>
          <p class="muted">남은 수치는 <b>비공개</b>! 처음 수치만 공개돼요.</p>
        </div>
      </div>`,
  },
  {
    kind: 'slide',
    title: '💰 교섭 주도권 = 점수',
    html: `<ul class="slide-list">
        <li><b>시작 10점</b>. 안건을 합의하면 보상만큼 올라가요.</li>
        <li><b>순서</b>: 주도권이 높은 팀부터 제안해요. (동점이면 지난 라운드 뒤 순번이 먼저)</li>
        <li><b>아이템</b>을 사면 주도권이 줄어요. 지금 쓰면 우승 점수가 줄어든다는 것!</li>
        <li><b>5라운드 종료</b> 후 주도권이 가장 높은 팀이 우승.</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: '🃏 제시안 카드: 매 라운드 1장을 테이블 1곳에',
    html: `<div class="rule-cards">
        ${cardTile('basic', '−2')}${cardTile('blitz', '−6')}${cardTile('practice', '−10')}${cardTile('promo', '−1/라운드')}${cardTile('hold', '무효')}
      </div>
      <p class="center">처음에는 <b>기본 제시안</b>만! 특수 카드는 안건을 합의하면 받는 <b>전리품</b>이에요.</p>`,
  },
  {
    kind: 'slide',
    title: '💡 주도권 아이템',
    html: `<div class="rule-cards two">
        <div class="rule-card item"><div class="rule-card-name">🔍 속마음 스카우터</div><div class="rule-card-power">주도권 −1</div><p>테이블 1곳의 <b>현재 남은 요구 수치</b>를 우리 팀만 몰래 확인</p></div>
        <div class="rule-card item"><div class="rule-card-name">⚡ 새치기 제안</div><div class="rule-card-power">주도권 −2</div><p>이번 라운드 제안 순번을 <b>원하는 자리</b>로 변경</p></div>
      </div>
      <p class="center muted">제출할 때 보조자에게 함께 신청하세요.</p>`,
  },
  {
    kind: 'slide',
    title: '🔁 한 라운드 진행',
    html: `<ol class="flow">
        <li><b>순서 발표</b><span>주도권 높은 순</span></li>
        <li><b>제출 용지 작성 (2분)</b><span>[테이블 + 카드], 필요하면 스카우터·새치기</span></li>
        <li><b>보조자가 입력</b><span>용지를 걷어 화면에 입력</span></li>
        <li><b>제안 공개</b><span>안건 보류 먼저 → 1위 팀부터 차례로</span></li>
        <li><b>라운드 종료</b><span>홍보물 효과 → 점수 확인</span></li>
      </ol>
      <p class="center">🏁 <b>4라운드</b>에는 4번 테이블에 <b>성과급(+10)</b> 최종 교섭이 열려요!</p>`,
  },
];

export const OUTRO_SLIDE: Slide = {
  kind: 'slide',
  title: '이제 실제로 해 볼까요?',
  html: `<ul class="slide-list">
      <li>실제 게임에서는 테이블의 남은 수치가 <b>?</b>로 가려져 있어요.</li>
      <li>누가 무엇을 냈는지는 공개되지 않고, <b>합의된 결과만</b> 화면에 나와요.</li>
      <li>얻은 특수 카드와 스카우터 결과는 보조자가 팀에게만 알려 줘요.</li>
    </ul>
    <p class="lead center">막타의 타이밍을 노리세요! 🎲</p>`,
};

export const tutorialSteps = (): TutorialStep[] => [...INTRO_SLIDES, ...exampleScenes(), OUTRO_SLIDE];
