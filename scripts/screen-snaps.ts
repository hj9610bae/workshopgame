/* 화면 점검용 스냅샷: 실제 엔진으로 한 판을 진행하며 화면 상태(LocalGame)를 모음 → snaps.json */
import { writeFileSync } from 'node:fs';
import { TEAM_IDS, RESCUE_ROUND, ROUNDS, FINAL_OPEN_ROUND, shuffledSetup, type TeamId } from '../src/deal/data';
import { beginSubmit, createGame, finish, markQuiz, openRescue, resolveRound, settleRescue, startQuizTimer, startRound, type EngineState } from '../src/deal/engine';
import type { Submission } from '../src/deal/types';

const outPath = process.argv[2];
let seed = Number(process.argv[3] ?? 1);
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const names: Partial<Record<TeamId, string>> = { A: '아킬레우스호', B: '헥토르의 방패', C: '페넬로페의 베틀', D: '텔레마코스', E: '키르케의 돼지들' };

function subsFor(s: EngineState): Partial<Record<TeamId, Submission>> {
  const open = s.pub.tables.map((t, i) => (t.agenda ? i + 1 : 0)).filter(Boolean);
  const subs: Partial<Record<TeamId, Submission>> = {};
  for (const t of s.pub.order) {
    if (!open.length) continue;
    const h = s.hands[t]!;
    const table = open[Math.floor(rnd() * open.length)];
    let card: Submission['card'] = 'basic';
    if (h.practice && rnd() < 0.6) card = 'practice';
    else if (h.blitz && rnd() < 0.5) card = 'blitz';
    const sub: Submission = { table, card, cutIn: rnd() < 0.06 ? 1 : 0 };
    if (h.promo) sub.extra = { card: 'promo', table: open[0] };
    else if (h.hold && rnd() < 0.5) sub.extra = { card: 'hold', table: open[open.length - 1] };
    subs[t] = sub;
  }
  return subs;
}

type Snap = { label: string; game: unknown };
const snaps: Snap[] = [];
const push = (label: string, engine: EngineState, extra: Record<string, unknown> = {}) =>
  snaps.push({ label, game: { names, engine: structuredClone(engine), subs: {}, log: [], history: [], ...extra } });

let s: EngineState = createGame(TEAM_IDS, shuffledSetup(rnd));
let lootTo = 0, steal = 0;
for (let d = 1; d <= ROUNDS; d++) {
  s = startRound(s, rnd).state;
  const dawn = s.pub.events.filter((e) => e.kind === 'practiceDeal').length;
  for (let k = 1; k <= dawn; k++) push(`d${d} 아침 투척 창 ${k}`, s, { dawn: k });
  push(`d${d} 순서 발표`, s);
  if (d === FINAL_OPEN_ROUND) push(`d${d} 해역 공개`, s, { finalShown: true });
  s = beginSubmit(s, Date.now());
  push(`d${d} 제출`, s, { finalShown: true });
  s = resolveRound(s, subsFor(s)).state;
  for (let k = 1; k <= s.pub.events.length; k++) {
    const e = s.pub.events[k - 1];
    if (e.lootTo) lootTo++;
    if (e.kind === 'steal') steal++;
    push(`d${d} 공개 ${k}/${s.pub.events.length} ${e.kind}${e.result ? `:${e.result}` : ''}${e.lootTo ? ' lootTo' : ''}`, { ...s, pub: { ...s.pub, revealed: k } }, { finalShown: true });
  }
  s.pub.revealed = s.pub.events.length;
  if (d === RESCUE_ROUND) {
    s = openRescue(s);
    push('스핑크스 등장', s, { finalShown: true });
    const [c3, c4, c5] = s.pub.rescue!.candidates;
    s = markQuiz(s, c3, { level: 'high' });
    s = markQuiz(s, c4, { level: 'mid' });
    s = markQuiz(s, c5, { level: 'low' });
    s = startQuizTimer(s, c5, Date.now());
    push('스핑크스 난도 선택 + 타이머', s, { finalShown: true });
    s = markQuiz(s, c3, { correct: true });
    s = markQuiz(s, c4, { correct: true });
    s = markQuiz(s, c5, { correct: false });
    s = startQuizTimer(s, undefined, 0);
    push('스핑크스 정답 체크', s, { finalShown: true });
    s = settleRescue(s);
    push('스핑크스 결과', s, { finalShown: true });
  }
}
s = finish(s);
push('피날레', s, { finalShown: true });
push('순위', s, { finalShown: true, rankShown: true });
push('항해 일지', s, { finalShown: true, rankShown: true, agendasShown: true });
writeFileSync(outPath, JSON.stringify(snaps));
console.log(`snaps ${snaps.length}, lootTo ${lootTo}, steal ${steal}`);
