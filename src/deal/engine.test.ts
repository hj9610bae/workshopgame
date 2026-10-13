import { describe, expect, it } from 'vitest';
import { TEAM_IDS, type TeamId } from './data';
import { beginSubmit, createGame, finish, ranking, resolveRound, scout, startRound, type EngineState } from './engine';
import type { Submission } from './types';

/** shuffle 이 원래 순서를 유지하도록 하는 난수 → 1라운드 순서 A,B,C,D,E */
const keepOrder = () => 0.999;
const basic = (table: number): Submission => ({ table, card: 'basic', cutIn: 0 });

function round1(): EngineState {
  return beginSubmit(startRound(createGame(TEAM_IDS), keepOrder).state, 0);
}

const scores = (s: EngineState) => Object.fromEntries(s.pub.teamIds.map((t) => [t, s.pub.teams[t]!.score]));

describe('규칙서 5장 예시 1라운드', () => {
  const { state, notes } = resolveRound(round1(), {
    A: basic(1),
    B: basic(1),
    C: basic(2),
    D: basic(2),
    E: basic(3),
  });

  it('A가 검진비, D가 난임시술을 합의하고 B는 새로 온 전기차를 공격', () => {
    const tables = state.pub.tables.map((t) => t.agenda);
    expect(tables).toEqual([12, 2, 8, 0]);
    expect(state.secret.remaining).toEqual([2, 5, 1, 0]);
    expect(scores(state)).toEqual({ A: 12, B: 10, C: 10, D: 12, E: 10 });
  });

  it('사회자 화면용 사건에는 합의만 드러남', () => {
    const proposals = state.pub.events.filter((e) => e.kind === 'proposal');
    expect(proposals.map((e) => [e.team, e.result])).toEqual([
      ['A', 'deal'],
      ['B', 'done'],
      ['C', 'done'],
      ['D', 'deal'],
      ['E', 'done'],
    ]);
    expect(proposals[1].table).toBeUndefined();
  });

  it('팀별 메시지', () => {
    expect(notes.B?.[0].text).toContain('전기차');
    expect(notes.D?.[0].text).toContain('난임시술 합의');
  });

  it('합의 사건에만 처음 요구 수치와 깎인 이력이 공개됨', () => {
    const deals = state.pub.events.filter((e) => e.result === 'deal');
    expect(deals[0]).toMatchObject({ team: 'A', demand: 2, trail: [{ team: 'A', card: 'basic', amount: 2 }] });
    expect(deals[1]).toMatchObject({
      team: 'D',
      demand: 3,
      trail: [
        { team: 'C', card: 'basic', amount: 2 },
        { team: 'D', card: 'basic', amount: 2 },
      ],
    });
    const done = state.pub.events.filter((e) => e.result === 'done');
    expect(done.every((e) => e.trail === undefined && e.demand === undefined)).toBe(true);
  });

  it('합의되지 않은 안건의 이력은 비공개 상태로만 쌓이고, 새 안건은 이력이 비어서 시작', () => {
    expect(state.secret.trail[0]).toEqual([{ team: 'B', card: 'basic', amount: 2 }]);
    expect(state.secret.trail[1]).toEqual([]);
    expect(state.secret.trail[2]).toEqual([{ team: 'E', card: 'basic', amount: 2 }]);
  });

  it('2라운드 순서: D → A → E → C → B', () => {
    expect(startRound(state).state.pub.order).toEqual(['D', 'A', 'E', 'C', 'B']);
  });
});

describe('특수 카드', () => {
  function withHand(team: TeamId, card: 'blitz' | 'practice' | 'promo' | 'hold'): EngineState {
    const s = round1();
    s.hands[team]![card] = 1;
    return s;
  }

  it('안건 보류: 순번과 관계없이 앞 순번 팀의 제안도 무효, 특수 카드는 반환', () => {
    const s = withHand('E', 'hold');
    s.hands.A!.blitz = 1;
    const { state, notes } = resolveRound(s, {
      A: { table: 2, card: 'blitz', cutIn: 0 },
      E: { table: 2, card: 'hold', cutIn: 0 },
    });
    expect(state.secret.remaining[1]).toBe(3);
    expect(state.hands.A!.blitz).toBe(1);
    expect(state.hands.E!.hold).toBe(0);
    expect(state.pub.tables[1].frozen).toBe(false);
    expect(notes.A?.[0].text).toContain('보류');
    expect(state.pub.events.find((e) => e.kind === 'hold')?.team).toBeUndefined();
  });

  it('실무 교섭 병행: 다음 라운드 시작 시 10 감소, 합의되면 카드 주인이 보상', () => {
    const s = withHand('C', 'practice');
    const r1 = resolveRound(s, { C: { table: 3, card: 'practice', cutIn: 0 } }).state;
    expect(r1.secret.remaining[2]).toBe(3);
    const r2 = startRound(r1);
    expect(r2.state.pub.tables[2].agenda).toBe(12);
    expect(r2.state.pub.teams.C!.score).toBe(13);
    expect(r2.state.pub.events[0]).toMatchObject({
      kind: 'practiceDeal',
      team: 'C',
      agenda: 8,
      demand: 3,
      trail: [{ team: 'C', card: 'practice', amount: 10 }],
    });
  });

  it('실무 교섭 병행은 5라운드에 낼 수 없음', () => {
    const s = withHand('C', 'practice');
    s.pub.round = 5;
    const { state } = resolveRound(s, { C: { table: 3, card: 'practice', cutIn: 0 } });
    expect(state.hands.C!.practice).toBe(1);
    expect(state.secret.practice).toEqual([]);
  });

  it('홍보물: 매 라운드 종료 시 1 감소, 합의 시 부착 팀이 보상', () => {
    const s = withHand('B', 'promo');
    const { state } = resolveRound(s, { A: basic(3), B: { table: 3, card: 'promo', cutIn: 0 } });
    // 체육대회 3 − 2(A) − 1(홍보물) = 0 → B 합의
    expect(state.pub.teams.B!.score).toBe(13);
    expect(state.pub.tables[2]).toMatchObject({ agenda: 12, promos: ['B'] });
    expect(state.pub.events.find((e) => e.kind === 'promoDeal')).toMatchObject({
      team: 'B',
      demand: 3,
      trail: [
        { team: 'A', card: 'basic', amount: 2 },
        { team: 'B', card: 'promo', amount: 1 },
      ],
    });
  });

  it('예전에 저장된 게임(이력 없음)도 이어서 진행', () => {
    const s = round1();
    delete (s.secret as Partial<typeof s.secret>).trail;
    const { state } = resolveRound(s, { A: basic(1) });
    expect(state.pub.events.find((e) => e.result === 'deal')?.trail).toEqual([{ team: 'A', card: 'basic', amount: 2 }]);
  });

  it('전격 타결: 6 감소, 넘친 수치는 사라짐', () => {
    const s = withHand('A', 'blitz');
    const { state } = resolveRound(s, { A: { table: 1, card: 'blitz', cutIn: 0 }, B: basic(1) });
    expect(state.pub.teams.A!.score).toBe(12);
    expect(state.secret.remaining[0]).toBe(2); // 새로 온 전기차 4 − B의 2
  });

  it('보유하지 않은 카드는 무효', () => {
    const { state } = resolveRound(round1(), { A: { table: 1, card: 'blitz', cutIn: 0 } });
    expect(state.secret.remaining[0]).toBe(2);
  });
});

describe('새치기', () => {
  it('원하는 순번으로 이동하고 주도권 −2', () => {
    const { state } = resolveRound(round1(), { E: { ...basic(1), cutIn: 1 } });
    expect(state.pub.order).toEqual(['E', 'A', 'B', 'C', 'D']);
    // E는 −2 후 검진비 합의 +2
    expect(state.pub.teams.E!.score).toBe(10);
    expect(state.pub.events[0]).toMatchObject({ kind: 'start', cutIn: true });
  });

  it('겹치면 주도권 높은 팀 우선, 밀린 팀은 다음 빈자리', () => {
    const s = round1();
    s.pub.teams.D!.score = 15;
    const { state } = resolveRound(s, { C: { ...basic(1), cutIn: 1 }, D: { ...basic(1), cutIn: 1 } });
    expect(state.pub.order).toEqual(['D', 'C', 'A', 'B', 'E']);
  });

  it('주도권이 부족하면 실패', () => {
    const s = round1();
    s.pub.teams.E!.score = 1;
    const { state, notes } = resolveRound(s, { E: { ...basic(3), cutIn: 1 } });
    expect(state.pub.order.at(-1)).toBe('E');
    expect(notes.E?.[0].text).toContain('실패');
  });
});

describe('스카우터', () => {
  it('주도권 −1, 남은 수치 확인', () => {
    const { state, result } = scout(round1(), 'A', 2);
    expect(result).toMatchObject({ agenda: 5, remaining: 3 });
    expect(state.pub.teams.A!.score).toBe(9);
  });

  it('제출 시간이 아니면 사용 불가', () => {
    const s = round1();
    s.pub.stage = 'order';
    expect(scout(s, 'A', 2).result.error).toBeDefined();
  });

  it('주도권이 없으면 사용 불가', () => {
    const s = round1();
    s.pub.teams.A!.score = 0;
    expect(scout(s, 'A', 2).result.error).toBeDefined();
  });
});

describe('최종 교섭', () => {
  it('4라운드 시작 시 4번 테이블에 성과급(12) 등장, 합의되면 닫힘', () => {
    let s = createGame(TEAM_IDS);
    for (let r = 1; r <= 3; r++) {
      s = resolveRound(beginSubmit(startRound(s, keepOrder).state, 0), {}).state;
    }
    const r4 = startRound(s).state;
    expect(r4.pub.tables[3].agenda).toBe(11);
    expect(r4.secret.remaining[3]).toBe(12);
    expect(r4.pub.events[0].kind).toBe('finalOpen');

    r4.secret.remaining[3] = 2;
    const subs = Object.fromEntries(r4.pub.order.map((t) => [t, basic(4)]));
    const after = resolveRound(beginSubmit(r4, 0), subs).state;
    const [first, second] = r4.pub.order;
    expect(after.pub.teams[first]!.score).toBe(20);
    expect(after.pub.tables[3].agenda).toBe(0);
    expect(after.pub.events.find((e) => e.team === second)).toMatchObject({ result: 'void', reason: 'empty' });
  });
});

describe('최종 순위', () => {
  it('주도권 → 합의 건수 순, 모두 같으면 공동 순위', () => {
    const s = finish(createGame(['A', 'B', 'C']));
    s.pub.teams = { A: { score: 12, deals: 1 }, B: { score: 12, deals: 2 }, C: { score: 12, deals: 1 } };
    expect(ranking(s.pub).map((r) => [r.team, r.rank])).toEqual([
      ['B', 1],
      ['A', 2],
      ['C', 2],
    ]);
  });
});
