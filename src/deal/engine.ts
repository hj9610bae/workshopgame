/*
 * 오디세이아 규칙 엔진 (docs/rules.md 구현). 코드의 '안건·테이블·합의'는 규칙서의 '역경·해역·돌파'.
 * score 는 전진한 거리(높을수록 좋음)이고, 화면에는 distanceOf()로 '고국과의 거리'를 보여 줘요.
 * Firebase·화면과 무관한 순수 함수라서 테스트로 규칙을 검증할 수 있어요.
 * 모든 함수는 입력 상태를 바꾸지 않고 새 상태를 돌려줍니다.
 */
import {
  AGENDAS,
  CARDS,
  CUT_IN_COST,
  FINAL_AGENDA,
  FINAL_OPEN_ROUND,
  INITIAL_TABLES,
  ROUNDS,
  SCOUT_COST,
  SETUP,
  START_SCORE,
  SUBMIT_SECONDS,
  type CardId,
  type Setup,
  type SpecialCardId,
  type TeamId,
} from './data';
import type { GameEvent, Hand, Note, PublicState, ScoutResult, SecretState, Submission } from './types';

export interface EngineState {
  pub: PublicState;
  secret: SecretState;
  hands: Partial<Record<TeamId, Hand>>;
  /** 역경 배치 (실제 게임은 출항 때 shuffledSetup(), 연습은 practiceSetup()). 없으면 기준 배치(SETUP) */
  setup?: Setup;
}

export type NoteDraft = Omit<Note, 'round'>;

export interface Step {
  state: EngineState;
  /** 팀별 비공개 메시지 */
  notes: Partial<Record<TeamId, NoteDraft[]>>;
}

export type Rng = () => number;

interface Deal {
  /** 보상을 받은 팀 (실무 교섭으로 가로챘으면 그 팀) */
  winner: TeamId;
  /** 실무 교섭 병행으로 가로챈 경우 */
  stolen: boolean;
  agenda: number;
  reward: number;
  card?: SpecialCardId;
  /** 마지막 일격에 쓴 무기 (공개) */
  weapon: CardId;
}

export const emptyHand = (): Hand => ({ blitz: 0, practice: 0, promo: 0, hold: 0 });

export const agendaTitle = (id: number | undefined): string => (id ? AGENDAS[id]?.title ?? '?' : '빈 해역');

const emptyTable = () => ({ agenda: 0, frozen: false, promos: [] as TeamId[] });

export function createGame(teamIds: readonly TeamId[], setup?: Setup): EngineState {
  const { tables, demand } = setup ?? SETUP;
  return {
    pub: {
      stage: 'lobby',
      round: 0,
      deadline: 0,
      teamIds: [...teamIds],
      order: [],
      prevOrder: [],
      tables: [...tables.map((agenda) => ({ ...emptyTable(), agenda })), emptyTable()],
      queue: 0,
      teams: Object.fromEntries(teamIds.map((t) => [t, { score: START_SCORE, deals: 0 }])),
      events: [],
      revealed: 0,
    },
    secret: { remaining: [...tables.map((a) => demand[a]), 0], trail: [[], [], [], []], practice: [] },
    hands: Object.fromEntries(teamIds.map((t) => [t, emptyHand()])),
    ...(setup ? { setup } : {}),
  };
}

/** 한 번의 진행 단계 동안 상태를 바꾸면서 사건과 메시지를 기록 */
class Turn {
  readonly s: EngineState;
  readonly notes: Step['notes'] = {};
  /** 이번 라운드 실무 교섭 병행(가로채기)을 건 팀: 테이블 index → 건 순서대로 */
  readonly steals = new Map<number, TeamId[]>();

  constructor(
    state: EngineState,
    private readonly phase: NoteDraft['phase'],
  ) {
    this.s = structuredClone(state);
    // Firebase 는 빈 배열을 저장하지 않고, 예전에 저장된 게임에는 이력이 없음
    const trail = this.s.secret.trail ?? [];
    this.s.secret.trail = this.s.pub.tables.map((_, i) => trail[i] ?? []);
  }

  get setup(): Setup {
    return this.s.setup ?? SETUP;
  }

  team(t: TeamId) {
    return this.s.pub.teams[t]!;
  }

  hand(t: TeamId): Hand {
    return (this.s.hands[t] ??= emptyHand());
  }

  has(t: TeamId, card: CardId): boolean {
    return card === 'basic' || (card in CARDS && this.hand(t)[card] > 0);
  }

  isOpen(tableNo: number): boolean {
    return Number.isInteger(tableNo) && tableNo >= 1 && tableNo <= this.s.pub.tables.length && this.s.pub.tables[tableNo - 1].agenda > 0;
  }

  event(e: Omit<GameEvent, 'tables' | 'scores'>): number {
    const { pub } = this.s;
    const scores = Object.fromEntries(pub.teamIds.map((t) => [t, this.team(t).score]));
    pub.events.push({ ...e, tables: structuredClone(pub.tables), scores });
    return pub.events.length - 1;
  }

  /** 기본값: 방금 기록한 사건이 공개될 때 함께 보여줌 */
  note(team: TeamId, text: string, event = this.s.pub.events.length - 1) {
    (this.notes[team] ??= []).push({ phase: this.phase, event, text });
  }

  /** 테이블의 요구 수치를 깎고(이력 기록), 0 이하가 되면 보상 지급 후 테이블 보충 */
  damage(tableNo: number, card: CardId, team: TeamId): Deal | null {
    const { pub, secret } = this.s;
    const i = tableNo - 1;
    const agenda = AGENDAS[pub.tables[i]?.agenda];
    if (!agenda) return null;
    const amount = CARDS[card].power;
    secret.remaining[i] -= amount;
    (secret.trail[i] ??= []).push({ team, card, amount });
    if (secret.remaining[i] > 0) return null;
    const loot = this.setup.loot[agenda.id];
    // 실무 교섭 병행: 이번 라운드 이 테이블의 합의는 먼저 건 팀이 가로챔
    const thief = this.steals.get(i)?.shift();
    const winner = thief ?? team;
    // 돌파 보상(전진 거리) = 처음 생명력
    const reward = this.setup.demand[agenda.id];
    this.team(winner).score += reward;
    this.team(winner).deals += 1;
    if (loot) this.hand(winner)[loot] += 1;
    (pub.tables[i].done ??= []).push({ agenda: agenda.id, team: winner });
    this.refill(i);
    return {
      winner,
      stolen: !!thief && thief !== team,
      agenda: agenda.id,
      reward,
      card: loot,
      weapon: card,
    };
  }

  private refill(i: number) {
    const { pub, secret } = this.s;
    // 4번(최종 교섭) 테이블은 보충 없이 닫힘
    const next = i < INITIAL_TABLES.length ? this.setup.queue[pub.queue] : undefined;
    secret.trail[i] = [];
    if (next === undefined) {
      pub.tables[i].agenda = 0;
      secret.remaining[i] = 0;
    } else {
      pub.queue += 1;
      pub.tables[i].agenda = next;
      secret.remaining[i] = this.setup.demand[next];
    }
  }

  result(): Step {
    return { state: this.s, notes: this.notes };
  }
}

/** 공개 화면용 돌파 사건: 돌파한 함대·전리품 이름은 공개, 공격 이력(secret.trail)은 비공개 */
const shown = ({ card, winner, stolen, ...deal }: Deal) => ({ ...deal, ...(card ? { loot: card } : {}), ...(stolen ? { stolenBy: winner } : {}) });

const dealText = (deal: Deal) =>
  `${agendaTitle(deal.agenda)} 돌파! ${deal.reward}해리 전진${deal.card ? ` · 특수 무기 [${CARDS[deal.card].name}] 획득 (${CARDS[deal.card].desc})` : ''}`;

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** 고국에 가까운 순(전진 거리 큰 순). 동점이면 지난 날 뒤 순번 우선. 1일차는 무작위 */
export function computeOrder(pub: PublicState, rng: Rng): TeamId[] {
  if (!pub.prevOrder.length) return shuffle([...pub.teamIds], rng);
  const score = (t: TeamId) => pub.teams[t]?.score ?? 0;
  const prev = (t: TeamId) => pub.prevOrder.indexOf(t);
  return [...pub.teamIds].sort((a, b) => score(b) - score(a) || prev(b) - prev(a));
}

/** 하루 시작: ⓪ 최종 결전 개시 → ① 투척 창 발동 → ② 순서 결정 */
export function startRound(state: EngineState, rng: Rng = Math.random): Step {
  const turn = new Turn(state, 'start');
  const { pub, secret } = turn.s;
  pub.round += 1;
  pub.events = [];

  if (pub.round === FINAL_OPEN_ROUND) {
    const i = INITIAL_TABLES.length;
    pub.tables[i] = { ...emptyTable(), agenda: FINAL_AGENDA };
    secret.remaining[i] = turn.setup.demand[FINAL_AGENDA];
    secret.trail[i] = [];
    turn.event({ kind: 'finalOpen', table: i + 1, agenda: FINAL_AGENDA });
  }

  for (const { team, table } of secret.practice) {
    const before = pub.tables[table - 1]?.agenda;
    const deal = turn.damage(table, 'practice', team);
    if (deal) {
      turn.event({ kind: 'practiceDeal', team, table, ...shown(deal) });
      turn.note(team, `🎯 헤르메스의 투척 창 발동! ${dealText(deal)}`);
    } else if (before) {
      turn.note(team, `🎯 투척 창(못 가로챈 창) 발동: ${table}번 해역 ${agendaTitle(before)}에 −${CARDS.practice.power}`, -1);
    } else {
      turn.note(team, `투척 창: ${table}번 해역이 비어 있어 효과가 없었어요`, -1);
    }
  }
  secret.practice = [];

  pub.prevOrder = pub.order;
  pub.order = computeOrder(pub, rng);
  pub.stage = 'order';
  pub.deadline = 0;
  pub.revealed = pub.events.length;
  return turn.result();
}

export function beginSubmit(state: EngineState, now: number): EngineState {
  const next = structuredClone(state);
  next.pub.stage = 'submit';
  next.pub.deadline = now + SUBMIT_SECONDS * 1000;
  return next;
}

/** 아폴론의 예지: 1해리 후퇴, 해역의 남은 생명력 확인 (제출 단계에서만) */
export function scout(state: EngineState, team: TeamId, tableNo: number): { state: EngineState; result: ScoutResult } {
  const turn = new Turn(state, 'start');
  const { pub, secret } = turn.s;
  const base = { round: pub.round, table: tableNo };
  if (pub.stage !== 'submit') return { state, result: { ...base, error: '제출 시간에만 사용할 수 있어요' } };
  if (!pub.teams[team]) return { state, result: { ...base, error: '게임에 참여하지 않은 함대예요' } };
  if (turn.team(team).score < SCOUT_COST) return { state, result: { ...base, error: '더 물러설 수 없어요' } };
  if (!turn.isOpen(tableNo)) return { state, result: { ...base, error: '역경이 없는 해역이에요' } };
  turn.team(team).score -= SCOUT_COST;
  const i = tableNo - 1;
  return { state: turn.s, result: { ...base, agenda: pub.tables[i].agenda, remaining: secret.remaining[i] } };
}

function nearestFree(slots: (TeamId | undefined)[], want: number): number {
  for (let p = want; p < slots.length; p++) if (!slots[p]) return p;
  for (let p = want - 1; p >= 0; p--) if (!slots[p]) return p;
  return -1;
}

/** 공격 공개: 순풍(새치기) → 삼지창(동결) → 투척 창 → 순서대로 공격 → 쇠사슬 → 동결 해제 */
export function resolveRound(state: EngineState, subs: Partial<Record<TeamId, Submission>>): Step {
  const turn = new Turn(state, 'reveal');
  const { pub, secret } = turn.s;
  pub.events = [];
  const n = pub.order.length;

  // 순풍(새치기): 고국에 가까운 함대 우선(동점이면 원래 순번), 겹치면 가장 가까운 다음 빈자리
  const wantsCutIn = pub.order.filter((t) => (subs[t]?.cutIn ?? 0) > 0);
  const cutters = wantsCutIn
    .filter((t) => turn.team(t).score >= CUT_IN_COST)
    .sort((a, b) => turn.team(b).score - turn.team(a).score);
  const slots: (TeamId | undefined)[] = new Array(n).fill(undefined);
  const cutInPos = new Map<TeamId, number>();
  for (const t of cutters) {
    turn.team(t).score -= CUT_IN_COST;
    const p = nearestFree(slots, Math.min(Math.max(subs[t]!.cutIn, 1), n) - 1);
    slots[p] = t;
    cutInPos.set(t, p + 1);
  }
  const rest = pub.order.filter((t) => !cutInPos.has(t));
  const order = slots.map((t) => t ?? rest.shift()!);
  const changed = order.some((t, i) => t !== pub.order[i]);
  pub.order = order;
  turn.event({ kind: 'start', ...(changed ? { cutIn: true, order } : {}) });
  for (const t of wantsCutIn) {
    turn.note(t, cutInPos.has(t) ? `💨 제피로스의 순풍: ${cutInPos.get(t)}번째로 공격 (${CUT_IN_COST}해리 후퇴)` : '순풍 실패: 더 물러설 수 없어요');
  }

  // 추가 카드(쇠사슬·삼지창)는 extra 로, 주 카드 자리에 낸 것도 같은 효과
  const extraOf = (t: TeamId) => {
    const sub = subs[t];
    if (sub?.extra) return sub.extra;
    return sub && (sub.card === 'promo' || sub.card === 'hold') ? { card: sub.card, table: sub.table } : undefined;
  };
  const mainOf = (t: TeamId) => {
    const sub = subs[t];
    return sub && sub.card !== 'promo' && sub.card !== 'hold' ? sub : undefined;
  };

  // ① 포세이돈의 삼지창(동결): 순번과 관계없이 가장 먼저 적용, 쓴 함대는 다음 날 그 해역 우선권
  const lastPriority = secret.priority ?? [];
  secret.priority = [];
  const held = new Set<TeamId>();
  for (const t of order) {
    const x = extraOf(t);
    if (x?.card !== 'hold' || !turn.has(t, 'hold') || !turn.isOpen(x.table)) continue;
    turn.hand(t).hold -= 1;
    held.add(t);
    if (pub.round < ROUNDS) secret.priority.push({ team: t, table: x.table });
    const table = pub.tables[x.table - 1];
    if (!table.frozen) {
      table.frozen = true;
      turn.event({ kind: 'hold', table: x.table, agenda: table.agenda });
    }
  }

  // ② 헤르메스의 투척 창: 오늘 그 해역의 돌파를 가로챔 (순번과 관계없이 미리 걸어 둠)
  for (const t of order) {
    const sub = mainOf(t);
    if (sub?.card !== 'practice' || !turn.has(t, 'practice') || !turn.isOpen(sub.table)) continue;
    if (pub.tables[sub.table - 1].frozen) continue;
    turn.hand(t).practice -= 1;
    const i = sub.table - 1;
    turn.steals.set(i, [...(turn.steals.get(i) ?? []), t]);
  }
  const stealing = new Set([...turn.steals.values()].flat());

  // ③ 지난 날 삼지창 우선권: 그 해역에 낸 공격을 가장 먼저
  const first = order.filter((t) => lastPriority.some((p) => p.team === t && mainOf(t)?.table === p.table));
  const sequence = [...first, ...order.filter((t) => !first.includes(t))];

  const dealEvent = (t: TeamId, tableNo: number, deal: Deal, kind: 'proposal' | 'promoDeal') => {
    turn.event({ kind, team: t, table: tableNo, ...(kind === 'proposal' ? { result: 'deal' as const } : {}), ...shown(deal) });
    if (deal.stolen) {
      turn.note(deal.winner, `🎯 투척 창으로 가로채기 성공! ${dealText(deal)}`);
      turn.note(t, `${agendaTitle(deal.agenda)}에 마지막 일격을 넣었지만 투척 창에 보상을 빼앗겼어요`);
    } else {
      turn.note(t, `${kind === 'promoDeal' ? '⛓️ 쇠사슬 효과로 ' : '🎉 '}${dealText(deal)}`);
    }
  };

  for (const t of sequence) {
    const sub = subs[t];
    const isFirst = first.includes(t) ? { first: true } : {};
    if (!sub) {
      turn.event({ kind: 'proposal', team: t, result: 'pass' });
      turn.note(t, '제출하지 않아 오늘은 쉬었어요');
      continue;
    }
    // 추가 카드: 쇠사슬은 이 함대 차례에 공개, 삼지창은 위에서 처리
    const x = extraOf(t);
    if (x?.card === 'hold' && !held.has(t)) turn.note(t, '포세이돈의 삼지창을 쓸 수 없어 무효가 됐어요');
    if (x?.card === 'hold' && held.has(t)) {
      turn.note(t, `🔱 ${x.table}번 해역 동결 성공! 오늘 이 해역의 공격은 모두 무효${pub.round < ROUNDS ? ', 내일 이 해역에 낸 우리 공격이 가장 먼저 적용돼요' : ''}`, -1);
    }
    if (x?.card === 'promo') {
      const table = pub.tables[x.table - 1];
      if (!turn.has(t, 'promo') || !turn.isOpen(x.table)) {
        turn.note(t, '쇠사슬을 걸 수 없어 무효가 됐어요 (무기는 돌려받았어요)');
      } else if (table.frozen) {
        turn.note(t, `🔱 ${x.table}번 해역이 동결되어 쇠사슬 무효 (무기는 돌려받았어요)`);
      } else {
        turn.hand(t).promo -= 1;
        table.promos.push(t);
        turn.event({ kind: 'proposal', team: t, result: 'promo', table: x.table, agenda: table.agenda });
        turn.note(t, `⛓️ ${x.table}번 해역에 아테나의 쇠사슬 — 매일 끝날 때 −${CARDS.promo.power}`);
      }
    }
    const main = mainOf(t);
    if (!main) {
      // 추가 카드만 낸 경우 (주 카드 자리에 삼지창·쇠사슬을 쓴 경우)
      if (x?.card === 'hold') turn.event({ kind: 'proposal', team: t, result: held.has(t) ? 'done' : 'void', ...(held.has(t) ? {} : { reason: 'invalid' as const }) });
      continue;
    }
    const { table: tableNo, card } = main;
    if (card === 'practice' && stealing.has(t)) {
      turn.event({ kind: 'proposal', team: t, result: 'done', ...isFirst });
      turn.note(t, `🎯 ${tableNo}번 해역에 헤르메스의 투척 창 — 오늘 이 해역에서 역경이 쓰러지면 보상을 가로채요`);
      continue;
    }
    if (!turn.has(t, card)) {
      turn.event({ kind: 'proposal', team: t, result: 'void', reason: 'invalid' });
      turn.note(t, '가지고 있지 않은 무기라 무효가 됐어요');
      continue;
    }
    const returned = card === 'basic' ? '' : ' (무기는 돌려받았어요)';
    if (!turn.isOpen(tableNo)) {
      turn.event({ kind: 'proposal', team: t, result: 'void', reason: 'empty', table: tableNo });
      turn.note(t, `${tableNo}번 해역에 역경이 없어 무효${returned}`);
      continue;
    }
    const table = pub.tables[tableNo - 1];
    if (table.frozen) {
      turn.event({ kind: 'proposal', team: t, result: 'void', reason: 'hold', table: tableNo });
      turn.note(t, `🔱 ${tableNo}번 해역이 동결되어 무효${returned}`);
      continue;
    }
    const before = table.agenda;
    if (card === 'blitz') turn.hand(t).blitz -= 1;
    const deal = turn.damage(tableNo, card, t);
    if (deal) {
      dealEvent(t, tableNo, deal, 'proposal');
      if (isFirst.first) pub.events[pub.events.length - 1].first = true;
    } else {
      turn.event({ kind: 'proposal', team: t, result: 'done', ...isFirst });
      turn.note(t, `${tableNo}번 해역 ${agendaTitle(before)}에 [${CARDS[card].name}] 적용 (−${CARDS[card].power})`);
    }
  }

  // 하루 끝: 쇠사슬 효과 (동결된 해역은 쉼)
  pub.tables.forEach((table, i) => {
    if (table.frozen) return;
    for (const owner of table.promos) {
      if (!table.agenda) break;
      const deal = turn.damage(i + 1, 'promo', owner);
      if (deal) dealEvent(owner, i + 1, deal, 'promoDeal');
    }
  });

  // 가로채지 못한 투척 창은 다음 날 시작 시 −6
  for (const [i, teams] of turn.steals) {
    for (const t of teams) {
      if (pub.round < ROUNDS) {
        secret.practice.push({ team: t, table: i + 1 });
        turn.note(t, `🎯 ${i + 1}번 해역에서 가로챌 돌파가 없었어요 — 내일 시작 시 −${CARDS.practice.power}`, -1);
      } else {
        turn.note(t, `🎯 ${i + 1}번 해역에서 가로챌 돌파가 없었어요`, -1);
      }
    }
  }
  turn.steals.clear();

  for (const table of pub.tables) table.frozen = false;
  turn.event({ kind: 'end' });
  pub.stage = 'reveal';
  pub.revealed = 1;
  return turn.result();
}

export function revealNext(state: EngineState, all = false): EngineState {
  const next = structuredClone(state);
  next.pub.revealed = all ? next.pub.events.length : Math.min(next.pub.events.length, next.pub.revealed + 1);
  return next;
}

export function finish(state: EngineState): EngineState {
  const next = structuredClone(state);
  next.pub.stage = 'final';
  return next;
}

/** 최종 순위: 고국에 가까운 순(전진 거리 큰 순) → 돌파 수. 둘 다 같으면 공동 순위 */
export function ranking(pub: PublicState): { team: TeamId; score: number; deals: number; rank: number }[] {
  const rows = pub.teamIds
    .map((team) => ({ team, score: pub.teams[team]?.score ?? 0, deals: pub.teams[team]?.deals ?? 0, rank: 0 }))
    .sort((a, b) => b.score - a.score || b.deals - a.deals);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.score === r.score && prev.deals === r.deals ? prev.rank : i + 1;
  });
  return rows;
}
