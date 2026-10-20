/*
 * 오디세이아 밸런스 시뮬레이션 (실제 엔진 + 단순 AI 함대, 변형마다 3000판).
 * 실행: npx tsx scripts/balance-sim.ts [size|order|tier]
 *   size  : 역경 수·특수 무기 수 변형 (2026-10-20 첫 번째)
 *   order : 역경 순서 오름차순(지금) vs 무작위(최종 결전 제외, 전리품은 처음 나오는 5개에) vs 구간 안에서만 무작위 (기본값)
 *   tier  : 구간 안에서만 무작위 두 가지만
 * AI: 남은 생명력을 노이즈(σ1.5) 섞어 추정, 쓰러뜨릴 수 있어 보이는 큰 역경을 노리고 아니면 보상/남은 비율이 큰 역경을 깎음.
 *     화살은 6 이하로 보이는 큰 역경에, 투척 창은 가장 큰 역경에, 쇠사슬은 얻자마자, 삼지창은 가끔. 순풍은 드물게(맨 뒤로).
 * v3.3부터 data.ts 기준 배치가 22개라 '지금'·'역경 +4' 이름의 변형은 v3.2(18개) 때 결과와 기준이 다름 (2026-10-20 결과는 docs/progress.md).
 * 추가 역경은 id 100+로 대기열 중간에 끼워 넣음. 4번 해역 개시일(FINAL_OPEN_ROUND)은 data.ts 값 그대로.
 */
import { AGENDAS, FINAL_AGENDA, LOOT_ORDER, SETUP, TEAM_IDS, type SpecialCardId, type Setup, type TeamId } from '../src/deal/data';
import { beginSubmit, createGame, resolveRound, startRound, type EngineState } from '../src/deal/engine';
import type { Submission } from '../src/deal/types';

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const SIGMA = 1.5;
const DAYS = 10;

const EXTRA_LOOT: SpecialCardId[] = ['blitz', 'practice', 'blitz', 'promo', 'blitz', 'practice', 'blitz'];

/** 추가 역경(id 100+)을 대기열 중간에 끼워 넣은 오름차순 배치 */
function ascending(extra: number[]): { ids: number[]; demand: Record<number, number> } {
  const queue = [...SETUP.queue];
  const demand = { ...SETUP.demand };
  extra.forEach((hp, k) => {
    const id = 100 + k;
    AGENDAS[id] = { id, icon: '?', title: `추가${k}`, topic: '', demand: hp, tier: 'mid' };
    demand[id] = hp;
    queue.splice(Math.min(queue.length, 3 + k * 2), 0, id);
  });
  return { ids: [...SETUP.tables, ...queue], demand };
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

interface Variant {
  name: string;
  extra?: number[];
  loot?: number;
  /** 최종 결전 외 역경 순서를 판마다 무작위로 */
  random?: boolean;
  /** 생명력 구간(2~3 / 4~6 / 8~10) 안에서만 섞기: 쉬운 역경 → 어려운 역경 흐름은 유지 */
  tiered?: boolean;
}

function makeSetup(v: Variant): Setup {
  const base = ascending(v.extra ?? []);
  const band = (id: number) => (base.demand[id] <= 3 ? 0 : base.demand[id] <= 6 ? 1 : 2);
  const ids = v.random
    ? shuffle(base.ids)
    : v.tiered
      ? [0, 1, 2].flatMap((b) => shuffle(base.ids.filter((id) => band(id) === b)))
      : base.ids;
  const n = v.loot ?? LOOT_ORDER.length;
  const kinds = [...LOOT_ORDER, ...EXTRA_LOOT];
  // 5장까지는 처음 나오는 역경부터, 그 이상은 6번째부터 한 칸씩 건너 배치
  const slots = n <= 5 ? ids.slice(0, n) : ids.filter((_, i) => i < 5 || (i - 5) % 2 === 0).slice(0, n);
  return { tables: ids.slice(0, 3), queue: ids.slice(3), demand: base.demand, loot: Object.fromEntries(slots.map((id, i) => [id, kinds[i]])) };
}

interface Stat {
  slainBy: number[];
  firstDeal: number;
  finalDay: number;
  dist: number[];
  emptyDay: number;
  zeroTeams: number;
  leaderDay5Wins: boolean;
  /** 전리품별 획득 일차 (끝까지 못 얻으면 0) */
  lootDay: number[];
  used: number;
  unused: number;
  /** 특수 무기로 마지막 일격·가로채기해 얻은 전진 거리 합 */
  specialGain: number;
  /** 처음 3일 동안의 돌파 수 */
  early: number;
}

function play(setup: Setup): Stat {
  let s: EngineState = createGame(TEAM_IDS, setup);
  const slainBy: number[] = [];
  let finalDay = 0, emptyDay = 0, firstDeal = 0, used = 0, specialGain = 0;
  let leader5: TeamId | undefined;
  let slain = 0;
  const lootIds = Object.keys(setup.loot).map(Number);
  const lootDay = lootIds.map(() => 0);
  const handSum = () => TEAM_IDS.reduce((n, t) => n + Object.values(s.hands[t]!).reduce((a, b) => a + b, 0), 0);
  for (let d = 1; d <= DAYS; d++) {
    s = startRound(s, rnd).state;
    for (const e of s.pub.events) if (e.agenda && e.reward && e.weapon && e.weapon !== 'basic') specialGain += e.reward;
    s = beginSubmit(s, 0);
    const open = s.pub.tables.map((t, i) => (t.agenda ? i : -1)).filter((i) => i >= 0);
    if (open.filter((i) => i < 3).length < 3 && !emptyDay) emptyDay = d;
    const subs: Partial<Record<TeamId, Submission>> = {};
    const est = s.secret.remaining.map((r) => r + gauss() * SIGMA);
    s.pub.order.forEach((t, pos) => {
      if (!open.length) return;
      const h = s.hands[t]!;
      const reward = (i: number) => setup.demand[s.pub.tables[i].agenda];
      const e = (i: number) => Math.max(1, Math.round(est[i]));
      const last = d === DAYS;
      let card: Submission['card'] = 'basic';
      let killable = open.filter((i) => e(i) <= 2).sort((a, b) => reward(b) - reward(a));
      if (!killable.length && h.blitz > 0) {
        const k = open.filter((i) => e(i) <= 6 && (reward(i) >= 5 || last)).sort((a, b) => reward(b) - reward(a));
        if (k.length) {
          killable = k;
          card = 'blitz';
        }
      }
      let table: number;
      if (killable.length && rnd() < 0.8) table = killable[0];
      else table = open.map((i) => [i, reward(i) / e(i) + rnd() * 0.8] as const).sort((a, b) => b[1] - a[1])[0][0];
      if (h.practice > 0 && (last || rnd() < 0.5)) {
        card = 'practice';
        table = [...open].sort((a, b) => reward(b) - reward(a))[0];
      }
      const sub: Submission = { table: table + 1, card, cutIn: 0 };
      if (h.promo > 0) sub.extra = { card: 'promo', table: [...open].sort((a, b) => reward(b) - reward(a))[0] + 1 };
      else if (h.hold > 0 && (last || rnd() < 0.4)) {
        const o = open.filter((i) => i !== table);
        if (o.length) sub.extra = { card: 'hold', table: o[0] + 1 };
      }
      if (pos === 0 && rnd() < 0.08 && s.pub.teams[t]!.score >= 2) sub.cutIn = s.pub.order.length;
      subs[t] = sub;
    });
    const before = handSum();
    const doneBefore = new Set(s.pub.tables.flatMap((t) => t.done ?? []).map((x) => x.agenda));
    s = resolveRound(s, subs).state;
    const doneNow = s.pub.tables.flatMap((t) => t.done ?? []).map((x) => x.agenda);
    const gotToday = doneNow.filter((a) => !doneBefore.has(a) && setup.loot[a]).length;
    used += before + gotToday - handSum();
    lootIds.forEach((id, k) => {
      if (!lootDay[k] && doneNow.includes(id)) lootDay[k] = d;
    });
    for (const e of s.pub.events) if (e.agenda && e.reward && ((e.weapon && e.weapon !== 'basic') || e.stolenBy)) specialGain += e.reward;
    slain = doneNow.length;
    slainBy[d] = slain;
    if (!firstDeal && slain) firstDeal = d;
    if (!finalDay && doneNow.includes(FINAL_AGENDA)) finalDay = d;
    if (d === 5) leader5 = [...TEAM_IDS].sort((a, b) => s.pub.teams[b]!.score - s.pub.teams[a]!.score)[0];
  }
  const sc = TEAM_IDS.map((t) => 25 - s.pub.teams[t]!.score).sort((a, b) => a - b);
  const winner = [...TEAM_IDS].sort((a, b) => s.pub.teams[b]!.score - s.pub.teams[a]!.score)[0];
  return {
    slainBy,
    firstDeal,
    finalDay,
    dist: sc,
    emptyDay,
    zeroTeams: TEAM_IDS.filter((t) => !s.pub.teams[t]!.deals).length,
    leaderDay5Wins: winner === leader5,
    lootDay,
    used,
    unused: handSum(),
    specialGain,
    early: slainBy[3],
  };
}

const N = 3000;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f = (x: number) => x.toFixed(1);
const pct = (a: boolean[]) => `${Math.round((100 * a.filter(Boolean).length) / a.length)}%`;

function run(v: Variant) {
  const sample = makeSetup(v);
  const total = sample.tables.length + sample.queue.length + 1;
  const st = Array.from({ length: N }, () => play(makeSetup(v)));
  const got = st.flatMap((x) => x.lootDay.filter(Boolean));
  const nLoot = sample.loot ? Object.keys(sample.loot).length : 0;
  console.log(`\n■ ${v.name}  (역경 ${total}개, 전리품 ${nLoot}장)`);
  console.log(`  누적 돌파  3일:${f(mean(st.map((x) => x.slainBy[3])))}  6일:${f(mean(st.map((x) => x.slainBy[6])))}  10일:${f(mean(st.map((x) => x.slainBy[10])))} / ${total}, 첫 돌파 평균 ${f(mean(st.map((x) => x.firstDeal)))}일차`);
  console.log(`  해역이 비기 시작한 판 ${pct(st.map((x) => x.emptyDay > 0))}, 최종 결전 돌파 ${pct(st.map((x) => x.finalDay > 0))}`);
  console.log(`  [특수 무기] 획득 일차 평균 ${f(mean(got))} (전리품별: ${Array.from({ length: nLoot }, (_, k) => f(mean(st.map((x) => x.lootDay[k]).filter(Boolean)))).join(' · ')})`);
  console.log(`              5일차까지 얻은 장수 ${f(mean(st.map((x) => x.lootDay.filter((d) => d && d <= 5).length)))}, 끝까지 안 나온 장수 ${f(mean(st.map((x) => x.lootDay.filter((d) => !d).length)))}`);
  console.log(`              사용 ${f(mean(st.map((x) => x.used)))}장 · 얻고도 못 쓴 ${f(mean(st.map((x) => x.unused)))}장, 특수 무기로 얻은 전진 ${f(mean(st.map((x) => x.specialGain)))}해리/판`);
  console.log(`  최종 거리 1위 ${f(mean(st.map((x) => x.dist[0])))} · 2위 ${f(mean(st.map((x) => x.dist[1])))} · 꼴찌 ${f(mean(st.map((x) => x.dist[4])))}해리, 1·2위 차 ${f(mean(st.map((x) => x.dist[1] - x.dist[0])))}, 5일차 선두 우승 ${pct(st.map((x) => x.leaderDay5Wins))}, 돌파 0회 함대 ${(mean(st.map((x) => x.zeroTeams))).toFixed(2)}개`);
}

const mode = process.argv[2] ?? 'order';
const variants: Variant[] =
  mode === 'tier'
    ? [
        { name: '구간 안에서만 무작위', tiered: true },
        { name: '역경 +4 · 구간 안에서만 무작위', extra: [4, 5, 5, 6], tiered: true },
      ]
    : mode === 'size'
    ? [
        { name: '현재 (v3.0)' },
        { name: '역경 +4 (생명력 4·5·5·6)', extra: [4, 5, 5, 6] },
        { name: '역경 +6 (생명력 3·4·5·5·6·6)', extra: [3, 4, 5, 5, 6, 6] },
        { name: '특수 무기 +3 (8장)', loot: 8 },
        { name: '역경 +4 & 특수 무기 +3', extra: [4, 5, 5, 6], loot: 8 },
      ]
    : [
        { name: '지금: 생명력 오름차순' },
        { name: '무작위 순서 (전리품은 처음 나오는 5개)', random: true },
        { name: '역경 +4 · 오름차순', extra: [4, 5, 5, 6] },
        { name: '역경 +4 · 무작위 순서', extra: [4, 5, 5, 6], random: true },
        { name: '구간 안에서만 무작위', tiered: true },
        { name: '역경 +4 · 구간 안에서만 무작위', extra: [4, 5, 5, 6], tiered: true },
      ];
variants.forEach(run);
