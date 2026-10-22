/*
 * 오디세이아 밸런스 시뮬레이션 (실제 엔진 + 단순 AI 함대, 변형마다 3000판).
 * 실행: npx tsx scripts/balance-sim.ts [size|order|tier|rescue]
 *   size  : 역경 수·특수 무기 수 변형 (2026-10-20 첫 번째)
 *   order : 역경 순서 오름차순(지금) vs 무작위(최종 결전 제외, 전리품은 처음 나오는 5개에) vs 구간 안에서만 무작위 (기본값)
 *   tier  : 구간 안에서만 무작위 두 가지만
 *   rescue: 구조선 hidden event (7일차 종료 후 한 함대를 목적지 거리로, 8~10일차 불참). 같은 난수로 '안 탐'·'탐'을 갈라 비교
 *   quiz-order: 확정안에서 8일차 공격 순서 변화의 효과만 따로 (순서를 퀴즈 전 거리로 고정한 경우와 비교)
 *   quiz  : 구조선 퀴즈안 (7일차 종료 후 3·4·5등이 퀴즈, 맞히면 N해리 전진, 계속 참여). 난도(정답률)·보상·제약 조합 비교
 * AI: 남은 생명력을 노이즈(σ1.5) 섞어 추정, 쓰러뜨릴 수 있어 보이는 큰 역경을 노리고 아니면 보상/남은 비율이 큰 역경을 깎음.
 *     화살은 6 이하로 보이는 큰 역경에, 투척 창은 가장 큰 역경에, 쇠사슬은 얻자마자, 삼지창은 가끔. 순풍은 드물게(맨 뒤로).
 * v3.3부터 data.ts 기준 배치가 22개라 '지금'·'역경 +4' 이름의 변형은 v3.2(18개) 때 결과와 기준이 다름 (2026-10-20 결과는 docs/progress.md).
 * 추가 역경은 id 100+로 대기열 중간에 끼워 넣음. 4번 해역 개시일(FINAL_OPEN_ROUND)은 data.ts 값 그대로.
 */
import { AGENDAS, CARDS, FINAL_AGENDA, LOOT_ORDER, SETUP, START_DISTANCE, START_SCORE, TEAM_IDS, shuffledSetup, type SpecialCardId, type Setup, type TeamId } from '../src/deal/data';
import { beginSubmit, createGame, ranking, resolveRound, startRound, type EngineState } from '../src/deal/engine';
import type { Submission } from '../src/deal/types';

let seed = 12345;
// mulberry32 (32비트 정수 연산). 2026-10-22 전에는 부동소수 LCG라 정밀도가 깎여 약 1만 번마다 같은 수열이 반복됐음 → 그 전 결과는 서로 다른 판이 수십 개뿐
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
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

/** AI 함대들의 오늘 제출 (skip: 제출하지 않는 함대, 예: 구조선을 탄 함대) */
function decide(s: EngineState, setup: Setup, d: number, skip: ReadonlySet<TeamId> = new Set(), weak: ReadonlySet<TeamId> = new Set()): Partial<Record<TeamId, Submission>> {
  const open = s.pub.tables.map((t, i) => (t.agenda ? i : -1)).filter((i) => i >= 0);
  const subs: Partial<Record<TeamId, Submission>> = {};
  const est = s.secret.remaining.map((r) => r + gauss() * SIGMA);
  s.pub.order.forEach((t, pos) => {
    if (!open.length || skip.has(t)) return;
    const h = s.hands[t]!;
    const reward = (i: number) => setup.demand[s.pub.tables[i].agenda];
    const e = (i: number) => Math.max(1, Math.round(est[i]));
    const last = d === DAYS;
    let card: Submission['card'] = 'basic';
    let killable = open.filter((i) => e(i) <= (weak.has(t) ? WEAK_POWER : 2)).sort((a, b) => reward(b) - reward(a));
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
  return subs;
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
    const subs = decide(s, setup, d);
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

/* ───── 구조선 (hidden event): 7일차 종료 후 한 함대가 타면 이타카 항구(0해리)로, 8~10일차 불참 ───── */

const RESCUE_DAY = 7;

/** day 다음 날부터 DAYS 까지 진행 (rescued 는 제출 안 함) */
function continueFrom(s0: EngineState, setup: Setup, rescued: ReadonlySet<TeamId>): EngineState {
  let s = s0;
  for (let d = RESCUE_DAY + 1; d <= DAYS; d++) {
    s = beginSubmit(startRound(s, rnd).state, 0);
    s = resolveRound(s, decide(s, setup, d, rescued)).state;
  }
  return s;
}

const rankOf = (s: EngineState, t: TeamId) => ranking(s.pub).find((r) => r.team === t)!.rank;
const distOf = (s: EngineState, t: TeamId) => START_DISTANCE + START_SCORE - s.pub.teams[t]!.score;

/** 구조선: 그 함대를 목적지 거리(dest)로 옮김 */
function board(s0: EngineState, t: TeamId, dest: number): EngineState {
  const s = structuredClone(s0);
  s.pub.teams[t]!.score = START_DISTANCE + START_SCORE - dest;
  return s;
}

interface RescueRow {
  day7: number[];
  stay: number[];
  ride: number[];
}

/** 목적지: 해리 숫자, 또는 'second' = 7일차 2등 함대의 거리 (2등 자신이 타면 3등 거리) */
type Dest = number | 'second';

function rescueSim(n: number, dests: Dest[]) {
  // byRank[dest][7일차 등수-1]
  const rows = dests.map(() => Array.from({ length: 5 }, (): RescueRow => ({ day7: [], stay: [], ride: [] })));
  const giftFirst: number[] = [], giftLastStay: number[] = [], giftLastRide: number[] = [], giftLastNoGift: number[] = [];
  const firstInland: boolean[] = [];
  for (let g = 0; g < n; g++) {
    const setup = shuffledSetup(rnd);
    let s: EngineState = createGame(TEAM_IDS, setup);
    for (let d = 1; d <= RESCUE_DAY; d++) {
      s = beginSubmit(startRound(s, rnd).state, 0);
      s = resolveRound(s, decide(s, setup, d)).state;
    }
    // 7일차 순위 (동점은 순서대로 끊음)
    const order7 = ranking(s.pub).map((r) => r.team);
    firstInland.push(distOf(s, order7[0]) < 0);
    const fork = seed;
    seed = fork;
    const stay = continueFrom(s, setup, new Set());
    order7.forEach((t, r) => {
      for (const [k, dest] of dests.entries()) {
        seed = fork;
        const to = dest === 'second' ? distOf(s, order7[t === order7[1] ? 2 : 1]) : dest;
        const ride = continueFrom(board(s, t, to), setup, new Set([t]));
        rows[k][r].day7.push(distOf(s, t));
        rows[k][r].stay.push(rankOf(stay, t));
        rows[k][r].ride.push(rankOf(ride, t));
      }
    });
    // 안 C: 1등이 타면 꼴찌에게 특수 무기(화살) 1장
    const first = order7[0], last = order7[4];
    seed = fork;
    const gifted = board(s, first, 0);
    gifted.hands[last]!.blitz += 1;
    const ride = continueFrom(gifted, setup, new Set([first]));
    seed = fork;
    const rideNoGift = continueFrom(board(s, first, 0), setup, new Set([first]));
    giftFirst.push(rankOf(ride, first));
    giftLastStay.push(rankOf(stay, last));
    giftLastRide.push(rankOf(ride, last));
    giftLastNoGift.push(rankOf(rideNoGift, last));
  }
  const avg = (a: number[]) => f(mean(a));
  const dist = (a: number[]) => [1, 2, 3, 4, 5].map((r) => `${Math.round((100 * a.filter((x) => x === r).length) / a.length)}`.padStart(3)).join(' ');
  const top3 = (a: number[]) => pct(a.map((x) => x <= 3));
  console.log(`\n■ 구조선 (7일차 종료 후, ${n}판, 역경 22개·구간 안 무작위)`);
  console.log(`  7일차 1등이 이미 이타카 내륙(0해리 미만)인 판: ${pct(firstInland)}`);
  dests.forEach((dest, k) => {
    console.log(`\n  [목적지 ${dest === 'second' ? '7일차 2등 함대의 위치' : `${dest}해리`}]  7일차 등수별 최종 등수 분포 (1~5등 %, 평균 등수, 3등 이내)`);
    rows[k].forEach((row, r) => {
      console.log(`  ${r + 1}등 (7일차 평균 ${avg(row.day7)}해리)  안 탐: ${dist(row.stay)} | 평균 ${avg(row.stay)} · 3등 이내 ${top3(row.stay)}   탐: ${dist(row.ride)} | 평균 ${avg(row.ride)} · 3등 이내 ${top3(row.ride)}`);
    });
    const rest = rows[k].slice(1);
    const all = (key: 'stay' | 'ride') => rest.flatMap((r) => r[key]);
    console.log(`  → 안 B (1등 외 4함대 중 가위바위보 1함대): 안 탐 평균 ${avg(all('stay'))} · 3등 이내 ${top3(all('stay'))}  /  탐 ${dist(all('ride'))} | 평균 ${avg(all('ride'))} · 3등 이내 ${top3(all('ride'))}`);
  });
  console.log(`\n  안 C (1등이 타면 꼴찌에게 아폴론의 전갈 화살 1장): 1등 최종 ${dist(giftFirst)} | 평균 ${avg(giftFirst)}`);
  console.log(`     꼴찌 최종 평균 등수: 아무도 안 탐 ${avg(giftLastStay)} · 1등만 탐(선물 없음) ${avg(giftLastNoGift)} · 1등 탐 + 화살 ${avg(giftLastRide)}`);
}

/* ───── 구조선 퀴즈 (2026-10-22 검토): 7일차 종료 후 3·4·5등에게 퀴즈, 맞히면 전진. 8~10일차도 그대로 참여 ───── */

/** 약화된 기본 무기 공격력 (제약안) */
const WEAK_POWER = 1;
let attacker: TeamId | undefined;
let weakTeams: ReadonlySet<TeamId> = new Set();
// 엔진은 그대로 두고 시뮬레이션 안에서만 함대별 단검 공격력을 바꿈:
// resolveRound 는 각 함대 차례에 subs[t] 를 읽은 직후 그 함대의 공격을 적용하므로, 마지막으로 읽힌 함대를 공격 함대로 봄
Object.defineProperty(CARDS.basic, 'power', { get: () => (attacker && weakTeams.has(attacker) ? WEAK_POWER : 2) });
const tracked = (subs: Partial<Record<TeamId, Submission>>) =>
  new Proxy(subs, { get: (o, k) => ((attacker = k as TeamId), o[k as TeamId]) });

interface QuizPlan {
  name: string;
  /** 정답률 (난도: 하 0.9 · 중 0.6 · 상 0.3 가정) */
  p: number;
  /** 7일차 3·4·5등 각각의 보상 (해리) */
  reward: [number, number, number];
  /** 맞힌 함대의 8~10일차 단검 공격력 −1 */
  weak?: boolean;
  /** 맞힌 함대는 8일차 하루 쉼 */
  rest?: boolean;
  /** 보상으로 7일차 2등보다 앞서지는 못함 (2등 거리까지만) */
  cap?: boolean;
  /** 비교용: 보상은 그대로 주되 8일차 공격 순서는 퀴즈 전 거리로 정함 (순서가 바뀌는 효과만 뺀 것) */
  orderFixed?: boolean;
}

function quizContinue(s0: EngineState, setup: Setup, weak: ReadonlySet<TeamId>, rest: ReadonlySet<TeamId>, late: Partial<Record<TeamId, number>> = {}): EngineState {
  let s = s0;
  for (let d = RESCUE_DAY + 1; d <= DAYS; d++) {
    s = startRound(s, rnd).state;
    // orderFixed: 8일차 순서가 정해진 뒤에 보상을 더함
    if (d === RESCUE_DAY + 1) for (const [t, r] of Object.entries(late)) s.pub.teams[t as TeamId]!.score += r!;
    s = beginSubmit(s, 0);
    weakTeams = weak;
    s = resolveRound(s, tracked(decide(s, setup, d, d === RESCUE_DAY + 1 ? rest : new Set(), weak))).state;
    weakTeams = new Set();
    attacker = undefined;
  }
  return s;
}

function quizSim(n: number, plans: QuizPlan[]) {
  type Row = { win1: boolean[]; rank2: number[]; rank345: number[]; win345: boolean[]; solvedRank: number[]; solvedWin: boolean[]; pass1: boolean[]; pass2: boolean[]; final345: boolean[]; finalSolved: boolean[] };
  const empty = (): Row => ({ win1: [], rank2: [], rank345: [], win345: [], solvedRank: [], solvedWin: [], pass1: [], pass2: [], final345: [], finalSolved: [] });
  const rows = plans.map(empty);
  const base = empty();
  const gap: number[][] = [[], [], [], []];
  const d7: number[][] = [[], [], [], [], []];
  for (let g = 0; g < n; g++) {
    const setup = shuffledSetup(rnd);
    let s: EngineState = createGame(TEAM_IDS, setup);
    for (let d = 1; d <= RESCUE_DAY; d++) {
      s = beginSubmit(startRound(s, rnd).state, 0);
      s = resolveRound(s, decide(s, setup, d)).state;
    }
    const o7 = ranking(s.pub).map((r) => r.team);
    o7.forEach((t, r) => d7[r].push(distOf(s, t)));
    for (let r = 0; r < 4; r++) gap[r].push(distOf(s, o7[r + 1]) - distOf(s, o7[r]));
    const record = (row: Row, end: EngineState, solved: TeamId[]) => {
      const win = ranking(end.pub)[0].team;
      row.win1.push(win === o7[0]);
      row.rank2.push(rankOf(end, o7[1]));
      o7.slice(2).forEach((t) => row.rank345.push(rankOf(end, t)));
      row.win345.push(o7.slice(2).includes(win));
      // 최종 결전(4번 해역)을 돌파한 함대
      const fin = end.pub.tables[3]?.done?.find((x) => x.agenda === FINAL_AGENDA)?.team;
      if (fin) {
        row.final345.push(o7.slice(2).includes(fin));
        if (solved.length) row.finalSolved.push(solved.includes(fin));
      }
      solved.forEach((t) => {
        row.solvedRank.push(rankOf(end, t));
        row.solvedWin.push(win === t);
      });
    };
    const fork = seed;
    record(base, quizContinue(s, setup, new Set(), new Set()), []);
    plans.forEach((plan, k) => {
      // 정답 여부는 판마다 따로 뽑고, 그 뒤 8~10일차는 같은 난수로 진행
      seed = (fork ^ Math.imul(k + 1, 0x9e3779b9)) | 0;
      const solved = o7.slice(2).filter(() => rnd() < plan.p);
      const q = structuredClone(s);
      const floor = START_DISTANCE + START_SCORE - distOf(s, o7[1]);
      const late: Partial<Record<TeamId, number>> = {};
      solved.forEach((t) => {
        const r = o7.indexOf(t) - 2;
        const team = q.pub.teams[t]!;
        const before = team.score;
        team.score += plan.reward[r];
        if (plan.cap) team.score = Math.min(team.score, floor);
        if (plan.orderFixed) {
          late[t] = team.score - before;
          team.score = before;
        }
      });
      const after = ranking(q.pub).map((x) => x.team);
      rows[k].pass1.push(solved.some((t) => after.indexOf(t) < after.indexOf(o7[0])));
      rows[k].pass2.push(solved.some((t) => after.indexOf(t) < after.indexOf(o7[1])));
      seed = fork;
      record(rows[k], quizContinue(q, setup, new Set(plan.weak ? solved : []), new Set(plan.rest ? solved : []), late), solved);
    });
  }
  const avg = (a: number[]) => f(mean(a));
  console.log(`\n■ 구조선 퀴즈 (7일차 종료 후 3·4·5등, ${n}판, 역경 22개·구간 안 무작위)`);
  console.log(`  7일차 평균 거리: ${d7.map((a, r) => `${r + 1}등 ${avg(a)}`).join(' · ')}해리`);
  console.log(`  7일차 등수 사이 평균 간격: ${gap.map((a, r) => `${r + 1}→${r + 2}등 ${avg(a)}`).join(' · ')}해리  (2→3등 간격 중앙값 ${[...gap[1]].sort((a, b) => a - b)[Math.floor(n / 2)]})`);
  const line = (name: string, r: Row) =>
    `  ${name.padEnd(34)} 7일차1등 우승 ${pct(r.win1).padStart(4)} · 3~5등 중 우승 ${pct(r.win345).padStart(4)} · 3~5등 평균 ${avg(r.rank345)}등 · 2등 평균 ${avg(r.rank2)}등` +
    (r.solvedRank.length ? ` | 맞힌 함대 평균 ${avg(r.solvedRank)}등·우승 ${pct(r.solvedWin)} | 보상 직후 1등 추월 ${pct(r.pass1)}·2등 추월 ${pct(r.pass2)}` : '') +
    ` | 최종 결전 3~5등 돌파 ${pct(r.final345)}${r.finalSolved.length ? `·맞힌 함대 ${pct(r.finalSolved)}` : ''}`;
  console.log(line('기준: 퀴즈 없음', base));
  plans.forEach((plan, k) => console.log(line(plan.name, rows[k])));
}

const mode = process.argv[2] ?? 'order';
if (mode === 'quiz-order') {
  // 확정안(하 2 · 중 3 · 상 6)에서 8일차 공격 순서가 바뀌는 효과가 얼마나 되는지
  const plans: QuizPlan[] = [];
  for (const [name, p, r] of [['하(90%) 2해리', 0.9, 2], ['중(60%) 3해리', 0.6, 3], ['상(30%) 6해리', 0.3, 6], ['모두 정답 6해리', 1, 6]] as const) {
    plans.push({ name, p, reward: [r, r, r] });
    plans.push({ name: `${name} · 8일차 순서 고정`, p, reward: [r, r, r], orderFixed: true });
  }
  quizSim(Number(process.argv[3] ?? 2000), plans);
  process.exit(0);
}
if (mode === 'quiz') {
  const P = { 하: 0.9, 중: 0.6, 상: 0.3 } as const;
  const plans: QuizPlan[] = [];
  for (const [lv, p] of Object.entries(P)) for (const r of [1, 2, 3, 4, 5, 6]) plans.push({ name: `${lv}(${p * 100}%) ${r}해리`, p, reward: [r, r, r] });
  for (const r of [2, 3, 4, 5]) plans.push({ name: `모두 정답 ${r}해리`, p: 1, reward: [r, r, r] });
  for (const r of [3, 4, 5, 6]) plans.push({ name: `모두 정답 ${r}해리 + 단검 −1`, p: 1, reward: [r, r, r], weak: true });
  for (const r of [3, 4, 5, 6]) plans.push({ name: `모두 정답 ${r}해리 + 8일차 쉼`, p: 1, reward: [r, r, r], rest: true });
  for (const r of [4, 6]) plans.push({ name: `모두 정답 ${r}해리 · 2등 거리까지`, p: 1, reward: [r, r, r], cap: true });
  plans.push({ name: '모두 정답 차등 3·4·5해리', p: 1, reward: [3, 4, 5] });
  plans.push({ name: '모두 정답 차등 2·3·4해리', p: 1, reward: [2, 3, 4] });
  plans.push({ name: '중(60%) 차등 3·4·5해리', p: 0.6, reward: [3, 4, 5] });
  quizSim(Number(process.argv[3] ?? 2000), plans);
  process.exit(0);
}
if (mode === 'rescue') {
  rescueSim(2000, process.argv[3] === 'second' ? ['second'] : [0, -3, 3, 'second']);
  process.exit(0);
}
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
