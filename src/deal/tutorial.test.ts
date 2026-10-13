import { describe, expect, it } from 'vitest';
import type { Hit } from './types';
import { exampleScenes, tutorialSteps } from './tutorial';

describe('튜토리얼 예시 1라운드 (규칙서 5장)', () => {
  const scenes = exampleScenes();
  const byTeam = Object.fromEntries(scenes.filter((s) => s.active && !s.slips?.[1]).map((s) => [s.active, s]));

  it('A가 검진비 합의, 1번 테이블에 전기차 등장', () => {
    expect(byTeam.A.deal).toMatchObject({ index: 0, team: 'A', agenda: 3, reward: 2 });
    expect(byTeam.A.tables[0].agenda).toBe(12);
    expect(byTeam.A.scores.A).toBe(12);
  });

  it('B는 새로 온 전기차를 4 → 2', () => {
    expect(byTeam.B.deal).toBeUndefined();
    expect(byTeam.B.title).toContain('전기차 4 → 2');
    expect(byTeam.B.remaining[0]).toBe(2);
  });

  it('C가 깎은 난임시술을 D가 막타', () => {
    expect(byTeam.C.remaining[1]).toBe(1);
    expect(byTeam.D.deal).toMatchObject({ team: 'D', agenda: 5, demand: 3 });
    expect(byTeam.D.deal!.trail.map((h: Hit) => h.team)).toEqual(['C', 'D']);
    expect(byTeam.D.tables[1].agenda).toBe(2);
  });

  it('라운드 종료 점수와 2라운드 순서', () => {
    const end = scenes.at(-2)!;
    expect(end.scores).toEqual({ A: 12, B: 10, C: 10, D: 12, E: 10 });
    expect(scenes.at(-1)!.order).toEqual(['D', 'A', 'E', 'C', 'B']);
  });

  it('설명 슬라이드 + 예시 장면 + 마무리', () => {
    const steps = tutorialSteps();
    expect(steps[0].kind).toBe('slide');
    expect(steps.at(-1)!.kind).toBe('slide');
    expect(steps.filter((s) => s.kind === 'scene')).toHaveLength(scenes.length);
  });
});
