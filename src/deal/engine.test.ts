import { describe, expect, it } from 'vitest';
import { FINAL_AGENDA, FINAL_OPEN_ROUND, QUIZ_REWARD, QUIZ_THINK_SECONDS, RESCUE_ROUND, ROUNDS, START_DISTANCE, TEAM_IDS, distanceOf, type TeamId } from './data';
import { beginSubmit, canOpenRescue, createGame, finish, markQuiz, openRescue, quizQueue, ranking, resolveRound, scout, settleRescue, startQuizTimer, startRound, type EngineState } from './engine';
import type { Submission } from './types';

/** shuffle 이 원래 순서를 유지하도록 하는 난수 → 1라운드 순서 A,B,C,D,E */
const keepOrder = () => 0.999;
const basic = (table: number): Submission => ({ table, card: 'basic', cutIn: 0 });

function round1(): EngineState {
  return beginSubmit(startRound(createGame(TEAM_IDS), keepOrder).state, 0);
}

const scores = (s: EngineState) => Object.fromEntries(s.pub.teamIds.map((t) => [t, s.pub.teams[t]!.score]));

describe('규칙서 5장 예시 1일차', () => {
  const { state, notes } = resolveRound(round1(), {
    A: basic(1),
    B: basic(1),
    C: basic(2),
    D: basic(2),
    E: basic(3),
  });

  it('A가 로투스 섬, D가 바람 자루를 돌파하고 B는 새로 온 키르케를 공격', () => {
    const tables = state.pub.tables.map((t) => t.agenda);
    expect(tables).toEqual([4, 5, 3, 0]);
    expect(state.secret.remaining).toEqual([1, 2, 2, 0]);
    expect(scores(state)).toEqual({ A: 12, B: 10, C: 10, D: 13, E: 10 });
  });

  it('화면용 사건에는 돌파만 드러남', () => {
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
    expect(notes.B?.[0].text).toContain('키르케');
    expect(notes.D?.[0].text).toContain('바람 자루 돌파');
  });

  it('돌파 사건에는 돌파한 함대만 공개되고 공격 이력은 공개되지 않음', () => {
    const deals = state.pub.events.filter((e) => e.result === 'deal');
    expect(deals.map((e) => e.team)).toEqual(['A', 'D']);
    expect(deals.map((e) => e.weapon)).toEqual(['basic', 'basic']);
    expect(state.pub.events.every((e) => !('trail' in e) && !('demand' in e))).toBe(true);
  });

  it('돌파된 역경의 공격 이력은 비공개 history 에 남음 (항해 일지용)', () => {
    expect(state.secret.history).toEqual([
      { agenda: 1, trail: [{ team: 'A', card: 'basic', amount: 2 }] },
      {
        agenda: 2,
        trail: [
          { team: 'C', card: 'basic', amount: 2 },
          { team: 'D', card: 'basic', amount: 2 },
        ],
      },
    ]);
    expect(JSON.stringify(state.pub)).not.toContain('trail');
  });

  it('돌파되지 않은 역경의 이력은 비공개 상태로만 쌓이고, 새 역경은 이력이 비어서 시작', () => {
    expect(state.secret.trail[0]).toEqual([{ team: 'B', card: 'basic', amount: 2 }]);
    expect(state.secret.trail[1]).toEqual([]);
    expect(state.secret.trail[2]).toEqual([{ team: 'E', card: 'basic', amount: 2 }]);
  });

  it('전리품은 앞쪽 역경에 전갈 화살 → 쇠사슬 순으로 붙고, 돌파 사건에 무기 이름 공개', () => {
    expect(state.hands.A).toMatchObject({ promo: 1, hold: 0 });
    expect(state.hands.D).toMatchObject({ hold: 1, promo: 0 });
    const deals = state.pub.events.filter((e) => e.result === 'deal');
    expect(deals.map((e) => e.loot)).toEqual(['promo', 'hold']);
    expect(notes.A?.[0].text).toContain('[전갈 화살] 획득');
  });

  it('돌파된 역경은 해역의 지나간 역경 목록에 쌓임 (공개 정보)', () => {
    expect(state.pub.tables[0].done).toEqual([{ agenda: 1, team: 'A' }]);
    expect(state.pub.tables[1].done).toEqual([{ agenda: 2, team: 'D' }]);
    expect(state.pub.tables[2].done ?? []).toEqual([]);
  });

  it('2일차 순서: D → A → E → C → B', () => {
    expect(startRound(state).state.pub.order).toEqual(['D', 'A', 'E', 'C', 'B']);
  });
});

describe('특수 무기', () => {
  function withHand(team: TeamId, card: 'blitz' | 'practice' | 'promo' | 'hold'): EngineState {
    const s = round1();
    s.hands[team]![card] = 1;
    return s;
  }

  it('아테나의 쇠사슬: 순번과 관계없이 앞 순번 함대의 공격도 무효, 특수 무기는 반환', () => {
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
    expect(notes.A?.[0].text).toContain('동결');
    // 쇠사슬은 쓴 함대를 공개
    expect(state.pub.events.find((e) => e.kind === 'hold')?.team).toBe('E');
  });

  it('같은 해역에 두 함대가 쇠사슬을 쓰면 둘 다 공개', () => {
    const s = withHand('E', 'hold');
    s.hands.D!.hold = 1;
    const { state } = resolveRound(s, { D: { table: 1, card: 'hold', cutIn: 0 }, E: { table: 1, card: 'hold', cutIn: 0 } });
    expect(state.pub.events.filter((e) => e.kind === 'hold').map((e) => e.team)).toEqual(['D', 'E']);
  });

  it('헤르메스의 투척 창: 오늘 그 해역의 돌파를 순번과 관계없이 가로챔', () => {
    const s = withHand('C', 'practice');
    // 바람 자루 3: A −2, B −2 로 B가 돌파하지만 C가 가로챔
    const { state, notes } = resolveRound(s, { A: basic(2), B: basic(2), C: { table: 2, card: 'practice', cutIn: 0 } });
    expect(state.pub.teams.C!.score).toBe(13);
    expect(state.pub.teams.B!.score).toBe(10);
    expect(state.hands.C).toMatchObject({ practice: 0, hold: 1 });
    expect(state.pub.events.find((e) => e.result === 'deal')).toMatchObject({ team: 'B', stolenBy: 'C', agenda: 2 });
    expect(state.pub.tables[1].done).toEqual([{ agenda: 2, team: 'C' }]);
    expect(notes.B?.at(-1)?.text).toContain('빼앗겼어요');
    expect(state.secret.practice).toEqual([]);
  });

  it('뒤 순번이 걸어도 앞 순번의 돌파를 가로챔', () => {
    const s = withHand('E', 'practice');
    const { state } = resolveRound(s, { A: basic(1), E: { table: 1, card: 'practice', cutIn: 0 } });
    expect(state.pub.teams.E!.score).toBe(12);
    expect(state.pub.teams.A!.score).toBe(10);
  });

  it('가로챌 돌파가 없으면 다음 날 시작 시 −6, 돌파되면 창 주인이 보상', () => {
    const s = withHand('C', 'practice');
    const r1 = resolveRound(s, { C: { table: 3, card: 'practice', cutIn: 0 } }).state;
    expect(r1.secret.remaining[2]).toBe(4);
    expect(r1.secret.practice).toEqual([{ team: 'C', table: 3 }]);
    const r2 = startRound(r1);
    expect(r2.state.pub.teams.C!.score).toBe(14);
    expect(r2.state.pub.events[0]).toMatchObject({
      kind: 'practiceDeal',
      team: 'C',
      agenda: 3,
      loot: 'blitz',
      weapon: 'practice',
    });
  });

  it('투척 창은 마지막 날에도 가로채기로 쓸 수 있고, 못 가로채면 그대로 끝', () => {
    const s = withHand('C', 'practice');
    s.pub.round = ROUNDS;
    const { state } = resolveRound(s, { C: { table: 3, card: 'practice', cutIn: 0 } });
    expect(state.hands.C!.practice).toBe(0);
    expect(state.secret.practice).toEqual([]);
  });

  it('동결된 해역에 건 투척 창은 무효, 무기 반환', () => {
    const s = withHand('C', 'practice');
    s.hands.E!.hold = 1;
    const { state } = resolveRound(s, { C: { table: 2, card: 'practice', cutIn: 0 }, E: { ...basic(1), extra: { card: 'hold', table: 2 } } });
    expect(state.hands.C!.practice).toBe(1);
    expect(state.pub.events.find((e) => e.team === 'C')).toMatchObject({ result: 'void', reason: 'hold' });
  });

  it('쇠사슬은 공격 무기와 함께 추가로: 내 공격은 그대로, 다음 날 그 해역 우선 적용', () => {
    const s = withHand('E', 'hold');
    s.hands.A!.blitz = 1;
    const { state } = resolveRound(s, { A: { table: 2, card: 'blitz', cutIn: 0 }, E: { ...basic(3), extra: { card: 'hold', table: 2 } } });
    expect(state.secret.remaining[1]).toBe(3); // A의 삼지창 무효
    expect(state.hands.A!.blitz).toBe(1);
    expect(state.secret.remaining[2]).toBe(2); // E의 단검은 그대로 적용
    expect(state.secret.priority).toEqual([{ team: 'E', table: 2 }]);
    // 다음 날: E가 마지막 순번이어도 2번 해역 공격이 가장 먼저
    for (const t of ['A', 'B', 'C', 'D'] as const) state.pub.teams[t]!.score = 15;
    const r2 = beginSubmit(startRound(state).state, 0);
    expect(r2.pub.order.at(-1)).toBe('E');
    const lead = r2.pub.order[0];
    const after = resolveRound(r2, { [lead]: basic(2), E: basic(2) }).state;
    const proposals = after.pub.events.filter((e) => e.kind === 'proposal');
    expect(proposals[0]).toMatchObject({ team: 'E', first: true });
    expect(after.pub.tables[1].done).toEqual([{ agenda: 2, team: lead }]); // E가 3→1, 1위 함대가 마지막 일격
    expect(after.secret.priority).toEqual([]);
  });

  it('전갈 화살은 공격 무기와 함께 추가로 꽂고, 공격도 그대로 적용', () => {
    const s = withHand('B', 'promo');
    const { state } = resolveRound(s, { A: basic(2), B: { ...basic(1), extra: { card: 'promo', table: 2 } } });
    // B: 로투스 섬 돌파(+2) + 바람 자루 3 − 2(A) − 1(전갈 화살) = 0 → B 돌파(+3)
    expect(state.pub.teams.B!.score).toBe(15);
    expect(state.hands.B!.promo).toBe(1); // 쓴 1장 − 로투스 섬 전리품(전갈 화살) 1장
    expect(state.pub.tables[1].promos).toEqual(['B']);
    expect(state.pub.events.find((e) => e.kind === 'promoDeal')).toMatchObject({ team: 'B', agenda: 2 });
  });

  it('전갈 화살: 매일 끝날 때 1 감소, 돌파 시 꽂은 함대가 보상', () => {
    const s = withHand('B', 'promo');
    const { state } = resolveRound(s, { A: basic(2), B: { table: 2, card: 'promo', cutIn: 0 } });
    // 바람 자루 3 − 2(A) − 1(전갈 화살) = 0 → B 돌파
    expect(state.pub.teams.B!.score).toBe(13);
    expect(state.pub.tables[1]).toMatchObject({ agenda: 4, promos: ['B'] });
    expect(state.pub.events.find((e) => e.kind === 'promoDeal')).toMatchObject({ team: 'B', agenda: 2, reward: 3, weapon: 'promo' });
  });

  it('예전에 저장된 게임(이력 없음)도 이어서 진행', () => {
    const s = round1();
    delete (s.secret as Partial<typeof s.secret>).trail;
    const { state } = resolveRound(s, { A: basic(1) });
    expect(state.pub.events.find((e) => e.result === 'deal')).toMatchObject({ team: 'A', agenda: 1 });
    expect(state.secret.trail[0]).toEqual([]);
  });

  it('포세이돈의 삼지창: 6 감소, 넘친 수치는 사라짐', () => {
    const s = withHand('A', 'blitz');
    const { state } = resolveRound(s, { A: { table: 1, card: 'blitz', cutIn: 0 }, B: basic(1) });
    expect(state.pub.teams.A!.score).toBe(12);
    expect(state.secret.remaining[0]).toBe(1); // 새로 온 키르케 3 − B의 2
  });

  it('가지고 있지 않은 무기는 무효', () => {
    const { state } = resolveRound(round1(), { A: { table: 1, card: 'blitz', cutIn: 0 } });
    expect(state.secret.remaining[0]).toBe(2);
  });
});

describe('제피로스의 순풍 (새치기)', () => {
  it('원하는 순번으로 이동하고 2해리 후퇴', () => {
    const { state } = resolveRound(round1(), { E: { ...basic(1), cutIn: 1 } });
    expect(state.pub.order).toEqual(['E', 'A', 'B', 'C', 'D']);
    // E는 2해리 후퇴 후 로투스 섬 돌파로 2해리 전진
    expect(state.pub.teams.E!.score).toBe(10);
    expect(state.pub.events[0]).toMatchObject({ kind: 'start', cutIn: true, order: ['E', 'A', 'B', 'C', 'D'] });
  });

  it('겹치면 고국에 가까운 함대 우선, 밀린 함대는 다음 빈자리', () => {
    const s = round1();
    s.pub.teams.D!.score = 15;
    const { state } = resolveRound(s, { C: { ...basic(1), cutIn: 1 }, D: { ...basic(1), cutIn: 1 } });
    expect(state.pub.order).toEqual(['D', 'C', 'A', 'B', 'E']);
  });

  it('설명 슬라이드 예시: D·E가 모두 1번째 → D → E → A → B → C, 둘 다 −2', () => {
    const s = round1();
    Object.assign(s.pub.teams, { A: { score: 14, deals: 0 }, B: { score: 12, deals: 0 }, D: { score: 9, deals: 0 }, E: { score: 8, deals: 0 } });
    const { state } = resolveRound(s, { D: { ...basic(4), cutIn: 1 }, E: { ...basic(4), cutIn: 1 } });
    expect(state.pub.order).toEqual(['D', 'E', 'A', 'B', 'C']);
    expect(state.pub.teams.E!.score).toBe(6);
  });

  it('순서가 그대로면 새 순서를 싣지 않음', () => {
    const { state } = resolveRound(round1(), { A: { ...basic(3), cutIn: 1 } });
    expect(state.pub.events[0]).toEqual(expect.objectContaining({ kind: 'start' }));
    expect(state.pub.events[0].order).toBeUndefined();
  });

  it('더 물러설 수 없으면 실패', () => {
    const s = round1();
    s.pub.teams.E!.score = 1;
    const { state, notes } = resolveRound(s, { E: { ...basic(3), cutIn: 1 } });
    expect(state.pub.order.at(-1)).toBe('E');
    expect(notes.E?.[0].text).toContain('실패');
  });
});

describe('아폴론의 예지 (스카우터)', () => {
  it('1해리 후퇴, 남은 생명력 확인', () => {
    const { state, result } = scout(round1(), 'A', 2);
    expect(result).toMatchObject({ agenda: 2, remaining: 3 });
    expect(state.pub.teams.A!.score).toBe(9);
  });

  it('제출 시간이 아니면 사용 불가', () => {
    const s = round1();
    s.pub.stage = 'order';
    expect(scout(s, 'A', 2).result.error).toBeDefined();
  });

  it('더 물러설 수 없으면 사용 불가', () => {
    const s = round1();
    s.pub.teams.A!.score = 0;
    expect(scout(s, 'A', 2).result.error).toBeDefined();
  });
});

describe('최종 결전', () => {
  it('8일차 시작 시 4번 해역에 이타카의 최종 결전(12) 등장, 돌파되면 닫힘', () => {
    let s = createGame(TEAM_IDS);
    for (let r = 1; r < FINAL_OPEN_ROUND; r++) {
      s = resolveRound(beginSubmit(startRound(s, keepOrder).state, 0), {}).state;
    }
    const r4 = startRound(s).state;
    expect(r4.pub.tables[3].agenda).toBe(FINAL_AGENDA);
    expect(r4.secret.remaining[3]).toBe(12);
    expect(r4.pub.events[0].kind).toBe('finalOpen');

    r4.secret.remaining[3] = 2;
    const subs = Object.fromEntries(r4.pub.order.map((t) => [t, basic(4)]));
    const after = resolveRound(beginSubmit(r4, 0), subs).state;
    const [first, second] = r4.pub.order;
    expect(after.pub.teams[first]!.score).toBe(22);
    expect(after.pub.tables[3].agenda).toBe(0);
    expect(after.pub.events.find((e) => e.team === second)).toMatchObject({ result: 'void', reason: 'empty' });
  });
});

describe('최종 순위', () => {
  it('고국과의 거리 → 돌파 수 순, 모두 같으면 공동 순위', () => {
    const s = finish(createGame(['A', 'B', 'C']));
    s.pub.teams = { A: { score: 12, deals: 1 }, B: { score: 12, deals: 2 }, C: { score: 12, deals: 1 } };
    expect(ranking(s.pub).map((r) => [r.team, r.rank])).toEqual([
      ['B', 1],
      ['A', 2],
      ['C', 2],
    ]);
  });
});

describe('고국과의 거리', () => {
  it('15해리 출발, 돌파하면 생명력만큼 가까워지고 아이템을 쓰면 멀어짐', () => {
    const s = round1();
    expect(distanceOf(s.pub.teams.A!.score)).toBe(START_DISTANCE);
    const { state } = resolveRound(s, { A: { ...basic(2), cutIn: 1 } });
    expect(distanceOf(state.pub.teams.A!.score)).toBe(START_DISTANCE + 2);
    const after = resolveRound(round1(), { A: basic(1) }).state;
    expect(distanceOf(after.pub.teams.A!.score)).toBe(START_DISTANCE - 2);
  });
});

describe('7일차 특별 이벤트: 스핑크스 (구조선 퀴즈)', () => {
  /** RESCUE_ROUND 공개가 끝난 상태. A가 1등, B가 2등, C·D·E는 같은 거리 */
  function day7(): EngineState {
    let s = startRound(createGame(TEAM_IDS), keepOrder).state;
    for (let d = 1; d < RESCUE_ROUND; d++) s = startRound(resolveRound(beginSubmit(s, 0), {}).state, keepOrder).state;
    s = resolveRound(beginSubmit(s, 0), {}).state;
    s.pub.revealed = s.pub.events.length;
    s.pub.teams.A!.score = 20;
    s.pub.teams.B!.score = 15;
    return s;
  }

  it('7일차 공개가 끝난 뒤에만 열리고, 3·4·5등이 도전. 거리가 같으면 오늘 먼저 공격한 함대가 뒤 등수', () => {
    const s = day7();
    expect(canOpenRescue(s)).toBe(true);
    expect(canOpenRescue({ ...s, pub: { ...s.pub, revealed: 0 } })).toBe(false);
    const o = openRescue(s);
    const tied = s.pub.order.filter((t) => t !== 'A' && t !== 'B').reverse();
    expect(o.pub.rescue).toEqual({ phase: 'offer', candidates: tied, level: {}, correct: {} });
    expect(canOpenRescue(o)).toBe(false);
    expect(markQuiz(o, 'A', { level: 'low' })).toBe(o);
  });

  it('맞힌 함대만 난도별 보상(하 2 · 중 3 · 상 6) 전진, 오답은 벌칙 없음, 모두 계속 항해', () => {
    const base = day7();
    let s = openRescue(base);
    const [c3, c4, c5] = s.pub.rescue!.candidates;
    s = markQuiz(s, c3, { level: 'high', correct: true });
    s = markQuiz(s, c4, { level: 'low', correct: false });
    s = markQuiz(s, c5, { level: 'mid', correct: true });
    // 문제 공개는 난도 하부터
    expect(quizQueue(s.pub.rescue!)).toEqual([c4, c5, c3]);
    const done = settleRescue(s);
    expect(done.pub.rescue!.rewards).toEqual({ [c3]: QUIZ_REWARD.high, [c5]: QUIZ_REWARD.mid });
    expect(done.pub.teams[c3]!.score - base.pub.teams[c3]!.score).toBe(6);
    expect(done.pub.teams[c4]!.score).toBe(base.pub.teams[c4]!.score);
    expect(done.pub.teams[c5]!.score - base.pub.teams[c5]!.score).toBe(3);
    const d8 = startRound(done).state;
    expect(d8.pub.order).toHaveLength(5);
    expect(d8.pub.order[0]).toBe('A');
  });

  it('생각 시간 타이머, 건너뛰면 아무도 전진하지 않음', () => {
    const base = day7();
    let s = openRescue(base);
    const [c3] = s.pub.rescue!.candidates;
    s = startQuizTimer(s, c3, 1000);
    expect(s.pub.rescue!.timer).toEqual({ team: c3, until: 1000 + QUIZ_THINK_SECONDS * 1000 });
    expect(startQuizTimer(s, 'A', 0)).toBe(s);
    s = markQuiz(s, c3, { level: 'high', correct: true });
    const skipped = settleRescue(s, true);
    expect(skipped.pub.rescue).toMatchObject({ phase: 'done', rewards: {} });
    expect(skipped.pub.rescue!.timer).toBeUndefined();
    expect(scores(skipped)).toEqual(scores(base));
  });
});
