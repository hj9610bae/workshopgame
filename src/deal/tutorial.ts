/*
 * 게임 설명 + 예시 1라운드.
 * 예시는 진행 순서만 보여 주려고 특수 카드가 없는 안건을 무작위로 골라 늘어놓고, 요구 수치도 예시용 값을 써요.
 * (실제 게임의 첫 테이블·요구 수치가 미리 드러나지 않게) 장면의 결과는 규칙 엔진으로 계산해요.
 */
import { AGENDAS, CARDS, FINAL_AGENDA, LOOT, TEAM_IDS, type Setup, type TeamId } from './data';
import { agendaTitle, beginSubmit, createGame, resolveRound, startRound, type EngineState, type Rng } from './engine';
import type { Hit, Submission, TableState } from './types';

/** 예시 장면. 실제 게임처럼 요구 수치는 가려 두고, 합의될 때만 타결 내용과 이력을 공개 */
export interface Scene {
  kind: 'scene';
  title: string;
  /** 직접 작성한 설명 (HTML 허용, 사용자 입력 아님) */
  text: string;
  tables: TableState[];
  scores: Partial<Record<TeamId, number>>;
  order: TeamId[];
  active?: TeamId;
  /** 이번 장면에서 펼쳐 보이는 제출 용지 */
  slips?: { team: TeamId; sub: Submission }[];
  /** 깎인 테이블 (0부터) */
  hit?: { index: number; amount: number };
  /** 합의: 실제 타결 내용, 블라인드였던 처음 요구 수치와 깎인 이력도 함께 공개 */
  deal?: { index: number; team: TeamId; agenda: number; reward: number; demand: number; trail: Hit[] };
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

/** 예시 제출: A가 합의, B는 새로 온 안건을 공격, C가 깎은 안건을 D가 막타, E는 깎기만 */
export const EXAMPLE_SUBS: Record<TeamId, Submission> = {
  A: { table: 1, card: 'basic', cutIn: 0 },
  B: { table: 1, card: 'basic', cutIn: 0 },
  C: { table: 2, card: 'basic', cutIn: 0 },
  D: { table: 2, card: 'basic', cutIn: 0 },
  E: { table: 3, card: 'basic', cutIn: 0 },
};

/** 예시용 요구 수치 (놓인 순서대로: 테이블 1~3, 대기열 1~2). 실제 값과 무관 */
const EXAMPLE_DEMANDS = [2, 3, 3, 4, 5];

/** 특수 카드가 걸리지 않은 안건 중 무작위 5개로 예시 배치를 만듦 */
export function exampleSetup(rng: Rng = Math.random): Setup {
  const pool = Object.values(AGENDAS)
    .map((a) => a.id)
    .filter((id) => id !== FINAL_AGENDA && !LOOT[id]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ids = pool.slice(0, EXAMPLE_DEMANDS.length);
  return { tables: ids.slice(0, 3), queue: ids.slice(3), demand: Object.fromEntries(ids.map((id, i) => [id, EXAMPLE_DEMANDS[i]])) };
}

const scoresOf = (s: EngineState) => Object.fromEntries(s.pub.teamIds.map((t) => [t, s.pub.teams[t]!.score]));

function base(s: EngineState, title: string, text: string, extra: Partial<Scene> = {}): Scene {
  return {
    kind: 'scene',
    title,
    text,
    tables: structuredClone(s.pub.tables),
    scores: scoresOf(s),
    order: [...s.pub.order],
    ...extra,
  };
}

const tag = (id: number) => `<b>${AGENDAS[id].icon} ${agendaTitle(id)}</b>`;

/** 이 팀 차례의 설명. before: 낸 테이블에 있던 안건, after: 그 뒤 그 테이블의 안건 */
const COMMENTS: Record<TeamId, (before: number, after: number) => string> = {
  A: () =>
    '수치를 <b>0 이하</b>로 만든 팀이 보상을 독식! 합의되는 순간 <b>실제 타결 내용</b>과 숨겨져 있던 <b>요구 수치·깎인 이력</b>이 공개되고, <b>대기열의 다음 안건</b>이 바로 올라와요.',
  B: (_, after) =>
    `B팀도 1번 테이블을 노렸지만 이미 합의됐죠. 카드는 <b>테이블</b>에 거는 것이라 새로 온 ${tag(after)} 안건을 깎아요. 합의되지 않았으니 화면에는 <b>'제안 완료'</b>만 떠요.`,
  C: (before) => `C팀이 ${tag(before)} 안건을 깎았지만 아직 합의 전. 얼마나 남았는지는 <b>아무도 몰라요</b>. 다음 차례는…`,
  D: () => '<b>막타!</b> 공개된 이력을 보면 C팀이 깎아 둔 안건을 D팀이 가져간 게 드러나요. 이것이 이 게임의 핵심 긴장감이에요.',
  E: (before) => `E팀은 ${tag(before)} 안건을 깎았어요. 다음 라운드에 누가 가져갈까요?`,
};

/** 예시 1라운드를 한 팀씩 적용하면서 장면을 만듦 */
export function exampleScenes(rng: Rng = Math.random): Scene[] {
  const start = beginSubmit(startRound(createGame(TEAM_IDS, exampleSetup(rng)), keepOrder).state, 0);
  const scenes: Scene[] = [
    base(
      start,
      '예시 라운드: 시작',
      `모든 팀이 주도권 <b>10점</b>, 기본 제시안만 가지고 시작해요. 순서는 추첨으로 <b>A → B → C → D → E</b>.<br>
        테이블에는 <b>노조 요구안</b>과 합의 보상만 보여요. 요구 수치와 회사 타결안은 <b>합의되는 순간</b> 공개!<br>
        <span class="muted">※ 진행 순서를 보여 드리는 예시라 안건 배치와 수치는 실제 게임과 달라요.</span>`,
    ),
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
    const before = prev.pub.tables[i].agenda;
    const after = next.pub.tables[i].agenda;
    const dealt = after !== before;
    const line = `${team}팀: ${sub.table}번 테이블에 [${CARDS[sub.card].name}]`;
    const extra: Partial<Scene> = { active: team, slips: [{ team, sub }], hit: { index: i, amount: CARDS[sub.card].power } };
    if (dealt) {
      const e = next.pub.events.find((ev) => ev.team === team && ev.agenda === before && ev.demand);
      extra.deal = { index: i, team, agenda: before, reward: AGENDAS[before].reward, demand: e?.demand ?? 0, trail: e?.trail ?? [] };
      extra.fresh = i;
    }
    const title = dealt ? `${line} → ${agendaTitle(before)} 합의!` : `${line} → ${agendaTitle(before)} 제안 완료`;
    scenes.push(base(next, title, COMMENTS[team](before, after), extra));
    prev = next;
  });

  const open = prev.pub.tables.filter((t) => t.agenda).map((t) => tag(t.agenda));
  scenes.push(
    base(
      prev,
      '라운드 종료',
      `점수: ${ORDER.map((t) => `${t} ${prev.pub.teams[t]!.score}`).join(' · ')}<br>
        화면에는 <b>합의된 안건만</b> 타결 내용과 이력이 공개돼요. 아직 합의되지 않은 ${open.join('·')} 안건은 누가 얼마나 깎았는지 비밀이에요.`,
    ),
  );
  const nextRound = startRound(prev).state;
  scenes.push(
    base(
      { ...prev, pub: { ...prev.pub, order: nextRound.pub.order } },
      `2라운드 순서: ${nextRound.pub.order.join(' → ')}`,
      `주도권이 높은 팀부터 제안해요. ${
        prev.pub.teams.A!.score === prev.pub.teams.D!.score ? 'A·D는 동점이라 <b>지난 라운드에 뒤 순번</b>이었던 D가 먼저. ' : ''
      }동점인 B·C·E는 <b>지난 라운드에 뒤 순번</b>이었던 팀부터 <b>E → C → B</b>.`,
    ),
  );
  return scenes;
}

const cardTile = (id: keyof typeof CARDS, power: string) =>
  `<div class="rule-card ${id}"><div class="rule-card-name">${CARDS[id].name}</div><div class="rule-card-power">${power}</div><p>${CARDS[id].desc}</p></div>`;

const hiddenCard = '<div class="rule-card secret"><div class="rule-card-name">특수 카드</div><div class="rule-card-power">?</div><p>합의 전리품으로만 획득</p></div>';

const sample = AGENDAS[3];

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
        <div class="mini-table"><div class="mini-icon">${sample.icon}</div><div class="mini-title">${sample.title}</div><div class="mini-gap">노조 요구<br>${sample.union}</div><div class="mini-reward">합의 보상 +${sample.reward}</div></div>
        <div class="slide-text">
          <p>안건마다 숨겨진 <b>노조 요구 수치</b>가 있어요.</p>
          <p>각 팀이 카드로 수치를 깎고,<br><b>0 이하로 만든 팀이 보상을 독식</b>합니다.</p>
          <p class="muted">남이 깎아 둔 안건을 마지막에 가져갈 수도, 뺏길 수도 있어요.</p>
        </div>
      </div>`,
  },
  {
    kind: 'slide',
    title: '🙈 요구 수치는 블라인드',
    html: `<ul class="slide-list">
        <li>테이블에는 <b>노조 요구안</b>과 <b>합의 보상</b>만 보여요. 요구 수치는 <b>처음 값도, 남은 값도</b> 비공개.</li>
        <li>요구안의 크기와 보상을 보고 얼마나 깎아야 할지 추측하세요. <b>보상이 클수록 수치도 커요.</b></li>
        <li>확인하고 싶으면 <b>🔍 속마음 스카우터</b>(주도권 −1)로 우리 팀만 몰래 볼 수 있어요.</li>
        <li>안건이 <b>합의되는 순간</b> 회사의 <b>실제 타결 내용</b>, 처음 요구 수치, <b>누가 얼마나 깎았는지</b> 이력이 공개돼요.</li>
      </ul>`,
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
    html: `<div class="rule-cards">${cardTile('basic', '−2')}${hiddenCard}</div>
      <ul class="slide-list">
        <li>모든 팀은 <b>기본 제시안</b>만 가지고 시작해요. 매 라운드 몇 번이든 쓸 수 있어요.</li>
        <li>보상에 <b>'특수 카드'</b>가 붙은 안건을 합의하면 <b>전리품</b>으로 특수 카드를 얻어요.</li>
        <li>특수 카드가 무엇인지, 어떤 효과인지는 <b>얻은 팀만</b> 알아요. 진행자가 몰래 알려 드려요.</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: '🔍 아이템 ① 속마음 스카우터 (주도권 −1)',
    html: `<ol class="flow">
        <li><b>언제</b><span>제출 시간(2분) 중 언제든, 몇 번이든</span></li>
        <li><b>신청</b><span>팀 대표가 진행자에게 "<b>N번 테이블 스카우터</b>"</span></li>
        <li><b>바로 확인</b><span>진행자가 그 자리에서 남은 요구 수치를 <b>우리 팀에게만</b> 보여 줘요</span></li>
        <li><b>활용</b><span>결과를 보고 제출 용지를 쓰거나 고쳐서 내면 돼요</span></li>
      </ol>
      <p class="center muted">확인 시점의 값이에요. 이번 라운드에 앞 순번 팀이 먼저 깎으면 내 차례엔 더 줄어 있을 수 있어요.</p>`,
  },
  {
    kind: 'slide',
    title: '⚡ 아이템 ② 새치기 제안 (주도권 −2)',
    html: `<ol class="flow">
        <li><b>신청</b><span>제출 용지에 <b>"새치기 N번째"</b>를 함께 적어요 (1번째 ~ 마지막)</span></li>
        <li><b>비밀 유지</b><span>다른 팀은 모른 채 각자 제출해요</span></li>
        <li><b>짠! 공개</b><span>모든 용지를 입력하고 제안 공개를 시작할 때 <b>"새치기 발생! 새 순서"</b>가 화면에 떠요</span></li>
        <li><b>적용</b><span>바뀐 순서대로 제안이 적용돼요. 막타를 노려 <b>뒤 순번</b>으로 갈 수도 있어요</span></li>
      </ol>
      <div class="cut-example">
        <p><b>2팀 이상 같은 자리를 원하면?</b> 주도권이 높은 팀이 그 자리, 밀린 팀은 <b>바로 다음 빈자리</b>. (동점이면 원래 순번이 앞인 팀) 새치기하지 않은 팀은 남은 자리를 원래 순서대로 채워요. 밀려도 −2는 그대로!</p>
        <p class="muted">예) 원래 순서 A(14) · B(12) · C(10) · D(9) · E(8)에서 D·E가 모두 "1번째" 신청<br>
          → D가 1번째, E는 2번째 → <b>D → E → A → B → C</b></p>
      </div>`,
  },
  {
    kind: 'slide',
    title: '🔁 한 라운드 진행',
    html: `<ol class="flow">
        <li><b>순서 발표</b><span>주도권 높은 순</span></li>
        <li><b>제출 용지 작성 (2분)</b><span>[테이블 + 카드], 필요하면 스카우터·새치기</span></li>
        <li><b>보조자가 입력</b><span>용지를 걷어 화면에 입력</span></li>
        <li><b>제안 공개</b><span>새치기 순서 공개 → 1위 팀부터 차례로 합의 여부 발표</span></li>
        <li><b>라운드 종료</b><span>점수 확인</span></li>
      </ol>
      <p class="center">🏁 <b>4라운드</b>에는 4번 테이블에 <b>성과급(+10)</b> 최종 교섭이 열려요!</p>`,
  },
];

export const OUTRO_SLIDE: Slide = {
  kind: 'slide',
  title: '이제 실제로 해 볼까요?',
  html: `<ul class="slide-list">
      <li>테이블엔 <b>노조 요구안</b>만! 요구 수치와 타결 내용은 <b>합의될 때</b> 공개돼요.</li>
      <li>누가 무엇을 냈는지는 비밀이고, 합의된 안건만 그 이력이 공개돼요.</li>
      <li>얻은 특수 카드와 스카우터 결과는 진행자가 팀에게만 알려 줘요.</li>
    </ul>
    <p class="lead center">막타의 타이밍을 노리세요! 🎲</p>`,
};

export const tutorialSteps = (rng: Rng = Math.random): TutorialStep[] => [...INTRO_SLIDES, ...exampleScenes(rng), OUTRO_SLIDE];
