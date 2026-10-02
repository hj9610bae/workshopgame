/*
 * 교섭의 도박사들 규칙 엔진 (docs/rules.md 구현).
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
  QUEUE,
  ROUNDS,
  SCOUT_COST,
  START_SCORE,
  SUBMIT_SECONDS,
  type CardId,
  type SpecialCardId,
  type TeamId,
} from './data';
import type { GameEvent, Hand, Note, PublicState, ScoutResult, SecretState, Submission } from './types';

export interface EngineState {
  pub: PublicState;
  secret: SecretState;
  hands: Partial<Record<TeamId, Hand>>;
}

export type NoteDraft = Omit<Note, 'round'>;

export interface Step {
  state: EngineState;
  /** 팀별 비공개 메시지 */
  notes: Partial<Record<TeamId, NoteDraft[]>>;
}

export type Rng = () => number;

interface Deal {
  agenda: number;
  reward: number;
  card?: SpecialCardId;
}

export const emptyHand = (): Hand => ({ blitz: 0, practice: 0, promo: 0, hold: 0 });

export const agendaTitle = (id: number | undefined): string => (id ? AGENDAS[id]?.title ?? '?' : '빈 테이블');

const emptyTable = () => ({ agenda: 0, frozen: false, promos: [] as TeamId[] });

export function createGame(teamIds: readonly TeamId[]): EngineState {
  return {
    pub: {
      stage: 'lobby',
      round: 0,
      deadline: 0,
      teamIds: [...teamIds],
      order: [],
      prevOrder: [],
      tables: [...INITIAL_TABLES.map((agenda) => ({ ...emptyTable(), agenda })), emptyTable()],
      queue: 0,
      teams: Object.fromEntries(teamIds.map((t) => [t, { score: START_SCORE, deals: 0 }])),
      events: [],
      revealed: 0,
    },
    secret: { remaining: [...INITIAL_TABLES.map((a) => AGENDAS[a].demand), 0], practice: [] },
    hands: Object.fromEntries(teamIds.map((t) => [t, emptyHand()])),
  };
}

/** 한 번의 진행 단계 동안 상태를 바꾸면서 사건과 메시지를 기록 */
class Turn {
  readonly s: EngineState;
  readonly notes: Step['notes'] = {};

  constructor(
    state: EngineState,
    private readonly phase: NoteDraft['phase'],
  ) {
    this.s = structuredClone(state);
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

  /** 테이블의 요구 수치를 깎고, 0 이하가 되면 보상 지급 후 테이블 보충 */
  damage(tableNo: number, amount: number, team: TeamId): Deal | null {
    const { pub, secret } = this.s;
    const i = tableNo - 1;
    const agenda = AGENDAS[pub.tables[i]?.agenda];
    if (!agenda) return null;
    secret.remaining[i] -= amount;
    if (secret.remaining[i] > 0) return null;
    this.team(team).score += agenda.reward;
    this.team(team).deals += 1;
    if (agenda.card) this.hand(team)[agenda.card] += 1;
    this.refill(i);
    return { agenda: agenda.id, reward: agenda.reward, card: agenda.card };
  }

  private refill(i: number) {
    const { pub, secret } = this.s;
    // 4번(최종 교섭) 테이블은 보충 없이 닫힘
    const next = i < INITIAL_TABLES.length ? QUEUE[pub.queue] : undefined;
    if (next === undefined) {
      pub.tables[i].agenda = 0;
      secret.remaining[i] = 0;
    } else {
      pub.queue += 1;
      pub.tables[i].agenda = next;
      secret.remaining[i] = AGENDAS[next].demand;
    }
  }

  result(): Step {
    return { state: this.s, notes: this.notes };
  }
}

const dealText = (deal: Deal) =>
  `${agendaTitle(deal.agenda)} 합의! 주도권 +${deal.reward}${deal.card ? ` · [${CARDS[deal.card].name}] 획득` : ''}`;

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** 주도권 높은 순. 동점이면 지난 라운드 뒤 순번 우선. 1라운드는 무작위 */
export function computeOrder(pub: PublicState, rng: Rng): TeamId[] {
  if (!pub.prevOrder.length) return shuffle([...pub.teamIds], rng);
  const score = (t: TeamId) => pub.teams[t]?.score ?? 0;
  const prev = (t: TeamId) => pub.prevOrder.indexOf(t);
  return [...pub.teamIds].sort((a, b) => score(b) - score(a) || prev(b) - prev(a));
}

/** 라운드 시작: ⓪ 최종 교섭 개시 → ① 실무 교섭 발동 → ② 순서 결정 */
export function startRound(state: EngineState, rng: Rng = Math.random): Step {
  const turn = new Turn(state, 'start');
  const { pub, secret } = turn.s;
  pub.round += 1;
  pub.events = [];

  if (pub.round === FINAL_OPEN_ROUND) {
    const i = INITIAL_TABLES.length;
    pub.tables[i] = { ...emptyTable(), agenda: FINAL_AGENDA };
    secret.remaining[i] = AGENDAS[FINAL_AGENDA].demand;
    turn.event({ kind: 'finalOpen', table: i + 1, agenda: FINAL_AGENDA });
  }

  for (const { team, table } of secret.practice) {
    const before = pub.tables[table - 1]?.agenda;
    const deal = turn.damage(table, CARDS.practice.power, team);
    if (deal) {
      turn.event({ kind: 'practiceDeal', team, table, ...deal });
      turn.note(team, `🤝 실무 교섭 병행 발동! ${dealText(deal)}`);
    } else if (before) {
      turn.note(team, `🤝 실무 교섭 병행 발동: ${table}번 테이블 ${agendaTitle(before)}에 −${CARDS.practice.power}`, -1);
    } else {
      turn.note(team, `실무 교섭 병행: ${table}번 테이블이 비어 있어 효과가 없었어요`, -1);
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

/** 속마음 스카우터: 주도권 −1, 테이블의 남은 요구 수치 확인 (제출 단계에서만) */
export function scout(state: EngineState, team: TeamId, tableNo: number): { state: EngineState; result: ScoutResult } {
  const turn = new Turn(state, 'start');
  const { pub, secret } = turn.s;
  const base = { round: pub.round, table: tableNo };
  if (pub.stage !== 'submit') return { state, result: { ...base, error: '제출 시간에만 사용할 수 있어요' } };
  if (!pub.teams[team]) return { state, result: { ...base, error: '게임에 참여하지 않은 팀이에요' } };
  if (turn.team(team).score < SCOUT_COST) return { state, result: { ...base, error: '주도권이 부족해요' } };
  if (!turn.isOpen(tableNo)) return { state, result: { ...base, error: '안건이 없는 테이블이에요' } };
  turn.team(team).score -= SCOUT_COST;
  const i = tableNo - 1;
  return { state: turn.s, result: { ...base, agenda: pub.tables[i].agenda, remaining: secret.remaining[i] } };
}

function nearestFree(slots: (TeamId | undefined)[], want: number): number {
  for (let p = want; p < slots.length; p++) if (!slots[p]) return p;
  for (let p = want - 1; p >= 0; p--) if (!slots[p]) return p;
  return -1;
}

/** 제안 공개: 새치기 → ③ 보류 → ④ 순서대로 제안 → ⑤ 홍보물 → 보류 해제 */
export function resolveRound(state: EngineState, subs: Partial<Record<TeamId, Submission>>): Step {
  const turn = new Turn(state, 'reveal');
  const { pub, secret } = turn.s;
  pub.events = [];
  const n = pub.order.length;

  // 새치기: 주도권 높은 팀 우선(동점이면 원래 순번), 겹치면 가장 가까운 다음 빈자리
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
  turn.event({ kind: 'start', cutIn: changed });
  for (const t of wantsCutIn) {
    turn.note(t, cutInPos.has(t) ? `⚡ 새치기: ${cutInPos.get(t)}번째로 제안 (주도권 −${CUT_IN_COST})` : '새치기 실패: 주도권이 부족해요');
  }

  // 안건 보류는 순번과 관계없이 가장 먼저 적용
  const held = new Set<TeamId>();
  for (const t of order) {
    const sub = subs[t];
    if (sub?.card !== 'hold' || !turn.has(t, 'hold') || !turn.isOpen(sub.table)) continue;
    turn.hand(t).hold -= 1;
    held.add(t);
    const table = pub.tables[sub.table - 1];
    if (!table.frozen) {
      table.frozen = true;
      turn.event({ kind: 'hold', table: sub.table, agenda: table.agenda });
    }
  }

  for (const t of order) {
    const sub = subs[t];
    if (!sub) {
      turn.event({ kind: 'proposal', team: t, result: 'pass' });
      turn.note(t, '제출하지 않아 이번 라운드는 패스했어요');
      continue;
    }
    const { table: tableNo, card } = sub;
    if (card === 'hold') {
      if (held.has(t)) {
        turn.event({ kind: 'proposal', team: t, result: 'done' });
        turn.note(t, `⛔ ${tableNo}번 테이블 보류 성공! 이번 라운드 이 테이블의 제안은 모두 무효예요`);
      } else {
        turn.event({ kind: 'proposal', team: t, result: 'void', reason: 'invalid' });
        turn.note(t, '안건 보류를 쓸 수 없어 무효가 됐어요');
      }
      continue;
    }
    if (!turn.has(t, card) || (card === 'practice' && pub.round >= ROUNDS)) {
      turn.event({ kind: 'proposal', team: t, result: 'void', reason: 'invalid' });
      turn.note(t, '사용할 수 없는 카드라 무효가 됐어요');
      continue;
    }
    const returned = card === 'basic' ? '' : ' (카드는 돌려받았어요)';
    if (!turn.isOpen(tableNo)) {
      turn.event({ kind: 'proposal', team: t, result: 'void', reason: 'empty', table: tableNo });
      turn.note(t, `${tableNo}번 테이블에 안건이 없어 무효${returned}`);
      continue;
    }
    const table = pub.tables[tableNo - 1];
    if (table.frozen) {
      turn.event({ kind: 'proposal', team: t, result: 'void', reason: 'hold', table: tableNo });
      turn.note(t, `⛔ ${tableNo}번 테이블이 보류되어 무효${returned}`);
      continue;
    }
    const before = table.agenda;
    if (card === 'practice') {
      turn.hand(t).practice -= 1;
      secret.practice.push({ team: t, table: tableNo });
      turn.event({ kind: 'proposal', team: t, result: 'done' });
      turn.note(t, `🤝 ${tableNo}번 테이블에 실무 교섭 병행 예약 — 다음 라운드 시작 시 −${CARDS.practice.power}`);
      continue;
    }
    if (card === 'promo') {
      turn.hand(t).promo -= 1;
      table.promos.push(t);
      turn.event({ kind: 'proposal', team: t, result: 'promo', table: tableNo, agenda: before });
      turn.note(t, `📣 ${tableNo}번 테이블에 홍보물 부착 — 매 라운드 종료 시 −${CARDS.promo.power}`);
      continue;
    }
    if (card === 'blitz') turn.hand(t).blitz -= 1;
    const deal = turn.damage(tableNo, CARDS[card].power, t);
    if (deal) {
      turn.event({ kind: 'proposal', team: t, result: 'deal', table: tableNo, ...deal });
      turn.note(t, `🎉 ${dealText(deal)}`);
    } else {
      turn.event({ kind: 'proposal', team: t, result: 'done' });
      turn.note(t, `${tableNo}번 테이블 ${agendaTitle(before)}에 [${CARDS[card].name}] 적용 (−${CARDS[card].power})`);
    }
  }

  // 라운드 종료: 홍보물 효과 (보류된 테이블은 쉼)
  pub.tables.forEach((table, i) => {
    if (table.frozen) return;
    for (const owner of table.promos) {
      if (!table.agenda) break;
      const deal = turn.damage(i + 1, CARDS.promo.power, owner);
      if (deal) {
        turn.event({ kind: 'promoDeal', team: owner, table: i + 1, ...deal });
        turn.note(owner, `📣 홍보물 효과로 ${dealText(deal)}`);
      }
    }
  });

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

/** 최종 순위: 주도권 → 합의 건수. 둘 다 같으면 공동 순위 */
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
