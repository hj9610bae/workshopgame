import { describe, expect, it } from 'vitest';
import { AGENDAS, FINAL_AGENDA, LOOT_ORDER, SETUP, TEAM_IDS, shuffledSetup } from './data';
import { createGame, resolveRound, beginSubmit, startRound } from './engine';
import { practiceSetup, tutorialSteps } from './tutorial';

describe('연습 게임 배치', () => {
  it('최종 결전을 뺀 역경 21개를 섞어 해역 3 + 대기열 18, 전리품 5장은 무작위 역경에', () => {
    for (let k = 0; k < 30; k++) {
      const s = practiceSetup();
      const ids = [...s.tables, ...s.queue];
      expect(s.tables).toHaveLength(3);
      expect(new Set(ids).size).toBe(21);
      expect(s.practice).toBe(true);
      expect(ids).not.toContain(FINAL_AGENDA);
      expect(Object.values(s.loot).sort()).toEqual([...LOOT_ORDER].sort());
      for (const id of ids) expect(s.demand[id]).toBe(AGENDAS[id].demand);
    }
  });

  it('엔진이 연습 배치의 대기열·생명력·전리품을 따름', () => {
    const setup = practiceSetup(() => 0.5);
    setup.demand[setup.tables[0]] = 2;
    setup.loot = { [setup.tables[0]]: 'blitz' };
    const s = beginSubmit(startRound(createGame(TEAM_IDS, setup), () => 0.999).state, 0);
    const { state } = resolveRound(s, { A: { table: 1, card: 'basic', cutIn: 0 } });
    expect(state.pub.tables[0].agenda).toBe(setup.queue[0]);
    expect(state.secret.remaining[0]).toBe(setup.demand[setup.queue[0]]);
    expect(state.hands.A!.blitz).toBe(1);
    expect(state.pub.tables[0].done).toEqual([{ agenda: setup.tables[0], team: 'A' }]);
  });

  it('설명은 슬라이드만, 마지막 장에 연습 항해 버튼', () => {
    const steps = tutorialSteps();
    expect(steps.every((s) => s.kind === 'slide')).toBe(true);
    expect(steps.at(-1)!.html).toContain('data-action="practice"');
  });
});

describe('돌파 발표 문구', () => {
  it('마지막 일격의 무기를 알리고, 특수 무기는 효과 설명을 붙임', async () => {
    const { describeEvent } = await import('./view');
    const base = { kind: 'proposal' as const, result: 'deal' as const, team: 'A' as const, agenda: 4, reward: 3, tables: [], scores: {} };
    expect(describeEvent({ ...base, weapon: 'basic' }).title).toBe('A함대, 🗡️ 기본 무기 단검으로 키르케의 환락 돌파!');
    const blitz = describeEvent({ ...base, weapon: 'blitz' });
    expect(blitz.title).toBe('A함대, 🔱 특수 무기 삼지창으로 키르케의 환락 돌파!');
    expect(blitz.detail).toContain('생명력 6 감소');
    expect(describeEvent({ ...base, kind: 'promoDeal', weapon: 'promo' }).title).toContain('🏹 특수 무기 전갈 화살로');
    // 동결된 해역에 낸 공격은 평소 공격과 똑같이 (낸 해역·무효 여부를 드러내지 않음)
    const frozen = describeEvent({ ...base, result: 'void', reason: 'hold', table: 2 });
    expect(frozen).toEqual(describeEvent({ ...base, result: 'done' }));
    expect(describeEvent({ ...base, stolenBy: 'C', weapon: 'basic' }).detail).toContain('마지막 일격은 A함대의 🗡️ 기본 무기 단검 · ⚡ 투척 창: 그날 그 해역의 돌파 보상을 가로챔');
  });
});

describe('실제 게임 배치 (구간 안에서만 섞기)', () => {
  it('하 → 중 → 상 구간 순서는 지키고, 전리품은 처음 나오는 5개 역경에 순서대로', () => {
    const rank = { low: 0, mid: 1, high: 2 };
    for (let k = 0; k < 30; k++) {
      const s = shuffledSetup();
      const ids = [...s.tables, ...s.queue];
      expect(ids).toHaveLength(21);
      expect([...ids].sort((a, b) => a - b)).toEqual([...SETUP.tables, ...SETUP.queue].sort((a, b) => a - b));
      const tiers = ids.map((id) => rank[AGENDAS[id].tier]);
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
      expect(ids.slice(0, 5).map((id) => s.loot[id])).toEqual(LOOT_ORDER);
      expect(Object.keys(s.loot)).toHaveLength(5);
      expect(s.practice).toBeUndefined();
    }
  });
});
