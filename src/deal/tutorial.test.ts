import { describe, expect, it } from 'vitest';
import { AGENDAS, FINAL_AGENDA, LOOT_ORDER, TEAM_IDS } from './data';
import { createGame, resolveRound, beginSubmit, startRound } from './engine';
import { practiceSetup, tutorialSteps } from './tutorial';

describe('연습 게임 배치', () => {
  it('최종 결전을 뺀 역경 17개를 섞어 해역 3 + 대기열 14, 전리품 5장은 무작위 역경에', () => {
    for (let k = 0; k < 30; k++) {
      const s = practiceSetup();
      const ids = [...s.tables, ...s.queue];
      expect(s.tables).toHaveLength(3);
      expect(new Set(ids).size).toBe(17);
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
