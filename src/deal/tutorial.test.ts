import { describe, expect, it } from 'vitest';
import { AGENDAS, FINAL_AGENDA, INITIAL_TABLES, LOOT } from './data';
import type { Hit } from './types';
import { exampleScenes, exampleSetup, tutorialSteps } from './tutorial';

/** 섞지 않는 난수 → 예시 배치가 항상 같음 */
const keepOrder = () => 0.999;

describe('튜토리얼 예시 라운드', () => {
  const setup = exampleSetup(keepOrder);
  const [t1, t2, t3] = setup.tables;
  const [q1, q2] = setup.queue;
  const scenes = exampleScenes(keepOrder);
  const byTeam = Object.fromEntries(scenes.filter((s) => s.active && !s.slips?.[1]).map((s) => [s.active, s]));

  it('특수 카드가 걸린 안건·성과급·실제 첫 테이블은 쓰지 않음', () => {
    for (let k = 0; k < 20; k++) {
      const ids = Object.keys(exampleSetup().demand).map(Number);
      expect(ids).toHaveLength(5);
      expect(ids.some((id) => LOOT[id] || id === FINAL_AGENDA || INITIAL_TABLES.includes(id))).toBe(false);
    }
  });

  it('A가 1번 테이블 합의 → 대기열 첫 안건 등장', () => {
    expect(byTeam.A.deal).toMatchObject({ index: 0, team: 'A', agenda: t1, demand: 2 });
    expect(byTeam.A.tables[0].agenda).toBe(q1);
    expect(byTeam.A.scores.A).toBe(10 + AGENDAS[t1].reward);
  });

  it('B는 새로 온 안건을 공격, 합의 아님', () => {
    expect(byTeam.B.deal).toBeUndefined();
    expect(byTeam.B.title).toContain(`${AGENDAS[q1].title} 제안 완료`);
  });

  it('C가 깎은 안건을 D가 막타, 이력 공개', () => {
    expect(byTeam.C.deal).toBeUndefined();
    expect(byTeam.D.deal).toMatchObject({ team: 'D', agenda: t2, demand: 3 });
    expect(byTeam.D.deal!.trail.map((h: Hit) => h.team)).toEqual(['C', 'D']);
    expect(byTeam.D.tables[1].agenda).toBe(q2);
    expect(byTeam.E.tables[2].agenda).toBe(t3);
  });

  it('라운드 종료 점수와 2라운드 순서', () => {
    const end = scenes.at(-2)!;
    expect(end.scores).toEqual({ A: 10 + AGENDAS[t1].reward, B: 10, C: 10, D: 10 + AGENDAS[t2].reward, E: 10 });
    // 동점인 B·C·E는 지난 라운드 뒤 순번부터
    expect(scenes.at(-1)!.order.slice(2)).toEqual(['E', 'C', 'B']);
  });

  it('장면에 남은 수치를 싣지 않음', () => {
    expect(scenes.every((s) => !('remaining' in s))).toBe(true);
  });

  it('설명 슬라이드 + 예시 장면 + 마무리', () => {
    const steps = tutorialSteps(keepOrder);
    expect(steps[0].kind).toBe('slide');
    expect(steps.at(-1)!.kind).toBe('slide');
    expect(steps.filter((s) => s.kind === 'scene')).toHaveLength(scenes.length);
  });
});
