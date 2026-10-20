/*
 * 오디세이아 밸런스 시뮬레이션 (실제 엔진 + 단순 AI 함대, 변형마다 3000판).
 * 실행: npx tsx scripts/balance-sim.ts
 * AI: 남은 생명력을 노이즈(σ1.5) 섞어 추정, 쓰러뜨릴 수 있어 보이는 큰 역경을 노리고 아니면 보상/남은 비율이 큰 역경을 깎음.
 *     화살은 6 이하로 보이는 큰 역경에, 투척 창은 가장 큰 역경에, 쇠사슬은 얻자마자, 삼지창은 가끔. 순풍은 드물게(맨 뒤로).
 * 추가 역경은 id 100+로 대기열 중간에 끼워 넣음. 4번 해역 개시일(FINAL_OPEN_ROUND)은 data.ts 값 그대로.
 */
import { AGENDAS, FINAL_AGENDA, SETUP, TEAM_IDS, type SpecialCardId, type Setup, type TeamId } from '../src/deal/data';
import { beginSubmit, createGame, resolveRound, startRound, type EngineState } from '../src/deal/engine';
import type { Submission } from '../src/deal/types';

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const SIGMA = 1.5;

function makeSetup(extra: number[], lootCount: number): Setup {
  // 추가 역경: id 100+, 중 구간 생명력 (대기열 중간에 끼워 넣음)
  const queue = [...SETUP.queue];
  const demand = { ...SETUP.demand };
  extra.forEach((hp, k) => {
    const id = 100 + k;
    AGENDAS[id] = { id, icon: '?', title: `추가${k}`, topic: '', demand: hp, tier: 'mid' };
    demand[id] = hp;
    queue.splice(Math.min(queue.length, 3 + k * 2), 0, id);
  });
  const order: SpecialCardId[] = ['promo', 'hold', 'blitz', 'blitz', 'practice', 'blitz', 'practice', 'blitz', 'promo', 'blitz', 'practice', 'blitz'];
  const ids = [...SETUP.tables, ...queue];
  // 전리품은 앞쪽부터 한 칸씩 건너 배치(5장 초과분이 뒤로 퍼지게)
  const slots = lootCount <= 5 ? ids.slice(0, lootCount) : ids.filter((_, i) => i < 5 || (i - 5) % 2 === 0).slice(0, lootCount);
  return { tables: SETUP.tables, queue, demand, loot: Object.fromEntries(slots.map((id, i) => [id, order[i]])) };
}

interface Stat { slainBy: number[]; finalDay: number; dist: number[]; idleAttacks: number; emptyDay: number; lootTeams: number; leaderDay5Wins: boolean; specialsUsed: number }

function play(setup: Setup, days: number): Stat {
  let s: EngineState = createGame(TEAM_IDS, setup);
  const slainBy: number[] = [];
  let finalDay = 0, idle = 0, emptyDay = 0, specials = 0;
  let leader5: TeamId | undefined;
  let slain = 0;
  for (let d = 1; d <= days; d++) {
    s = startRound(s, rnd).state;
    s = beginSubmit(s, 0);
    const open = s.pub.tables.map((t, i) => (t.agenda ? i : -1)).filter((i) => i >= 0);
    if (open.length < 3 && !emptyDay) emptyDay = d;
    const subs: Partial<Record<TeamId, Submission>> = {};
    const est = s.secret.remaining.map((r) => r + gauss() * SIGMA);
    s.pub.order.forEach((t, pos) => {
      if (!open.length) { idle++; subs[t] = { table: 1, card: 'basic', cutIn: 0 }; return; }
      const h = s.hands[t]!;
      const reward = (i: number) => setup.demand[s.pub.tables[i].agenda];
      const e = (i: number) => Math.max(1, Math.round(est[i]));
      const last = d === days;
      // 쓰러뜨릴 수 있어 보이는 해역 중 보상 큰 곳, 없으면 남은 비율이 적은(진척된) 큰 역경
      let card: Submission['card'] = 'basic';
      let killable = open.filter((i) => e(i) <= 2).sort((a, b) => reward(b) - reward(a));
      if (!killable.length && h.blitz > 0) {
        const k = open.filter((i) => e(i) <= 6 && (reward(i) >= 5 || last)).sort((a, b) => reward(b) - reward(a));
        if (k.length) { killable = k; card = 'blitz'; }
      }
      let table: number;
      if (killable.length && rnd() < 0.8) table = killable[0];
      else table = open.map((i) => [i, reward(i) / e(i) + rnd() * 0.8] as const).sort((a, b) => b[1] - a[1])[0][0];
      if (h.practice > 0 && (last || rnd() < 0.5)) {
        const big = [...open].sort((a, b) => reward(b) - reward(a))[0];
        card = 'practice'; table = big;
      }
      if (card !== 'basic') specials++;
      const sub: Submission = { table: table + 1, card, cutIn: 0 };
      if (h.promo > 0) { sub.extra = { card: 'promo', table: [...open].sort((a, b) => reward(b) - reward(a))[0] + 1 }; specials++; }
      else if (h.hold > 0 && (last || rnd() < 0.4)) { const o = open.filter((i) => i !== table); if (o.length) { sub.extra = { card: 'hold', table: o[0] + 1 }; specials++; } }
      if (pos === 0 && rnd() < 0.08 && s.pub.teams[t]!.score >= 2) sub.cutIn = s.pub.order.length; // 마지막 일격 노리고 맨 뒤로
      subs[t] = sub;
    });
    const before = s.pub.tables.reduce((n, t) => n + (t.done?.length ?? 0), 0);
    s = resolveRound(s, subs).state;
    const after = s.pub.tables.reduce((n, t) => n + (t.done?.length ?? 0), 0);
    slain += after - before;
    slainBy[d] = slain;
    if (!finalDay && s.pub.tables[3].done?.some((x) => x.agenda === FINAL_AGENDA)) finalDay = d;
    if (d === 5) leader5 = [...TEAM_IDS].sort((a, b) => s.pub.teams[b]!.score - s.pub.teams[a]!.score)[0];
  }
  const sc = TEAM_IDS.map((t) => 25 - s.pub.teams[t]!.score).sort((a, b) => a - b);
  const winner = [...TEAM_IDS].sort((a, b) => s.pub.teams[b]!.score - s.pub.teams[a]!.score)[0];
  const lootTeams = TEAM_IDS.filter((t) => s.pub.teams[t]!.deals > 0).length;
  return { slainBy, finalDay, dist: sc, idleAttacks: idle, emptyDay, lootTeams, leaderDay5Wins: winner === leader5, specialsUsed: specials };
}

const N = 3000;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a: boolean[]) => Math.round((100 * a.filter(Boolean).length) / a.length);
function run(name: string, extra: number[], loot: number, days = 12) {
  const setup = makeSetup(extra, loot);
  const total = setup.tables.length + setup.queue.length + 1;
  const hp = [...setup.tables, ...setup.queue].reduce((n, id) => n + setup.demand[id], 0) + 12;
  const st = Array.from({ length: N }, () => play(setup, days));
  const at = (d: number) => mean(st.map((x) => x.slainBy[d])).toFixed(1);
  const g10 = Array.from({ length: N }, () => play(setup, 10));
  const empty = g10.map((x) => x.emptyDay).filter(Boolean);
  console.log(`\n■ ${name}  (역경 ${total}개, 생명력 합 ${hp}, 전리품 ${loot}장)`);
  console.log(`  누적 처치 수  6일:${at(6)}  8일:${at(8)}  10일:${at(10)}  12일:${at(12)}  / ${total}`);
  console.log(`  10일 기준: 해역이 비기 시작한 판 ${pct(g10.map((x) => x.emptyDay > 0))}% (평균 ${empty.length ? mean(empty).toFixed(1) : '-'}일차), 빈 해역 때문에 헛공격 평균 ${mean(g10.map((x) => x.idleAttacks)).toFixed(1)}회`);
  console.log(`  최종 결전 처치 ${pct(g10.map((x) => x.finalDay > 0))}% (평균 ${mean(g10.filter((x) => x.finalDay).map((x) => x.finalDay)).toFixed(1)}일차)`);
  console.log(`  최종 거리: 1위 ${mean(g10.map((x) => x.dist[0])).toFixed(1)} · 2위 ${mean(g10.map((x) => x.dist[1])).toFixed(1)} · 꼴찌 ${mean(g10.map((x) => x.dist[4])).toFixed(1)}해리, 1·2위 차 ${mean(g10.map((x) => x.dist[1] - x.dist[0])).toFixed(1)}, 1위 동점 ${pct(g10.map((x) => x.dist[0] === x.dist[1]))}%`);
  console.log(`  처치 0회 함대 평균 ${mean(g10.map((x) => 5 - x.lootTeams)).toFixed(2)}개, 5일차 선두가 우승 ${pct(g10.map((x) => x.leaderDay5Wins))}%, 특수 무기 사용 ${mean(g10.map((x) => x.specialsUsed)).toFixed(1)}회`);
}

run('현재 (v3.0)', [], 5);
run('역경 +4 (생명력 4·5·5·6)', [4, 5, 5, 6], 5);
run('역경 +6 (생명력 3·4·5·5·6·6)', [3, 4, 5, 5, 6, 6], 5);
run('특수 무기 +3 (8장)', [], 8);
run('역경 +4 & 특수 무기 +3', [4, 5, 5, 6], 8);
run('역경 +6 & 특수 무기 +5 (10장)', [3, 4, 5, 5, 6, 6], 10);
