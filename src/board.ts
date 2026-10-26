/*
 * 현장 진행 화면: 프로젝터 한 화면을 모두가 보고, 게임 보조자가 손으로 걷은 제출 용지를 입력해 진행.
 * 서버 없이 이 브라우저에만 저장. ?console 로 열면 같은 PC 의 '진행자 창'(비공개 입력용)이 됨.
 */
import './style.css';
import './board.css';
import { AGENDAS, CARDS, FINAL_AGENDA, PRACTICE_DAYS, QUIZ_FROM_RANK, QUIZ_LABEL, QUIZ_LEVELS, QUIZ_REWARD, QUIZ_THINK_SECONDS, RESCUE_ROUND, shuffledSetup, CUT_IN_COST, EXTRA_CARDS, FINAL_OPEN_ROUND, INITIAL_TABLES, ROUNDS, SCOUT_COST, SCOUT_NAME, START_DISTANCE, START_SCORE, SUBMIT_SECONDS, TEAM_IDS, distanceOf, type CardId, type ExtraCardId, type QuizLevel, type TeamId } from './deal/data';
import { agendaGlyph, cardGlyph, glyph } from './deal/icons';
import { agendaTitle, beginSubmit, canOpenRescue, createGame, finish, markQuiz, openRescue, quizQueue, ranking, resolveRound, revealNext, scout, settleRescue, startQuizTimer, startRound, type EngineState } from './deal/engine';
import { deck, distanceLabel, feltTable, seaMap, type TableLook } from './deal/felt';
import {
  beatConsole,
  closeConsole,
  commit,
  consoleAlive,
  emptyGame,
  loadGame,
  logNotes,
  onGameChange,
  saveGame,
  undo,
  type LocalGame,
} from './deal/local';
import { practiceSetup, tutorialSteps } from './deal/tutorial';
import type { GameEvent, ScoutResult, Stage, Submission } from './deal/types';
import { STAGE_LABEL, activeSetup, describeEvent, formatTimer, hpOf, setTeamNames, snapshot, teamName, useSetup } from './deal/view';
import { esc, onAction, render, toast } from './ui';

const app = document.querySelector<HTMLElement>('#app')!;
const isConsole = new URLSearchParams(location.search).has('console');
document.body.classList.add('live');
if (isConsole) document.body.classList.add('console');

let game: LocalGame = loadGame();
let mode: 'home' | 'tutorial' | 'game' = isConsole || game.engine ? 'game' : 'home';
let picked = new Set<TeamId>(TEAM_IDS);
/** 한 화면 진행일 때 입력 패널을 펼쳤는지 (닫혀 있으면 제출 내용이 화면에 안 나옴) */
let inputOpen = false;
let scoutShown: (ScoutResult & { team: TeamId }) | null = null;
let tutorialIndex = 0;
let autoplay: number | undefined;
const steps = tutorialSteps();

setTeamNames(game.names);

function save(next: LocalGame) {
  game = next;
  setTeamNames(game.names);
  saveGame(game);
  draw();
}

const eng = (): EngineState => game.engine!;
/** 연습 항해: 무작위 배치(setup)로 PRACTICE_DAYS 일만 */
const isPractice = (): boolean => !!game.engine?.setup?.practice;
const stage = (): Stage => game.engine?.pub.stage ?? 'lobby';
/** 진행자 창이 따로 열려 있으면 프로젝터 화면에는 조작 버튼을 숨김 */
const showDock = () => isConsole || !consoleAlive();

/* ───────── 처음 화면 ───────── */

function homeView(): string {
  const rows = TEAM_IDS.map((t) => {
    const on = picked.has(t);
    return `<li class="pick${on ? ' on' : ''}">
      <button class="pick-toggle" data-action="toggle-team" data-team="${t}">${on ? glyph('check-mark') : '<span class="pick-box"></span>'} ${t}</button>
      <input data-name="${t}" value="${esc(game.names[t] ?? '')}" placeholder="${t}함대" maxlength="12" ${on ? '' : 'disabled'} />
    </li>`;
  }).join('');
  const resume = game.engine
    ? `<button class="secondary" data-action="resume">이어서 진행 <span class="small">(${game.engine.pub.stage === 'final' ? '최종 결과' : `${game.engine.pub.round}일차`})</span></button>`
    : '';
  return `<section class="home-board">
    <div class="cover-waves" aria-hidden="true"></div>
    <div class="hero">
      ${laurel()}
      <h1>오디세이아 : 귀환의 항해</h1>
      <p class="cover-sub">${ROUNDS}일간의 해상 개척과 고국으로의 무사 귀환 작전</p>
      <button class="tutorial-btn" data-action="tutorial">${glyph('open-book')} 항해 설명 보기</button>
      <button class="secondary practice-home" data-action="practice">${glyph('rolling-dices')} 바로 연습 항해 (${PRACTICE_DAYS}일, 무작위 역경)</button>
    </div>
    <div class="card setup">
      <h2>참가 함대</h2>
      <ul class="picks">${rows}</ul>
      <p class="muted small">함대 이름은 비워 두면 'A함대'처럼 표시돼요.</p>
      ${resume}
      <button data-action="new-game" ${picked.size ? '' : 'disabled'}>▶ 출항 (${picked.size}함대)</button>
    </div>
    <p class="cover-sign">Design &amp; Production by 이주영 | World Concept by 정현목</p>
  </section>`;
}

/** 표지의 금빛 월계관 (라인 아트): 아래 가운데에서 양쪽으로 반원을 그리며 올라가는 두 가지 */
function laurel(): string {
  const cx = 60, cy = 52, r = 40;
  const at = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const parts: string[] = [];
  for (const side of [-1, 1]) {
    const end = 90 - side * 140;
    const [ex, ey] = at(end);
    parts.push(`<path d="M${cx} ${cy + r} A${r} ${r} 0 0 ${side < 0 ? 1 : 0} ${ex.toFixed(1)} ${ey.toFixed(1)}"/>`);
    for (let k = 0; k < 7; k++) {
      const deg = 90 - side * (22 + k * 19);
      const [x, y] = at(deg);
      // 가지 방향(접선)에서 바깥으로 비스듬히
      const tilt = deg + 90 - side * 40;
      parts.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7.5" ry="3" transform="rotate(${tilt.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
    }
  }
  return `<svg class="laurel" viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${parts.join('')}</svg>`;
}

/* ───────── 튜토리얼 ───────── */

function tutorialView(): string {
  const step = steps[tutorialIndex];
  const body = `<section class="slide"><h1>${glyph(step.icon, 'title-glyph')}${esc(step.title)}</h1>${step.html}${step.sea ? exampleSea(step.sea) : ''}</section>`;
  const dots = steps
    .map((_, i) => `<button class="dot-btn${i === tutorialIndex ? ' on' : ''}" data-action="tut-go" data-index="${i}" aria-label="${i + 1}번째 장면"></button>`)
    .join('');
  const last = tutorialIndex === steps.length - 1;
  return `<div class="tutorial">
    <header class="topbar">
      <div class="brand">${glyph('open-book')} 항해 설명</div>
      <div class="round-pill">${tutorialIndex + 1} / ${steps.length}</div>
      <div class="tools">
        <button class="small secondary" data-action="tut-auto">${autoplay ? '⏸ 자동 재생 멈춤' : '▶ 자동 재생'}</button>
        <button class="small secondary" data-action="tut-exit">닫기 ✕</button>
      </div>
    </header>
    ${body}
    <footer class="tut-nav">
      <button class="secondary" data-action="tut-prev" ${tutorialIndex ? '' : 'disabled'}>◀ 이전</button>
      <div class="dots">${dots}</div>
      ${last ? '<button data-action="practice">연습 항해 시작 ▶</button>' : '<button data-action="tut-next">다음 ▶</button>'}
    </footer>
  </div>`;
}

/** 설명용 바다 지도. start: 모두 트로이 전장(출발 거리)에서 출발 / order: 거리가 제각각인 공격 순서 예시 */
function exampleSea(kind: 'start' | 'order'): string {
  if (kind === 'start') {
    const scores = Object.fromEntries(TEAM_IDS.map((t) => [t, START_SCORE]));
    return `<div class="slide-sea">${seaMap([...TEAM_IDS], scores, { key: 'tutorial-start' })}</div>`;
  }
  // 고국에 가까운 순. B·C는 9해리 동점 → 전날 앞 순번이던 C가 뒤로
  const dist: Record<TeamId, number> = { A: 4, B: 9, C: 9, D: 12, E: 15 };
  const scores = Object.fromEntries(TEAM_IDS.map((t) => [t, START_DISTANCE + START_SCORE - dist[t]]));
  return `<div class="slide-sea">${seaMap([...TEAM_IDS], scores, { key: 'tutorial-order' })}</div>`;
}

function stopAutoplay() {
  clearInterval(autoplay);
  autoplay = undefined;
}

function goTutorial(i: number) {
  tutorialIndex = Math.min(Math.max(i, 0), steps.length - 1);
  if (tutorialIndex === steps.length - 1) stopAutoplay();
  draw();
}

/* ───────── 게임 화면 ───────── */

/** 입력 버튼에 쓰는 역경 이름 */
const shortTitle = (id: number): string => (AGENDAS[id] ? `${agendaGlyph(id)} ${esc(AGENDAS[id].title)}` : esc(agendaTitle(id)));

function roundText(): string {
  const { pub } = eng();
  if (isPractice()) return `${glyph('rolling-dices')} 연습 항해 ${pub.round}일차/${PRACTICE_DAYS}일차 · ${STAGE_LABEL[pub.stage]}`;
  return pub.stage === 'final' ? '최종 결과' : `${pub.round}일차/${ROUNDS}일차 · ${STAGE_LABEL[pub.stage]}`;
}

function topbar(): string {
  const tools = showDock()
    ? `<div class="tools">
        <button class="small secondary" data-action="undo" ${game.history.length ? '' : 'disabled'} title="Ctrl+Z">↶ 되돌리기</button>
        ${isConsole ? '' : `<button class="small secondary" data-action="open-console" title="노트북 화면에 비공개 입력 창을 띄워요">${glyph('laptop')} 진행자 창</button>`}
        ${isConsole ? '' : '<button class="small secondary" data-action="home">처음 화면</button>'}
      </div>`
    : '';
  return `<header class="topbar">
    <div class="brand">${isConsole ? `${glyph('laptop')} 진행자 창` : `${glyph('trireme')} 오디세이아`}</div>
    <div class="round-pill">${roundText()}</div>
    <div class="timer" data-timer></div>
    ${tools}
  </header>`;
}

/** FINAL_OPEN_ROUND 순서 발표 중이고 아직 '해역 공개'를 누르지 않음 (4번 해역은 엔진에 이미 있지만 화면엔 숨김) */
function finalPending(): boolean {
  const { pub } = eng();
  return pub.stage === 'order' && pub.events.some((e) => e.kind === 'finalOpen') && !game.finalShown;
}

/** 화면에 있는 해역 번호(0부터). 4번 해역(최종 결전)은 FINAL_OPEN_ROUND 순서 발표 뒤 '해역 공개'로 생김 */
function visibleTables(): number[] {
  const { pub } = eng();
  return pub.tables.map((_, i) => i).filter((i) => i < INITIAL_TABLES.length || (pub.round >= FINAL_OPEN_ROUND && !finalPending()));
}

/** 바다 지도의 결승선(이타카 왕궁): FINAL_OPEN_ROUND 부터 */
const showGoal = (): boolean => !isPractice() && eng().pub.round >= FINAL_OPEN_ROUND;

/** 마지막 날 '오늘의 항해 끝'까지 공개되면 1등 함대가 결승선에 도착 */
function arrivedTeams(): TeamId[] {
  const { pub } = eng();
  const over = pub.stage === 'final' || (pub.round >= ROUNDS && pub.stage === 'reveal' && pub.revealed >= pub.events.length);
  return !isPractice() && over ? ranking(pub).filter((r) => r.rank === 1).map((r) => r.team) : [];
}

/** 스핑크스 퀴즈를 연 그날 공개 단계(사건 공개가 끝난 뒤): 바다 지도를 퀴즈 보상이 반영된 거리로 */
function quizToday(): boolean {
  const { pub } = eng();
  return !!pub.rescue && pub.round === RESCUE_ROUND && pub.stage === 'reveal' && pub.revealed >= pub.events.length;
}

/** 퀴즈 보상: 정산 뒤엔 확정 보상, 진행 중엔 진행자가 정답으로 표시한 함대의 보상을 바로 미리 반영 */
function quizRewards(): Partial<Record<TeamId, number>> {
  const r = eng().pub.rescue!;
  if (r.phase === 'done') return r.rewards ?? {};
  return Object.fromEntries(r.candidates.filter((t) => r.level?.[t] && r.correct?.[t]).map((t) => [t, QUIZ_REWARD[r.level![t]!]]));
}

/** 퀴즈 중·뒤의 바다 지도 점수 (정산 전 보상은 엔진 점수에 아직 없으므로 더해서 보여 줌) */
function quizScores(): Partial<Record<TeamId, number>> {
  const { pub } = eng();
  const pending = pub.rescue?.phase === 'offer' ? quizRewards() : {};
  return Object.fromEntries(pub.teamIds.map((t) => [t, (pub.teams[t]?.score ?? 0) + (pending[t] ?? 0)]));
}

const quizReward = (level: QuizLevel) => `${QUIZ_LABEL[level]} +${QUIZ_REWARD[level]}해리`;
/** 난도 표시: 금빛 마름모 1·2·3개 (배너·진행자 조작 버튼 공통) */
const QUIZ_PIPS = (l: QuizLevel) => `<span class="lv-pips" aria-hidden="true">${'<i></i>'.repeat(QUIZ_LEVELS.indexOf(l) + 1)}</span>`;
const THINK = QUIZ_THINK_SECONDS % 60 === 0 ? `${QUIZ_THINK_SECONDS / 60}분` : `${QUIZ_THINK_SECONDS}초`;

/** 배너는 처음 나타날 때(단계가 바뀔 때)만 튀어나오게. 진행자가 입력할 때마다 다시 튀지 않도록 */
let lastRescueKey = '';
function popOnce(key: string): string {
  const pop = key !== lastRescueKey;
  lastRescueKey = key;
  return pop ? ' pop' : '';
}

/** 7일차 특별 이벤트: 올림포스의 스핑크스 (프로젝터). 고른 난도·정답 여부는 공개 */
function rescueBanner(): string {
  const r = eng().pub.rescue!;
  const name = (t: TeamId) => esc(teamName(t));
  // 도전 순서는 5위 → 4위 → 3위
  const challengers = [...r.candidates].reverse();
  const place = (t: TeamId) => r.candidates.indexOf(t) + QUIZ_FROM_RANK;
  const yes = glyph('check-mark', 'quiz-ok');
  const no = glyph('cross-mark', 'quiz-no');
  const mark = (t: TeamId) => (r.phase === 'done' ? (r.rewards?.[t] ? yes : r.correct?.[t] === false ? no : '') : r.correct?.[t] === true ? yes : r.correct?.[t] === false ? no : '');
  const levels = QUIZ_LEVELS.map((l) => {
    const picks = challengers.filter((t) => r.level?.[t] === l).map((t) => `<span class="quiz-chip">${name(t)}${mark(t)}</span>`).join('');
    return `<div class="quiz-level ${l}"><b>${QUIZ_PIPS(l)}난이도 [${QUIZ_LABEL[l]}]</b><span>성공: <em>+${QUIZ_REWARD[l]}해리</em></span><span class="muted">실패: 무보상</span>
      <div class="quiz-picks">${picks}</div></div>`;
  }).join('');
  const team = (t: TeamId) => `<span class="quiz-team${r.timer?.team === t ? ' on' : ''}">${place(t)}위 ${name(t)}${mark(t)}</span>`;
  const head = `<div class="sphinx-head"><div class="banner-icon">${glyph('greek-sphinx')}</div><h2>[${RESCUE_ROUND}일차 특별 이벤트] 올림포스의 스핑크스 등장!</h2></div>
    <p class="sphinx-quote">"지친 탐험대여, 나의 수수께끼를 풀어 구원선에 올라타라!"</p>
    <div class="quiz-levels">${levels}</div>`;
  if (r.phase === 'offer') {
    const timer = r.timer ? `<div class="quiz-timer"><span>${name(r.timer.team)} 생각 시간</span><b data-quiz-timer></b></div>` : '';
    return `<div class="banner rescue sphinx${popOnce('offer')}">${head}
      <p class="quiz-line">${glyph('archery-target', 'inline')} 도전팀 : ${challengers.map(team).join(' ➔ ')}</p>
      <p class="quiz-line">${glyph('sands-of-time', 'inline')} 제한시간 : 난이도 선택 후 생각시간 <b>${THINK}</b> · 문제는 난이도 [하]부터</p>
      ${timer}</div>`;
  }
  const won = challengers.filter((t) => r.rewards?.[t]);
  const result = won.length
    ? won.map((t) => `<li><b class="team-name">${name(t)}</b> 정답! 고국으로 <b>${r.rewards![t]}해리</b> 전진</li>`).join('')
    : '<li>스핑크스의 수수께끼를 푼 함대가 없어요</li>';
  return `<div class="banner rescue sphinx${won.length ? ' deal' : ''}${popOnce('done')}">${head}
    <ul class="quiz-rows">${result}</ul>
    <p class="muted">모든 함대가 남은 항해를 계속합니다.</p></div>`;
}

/** 진행자용 스핑크스 조작: 함대가 고른 난도 → (문제 공개) 생각 시간 → 정답/오답 → 결과 발표. 문제 순서는 난도 하부터 */
function rescueControls(): string {
  const r = eng().pub.rescue!;
  const pill = (action: string, t: TeamId, value: string, label: string, on: boolean) =>
    `<button class="pill${on ? ' on' : ''}" data-action="${action}" data-team="${t}" data-value="${value}">${label}</button>`;
  const allPicked = r.candidates.every((t) => r.level?.[t]);
  // 난도를 모두 고르면 문제 공개 순서(하 → 중 → 상)로 줄을 세움
  const rows = (allPicked ? quizQueue(r) : [...r.candidates].reverse())
    .map((t, i) => {
      const level = r.level?.[t];
      const ok = r.correct?.[t];
      const timing = r.timer?.team === t;
      return `<div class="in-group"><span class="in-label">${allPicked ? `${i + 1}. ` : ''}${esc(teamName(t))}</span>
        ${QUIZ_LEVELS.map((l) => pill('quiz-level', t, l, `${QUIZ_PIPS(l)} ${quizReward(l)}`, level === l)).join('')}
        <span class="quiz-sep"></span>
        ${pill('quiz-timer', t, timing ? 'stop' : 'start', timing ? `${glyph('stopwatch')} 시간 멈춤` : `${glyph('sands-of-time')} 생각 시간 ${THINK}`, timing)}
        ${pill('quiz-correct', t, 'yes', `${glyph('check-mark')} 정답`, ok === true)}${pill('quiz-correct', t, 'no', `${glyph('cross-mark')} 오답`, ok === false)}</div>`;
    })
    .join('');
  const ready = r.candidates.every((t) => r.level?.[t] && r.correct?.[t] !== undefined);
  return `<div class="rescue-ctl">${rows}
    <div class="row"><button class="wide" data-action="quiz-settle" ${ready ? '' : 'disabled'}>${glyph('greek-sphinx')} 결과 발표 · 맞힌 함대 전진</button>
      <button class="secondary narrow" data-action="rescue-skip">이벤트 건너뛰기</button></div></div>`;
}

/** 공개 중인 마지막 사건 (공개 단계에서만) */
function latestEvent(): GameEvent | undefined {
  const { pub } = eng();
  return pub.stage === 'reveal' ? pub.events[pub.revealed - 1] : undefined;
}

/** 돌파 사건 (해역에 새 역경이 올라옴). 투척 창 가로채기(steal)는 전진만 옮기는 사건이라 제외 */
const isDeal = (e: GameEvent): boolean => e.kind !== 'steal' && !!(e.agenda && e.reward && e.team);

function tableLooks(): TableLook[] {
  const { pub } = eng();
  const looks: TableLook[] = pub.tables.map(() => ({}));
  const reveal = pub.stage === 'reveal';
  // 공개 단계: 돌파 발표 동안은 돌파된 역경을 그대로 두고, 다음 사건에서 새 역경이 들어옴
  const before = reveal ? pub.events[pub.revealed - 2] : undefined;
  if (before?.table && isDeal(before)) looks[before.table - 1] = { fresh: true };
  const shown = reveal ? [pub.events[pub.revealed - 1]] : pub.stage === 'order' ? pub.events : [];
  for (const e of shown) {
    if (!e?.table) continue;
    const i = e.table - 1;
    if (e.kind === 'finalOpen') looks[i] = { fresh: true };
    else if (isDeal(e)) looks[i] = { deal: { team: e.team!, agenda: e.agenda!, reward: e.reward! }, fresh: true, slain: reveal };
    else if (e.kind === 'proposal' && e.result === 'promo') looks[i] = { promo: true };
    else if (e.kind === 'hold') looks[i] = { freeze: true };
  }
  return looks;
}

function banner(): string {
  const { pub } = eng();
  const done = pub.order.filter((t) => game.subs[t]?.table).length;
  switch (pub.stage) {
    case 'order': {
      // 최종 결전 등장은 순서 발표와 따로, '해역 공개' 뒤에 띄움
      const open = pub.events.find((e) => e.kind === 'finalOpen');
      if (open && game.finalShown) {
        const d = describeEvent(open);
        return `<div class="banner deal final-open pop"><div class="banner-icon">${bannerIcon(d.icon)}</div><h2>${esc(d.title)}</h2>${d.detail ? `<p>${esc(d.detail)}</p>` : ''}
          <p class="muted small">${pub.round}일차 순서: ${pub.order.map((t) => esc(teamName(t))).join(' → ')}</p></div>`;
      }
      const news = pub.events.filter((e) => e.kind !== 'finalOpen').map((e) => describeEvent(e)).map((d) => `<li>${bannerIcon(d.icon)} ${glyphText(d.title)}${d.detail ? ` <span class="muted">${glyphText(d.detail)}</span>` : ''}</li>`);
      const tie = pub.round === 1 ? '1일차 순서는 추첨!' : '고국에 가까운 함대부터. 같으면 지난 날 뒤 순번이 먼저.';
      return `<div class="banner calm"><h2>${pub.round}일차 순서 발표</h2><p>${pub.order.map((t) => esc(teamName(t))).join(' → ')}</p>
        ${news.length ? `<ul class="news">${news.join('')}</ul>` : ''}<p class="muted small">${tie}</p></div>`;
    }
    case 'submit': {
      // 양피지 명령서 예시: 필수(함대·해역·무기)와 선택(순풍·추가 무기)을 나눠 보여 줌
      const row = (label: string, value: string, need: boolean) =>
        `<tr class="${need ? 'need' : 'opt'}"><th>${label}</th><td>${value}</td><td><em>${need ? '필수' : '선택'}</em></td></tr>`;
      return `<div class="banner calm submit-guide">
        <div class="guide-main">
          <h2 class="guide-title"><span class="when-open">${glyph('scroll-unfurled')} 항해 명령서 작성 가이드</span><span class="when-over">${glyph('hourglass')} 제출 시간 종료! 밀서를 제출하세요</span></h2>
          <div class="big-timer" data-timer></div>
          <div class="oracle">
            <span class="oracle-eye" aria-hidden="true">${glyph('all-seeing-eye')}</span>
            <div><b>${SCOUT_NAME}</b>를 쓰려면 <b>지금</b> 진행자에게 오세요!<small>해역 1곳의 남은 생명력을 우리 함대만 확인</small></div>
            <span class="oracle-cost">${SCOUT_COST}해리 후퇴</span>
          </div>
          <p class="muted">${done}/${pub.order.length}함대 입력 완료</p>
        </div>
        <div class="guide-example">
          <div class="scroll">
            <div class="scroll-head">항해 명령서</div>
            <table class="scroll-form">
              ${row('함대명', 'A 함대', true)}
              ${row('선택 해역', '2번 해역', true)}
              ${row('제출 무기', `${CARDS.basic.name} (기본)`, true)}
              ${row('순풍 아이템', '1번째', false)}
              ${row('추가 무기', '특수 무기명 · 3번 해역', false)}
            </table>
          </div>
          <p class="muted small">순풍·추가 무기는 쓸 때만 적어요</p>
        </div>
      </div>`;
    }
    case 'reveal': {
      // 구조선 배너는 이벤트가 열린 그날 공개 단계에만 (8일차부터는 평소 사건 배너)
      if (pub.rescue && pub.round === RESCUE_ROUND) return rescueBanner();
      const e = latestEvent();
      if (!e) return '';
      const d = describeEvent(e);
      if (!isDeal(e) && e.kind !== 'steal') return `<div class="banner pop ${d.tone ?? ''}" data-key="${pub.revealed}"><div class="banner-icon">${bannerIcon(d.icon)}</div><h2>${glyphText(d.title)}</h2>${d.detail ? `<p>${glyphText(d.detail)}</p>` : ''}</div>`;
      // 돌파: 알약·배지 없이 글자 굵기·색으로만 위계 (함대 금색 굵게 | 문장 흰색 | 보상 연회색)
      const team = e.team ? teamName(e.team) : '';
      const head = team && d.title.startsWith(`${team}, `) ? d.title.slice(team.length + 2) : d.title;
      const detail = [d.detail, e.loot && !d.detail?.includes(`${CARDS[e.loot].short} 획득`) ? `${CARDS[e.loot].short} 획득` : ''].filter(Boolean).join(' · ');
      return `<div class="banner pop deal${e.kind === 'steal' ? ' steal' : ''}" data-key="${pub.revealed}">
        <div class="banner-icon">${glyph('laurel-crown')}</div>
        <h2>${team ? `<b class="team-name">${esc(team)}</b><span class="sep">|</span>` : ''}${glyphText(head)}</h2>
        ${detail ? `<p class="deal-detail">${glyphText(detail)}</p>` : ''}</div>`;
    }
    default:
      return '';
  }
}

/** 사건 배너 아이콘: OS 이모지 대신 단색 아이콘 (없는 것은 그대로) */
const BANNER_GLYPH: Record<string, string> = { '⚔️': 'crossed-swords', '🌙': 'moon', '🚫': 'cancel', '💤': 'sleepy', '🌬️': 'wind-slap', '👑': 'crown' };
function bannerIcon(icon: string): string {
  const card = (Object.keys(CARDS) as CardId[]).find((id) => CARDS[id].icon === icon);
  return card ? cardGlyph(card) : BANNER_GLYPH[icon] ? glyph(BANNER_GLYPH[icon]) : icon;
}

/** 문장 속 무기 이모지를 단색 아이콘으로 바꿔서 (esc 한 뒤) */
function glyphText(text: string): string {
  let html = esc(text);
  for (const id of Object.keys(CARDS) as CardId[]) html = html.split(CARDS[id].icon).join(cardGlyph(id, 'inline'));
  return html;
}

function seatLook() {
  const { pub } = eng();
  const status: Partial<Record<TeamId, string>> = {};
  if (pub.stage === 'submit') for (const t of pub.order) status[t] = game.subs[t]?.table ? `${glyph('check-mark')} 입력 완료` : `${glyph('hourglass')} 대기`;
  const e = latestEvent();
  const prevScores = pub.stage === 'reveal' ? pub.events[pub.revealed - 2]?.scores : undefined;
  // 스핑크스 퀴즈 중·뒤에는 퀴즈 보상을 전진으로 표시
  if (quizToday()) return { status, deltas: quizRewards(), goal: showGoal() };
  const deltas = e && prevScores ? Object.fromEntries(pub.teamIds.map((t) => [t, (e.scores[t] ?? 0) - (prevScores[t] ?? 0)])) : {};
  return { status, deltas, active: e?.team, goal: showGoal(), arrive: arrivedTeams() };
}

function gameView(): string {
  const { pub } = eng();
  if (pub.stage === 'final') return topbar() + finalView();
  const snap = snapshot(pub);
  const looks = tableLooks();
  const shown = visibleTables();
  const tables = shown.map((i) => feltTable(snap.tables[i], i, looks[i])).join('');
  if (isConsole) return topbar() + dock() + secretPanel();
  return `${topbar()}
    <div class="arena">
      <section class="felt">
        <div class="felt-tables" style="--cols:${shown.length}">${tables}</div>
        ${banner()}
      </section>
      <aside class="rail">${deck(eventQueue())}</aside>
    </div>
    ${seaMap(pub.order, quizToday() ? quizScores() : snap.scores, seatLook())}
    ${showDock() ? dock() : ''}`;
}

/** 공개 연출 중에는 대기열도 그 사건 시점으로 (아직 공개 안 된 합의가 드러나지 않게) */
function eventQueue(): number {
  const { pub } = eng();
  let q = pub.queue;
  // 아직 공개되지 않은 사건 중 1~3번 해역 돌파 수만큼 되돌림. 돌파 발표 중인 사건도 새 역경이 아직 안 들어왔으니 포함
  const from = pub.stage === 'reveal' ? Math.max(0, pub.revealed - 1) : pub.revealed;
  for (const e of pub.events.slice(from)) if (isDeal(e) && e.table && e.table <= 3) q -= 1;
  return Math.max(0, q);
}

/* ───────── 조작 패널 ───────── */

function dock(): string {
  const { pub } = eng();
  let main = '';
  switch (pub.stage) {
    case 'order':
      main = finalPending()
        ? `<button class="wide" data-action="final-open">${glyph('big-wave')} 해역 공개 ▶</button>`
        : `<button class="wide" data-action="submit">${glyph('quill-ink')} 제출 받기 시작 (${SUBMIT_SECONDS / 60}분) ▶</button>`;
      break;
    case 'submit': {
      const done = pub.order.filter((t) => game.subs[t]?.table).length;
      main = `${inputPanel()}
        <button class="wide" data-action="resolve">${glyph('crossed-swords')} 공격 공개 ▶${done < pub.order.length ? ` <span class="small">(미입력 ${pub.order.length - done}함대는 쉼)</span>` : ''}</button>`;
      break;
    }
    case 'reveal': {
      const left = pub.events.length - pub.revealed;
      const next = pub.round + 1;
      main =
        left > 0
          ? `<div class="row"><button class="wide" data-action="reveal">다음 공개 ▶ <span class="small">(${left})</span></button>
             <button class="secondary narrow" data-action="reveal-all">모두 공개</button></div>`
          : isPractice() && pub.round >= PRACTICE_DAYS
            ? `<button class="wide" data-action="practice-end">${glyph('checkered-flag')} 연습 끝 · 실제 항해 준비하기</button>`
            : isPractice()
            ? `<button class="wide" data-action="next-round">${glyph('rolling-dices')} 연습 ${next}일차 출항 ▶</button>`
            : canOpenRescue(eng())
            ? `<button class="wide" data-action="rescue-open">${glyph('greek-sphinx')} 특별 이벤트: 스핑크스 등장 ▶</button>`
            : pub.rescue?.phase === 'offer'
            ? rescueControls()
            : pub.round < ROUNDS
            ? `<button class="wide" data-action="next-round">${next}일차 출항 ▶</button>`
            : `<button class="wide" data-action="finish">${glyph('laurels-trophy')} 최종 결과 발표</button>`;
      break;
    }
  }
  return `<section class="dock card">${main}<p class="muted small keys">Space·→ : 다음 진행 · Ctrl+Z : 되돌리기</p>${scoutModal()}</section>`;
}

function inputPanel(): string {
  const { pub } = eng();
  if (!isConsole && !inputOpen) {
    return `<div class="input-closed">
      <span>${glyph('invisible')} 제출 내용은 가려져 있어요.</span>
      <button class="secondary narrow" data-action="input-toggle">입력 패널 열기</button>
      <span class="muted small">노트북을 따로 보고 싶으면 위의 '진행자 창'을 쓰세요.</span>
    </div>`;
  }
  const rows = pub.order.map((t, pos) => inputRow(t, pos)).join('');
  const close = isConsole ? '' : `<button class="secondary narrow" data-action="input-toggle">${glyph('invisible')} 입력 패널 닫기</button>`;
  return `<div class="input-panel"><div class="input-head"><h3>포스트잇 입력</h3>${close}</div>${rows}</div>`;
}

function inputRow(t: TeamId, pos: number): string {
  const { pub } = eng();
  const sub = game.subs[t];
  const hand = eng().hands[t];
  const score = pub.teams[t]?.score ?? 0;
  const btn = (action: string, value: string | number, label: string, on: boolean, enabled = true) =>
    `<button class="pill${on ? ' on' : ''}" data-action="${action}" data-team="${t}" data-value="${value}" ${enabled ? '' : 'disabled'}>${label}</button>`;
  const shown = visibleTables();
  const tableBtns = shown
    .map((i) => btn('sub-table', i + 1, `${i + 1}번 <small>${shortTitle(pub.tables[i].agenda)}</small>`, sub?.table === i + 1, pub.tables[i].agenda > 0))
    .join('');
  const mainCards: CardId[] = ['basic', 'blitz', 'practice'];
  const cards = mainCards
    .map((c) => {
      const n = c === 'basic' ? Infinity : (hand?.[c] ?? 0);
      const label = `${cardGlyph(c)} ${CARDS[c].short}${c === 'basic' ? '' : ` ×${n}`}`;
      return btn('sub-card', c, label, (sub?.card ?? 'basic') === c && !!sub?.table, n > 0);
    })
    .join('');
  // 추가 카드(전갈 화살·쇠사슬)는 공격 무기와 함께 1장
  const extra = sub?.extra;
  const extras = [
    btn('sub-extra', '', '안 함', !extra),
    ...EXTRA_CARDS.map((c) => btn('sub-extra', c, `${cardGlyph(c)} ${CARDS[c].short} ×${hand?.[c] ?? 0}`, extra?.card === c, (hand?.[c] ?? 0) > 0)),
  ].join('');
  const extraTables = extra
    ? `<div class="in-group"><span class="in-label">추가 카드 해역</span>${shown
        .map((i) => btn('sub-extra-table', i + 1, `${i + 1}번 <small>${shortTitle(pub.tables[i].agenda)}</small>`, extra.table === i + 1, pub.tables[i].agenda > 0))
        .join('')}</div>`
    : '';
  const cuts = [
    btn('sub-cut', 0, '안 함', !sub?.cutIn),
    ...pub.order.map((_, i) => btn('sub-cut', i + 1, `${i + 1}번째`, sub?.cutIn === i + 1, score >= CUT_IN_COST)),
  ].join('');
  const scouts = shown.map((i) => btn('scout', i + 1, `${i + 1}번`, false, pub.tables[i].agenda > 0 && score >= SCOUT_COST)).join('');
  const extraText = extra ? ` · + ${CARDS[extra.card].short} ${extra.table ? `${extra.table}번` : '(해역 선택!)'}` : '';
  const state = sub?.table ? `${glyph('check-mark')} ${sub.table}번 · ${CARDS[sub.card].short}${extraText}${sub.cutIn ? ` · 순풍 ${sub.cutIn}번째` : ''}` : `${glyph('hourglass')} 미입력 (쉼)`;
  return `<div class="in-row${sub?.table ? ' done' : ''}">
    <div class="in-team"><b>${pos + 1}. ${esc(teamName(t))}</b><span>${glyph('compass')} ${distanceOf(score)}해리</span><span class="in-state">${state}</span>
      ${sub ? `<button class="pill ghost" data-action="sub-clear" data-team="${t}">지우기</button>` : ''}</div>
    <div class="in-group"><span class="in-label">해역</span>${tableBtns}</div>
    <div class="in-group"><span class="in-label">무기</span>${cards}</div>
    <div class="in-group"><span class="in-label">추가 카드</span>${extras}</div>
    ${extraTables || '<div></div>'}
    <div class="in-group"><span class="in-label">${glyph('wind-slap')} 순풍 +${CUT_IN_COST}해리</span>${cuts}</div>
    <div class="in-group"><span class="in-label">${glyph('all-seeing-eye')} 예지 +${SCOUT_COST}해리</span>${scouts}</div>
  </div>`;
}

function scoutModal(): string {
  if (!scoutShown) return '';
  const s = scoutShown;
  return `<div class="modal-back"><div class="modal" data-peek-box>
    <h2>${glyph('all-seeing-eye')} ${esc(teamName(s.team))} ${SCOUT_NAME}</h2>
    <p>${s.table}번 해역 · ${esc(agendaTitle(s.agenda))} · 남은 생명력</p>
    <div class="scout-num"><span class="masked">?</span><strong>${s.remaining}</strong></div>
    <p class="muted">${glyph('megaphone')} 함대 대표가 직접 <b>누르고 있는 동안</b>만 숫자가 보여요. 손을 떼면 다시 가려져요.</p>
    <button class="secondary peek-btn" data-peek>${glyph('all-seeing-eye')} 누르고 있기</button>
    <button data-action="scout-close">닫기</button>
  </div></div>`;
}

/** 진행자 창 전용: 남은 생명력, 보유 무기, 함대별 결과 기록 */
function secretPanel(): string {
  const s = eng();
  const tables = visibleTables()
    .map((i) => {
      const t = s.pub.tables[i];
      if (!t.agenda) return `<li><b>${i + 1}번</b> ${esc(agendaTitle(t.agenda))} <strong class="secret-num">-</strong></li>`;
      const hits = (s.secret.trail?.[i] ?? []).map((h) => `${esc(teamName(h.team))} −${h.amount}`).join(', ');
      return `<li><b>${i + 1}번</b> ${esc(agendaTitle(t.agenda))} <strong class="secret-num">${s.secret.remaining[i]} / ${hpOf(t.agenda)}</strong>${hits ? `<br><span class="muted small">${hits}</span>` : ''}</li>`;
    })
    .join('');
  const hands = s.pub.teamIds
    .map((t) => {
      const h = s.hands[t];
      const cards = h ? (Object.keys(h) as (keyof typeof h)[]).filter((c) => h[c] > 0).map((c) => `${CARDS[c].short} ${h[c]}`) : [];
      return `<li><b>${esc(teamName(t))}</b> ${cards.length ? cards.join(' · ') : `<span class="muted">${CARDS.basic.name}만</span>`}</li>`;
    })
    .join('');
  const practice = s.secret.practice.map((p) => `${esc(teamName(p.team))} → ${p.table}번`).join(', ');
  const log = game.log
    .slice(-30)
    .reverse()
    .map((l) => `<li><span class="muted">R${l.round}</span> <b>${esc(teamName(l.team))}</b> ${glyphText(l.text)}</li>`)
    .join('');
  return `<section class="secret card">
    <div><h3>남은 / 처음 생명력</h3><ul class="plain">${tables}</ul>${practice ? `<p class="muted small">내일 날아갈 투척 창: ${practice}</p>` : ''}</div>
    <div><h3>보유 특수 무기</h3><ul class="plain">${hands}</ul></div>
    <div class="log"><h3>함대별 결과 (함대에게 알려 주세요)</h3><ul class="plain">${log || '<li class="muted">아직 없어요</li>'}</ul></div>
  </section>`;
}

function finalView(): string {
  return game.creditsShown ? credits() : game.agendasShown ? agendaReveal() : game.rankShown ? rankView() : finale();
}

/** 최종 피날레: 이타카의 왕좌 복위식. 어두운 화면이 황금빛 오라로 바뀌며 우승 함대 발표 */
function finale(): string {
  const { pub } = eng();
  const winners = ranking(pub).filter((r) => r.rank === 1);
  const names = winners.map((w) => esc(teamName(w.team))).join(' · ');
  const best = winners[0] ? distanceOf(winners[0].score) : START_DISTANCE;
  const home = best <= 0;
  const where = best < 0 ? '이타카 내륙 안착' : best === 0 ? '이타카 항구 도착' : '고국을 눈앞에 둠';
  const stats = winners
    .map((w) => {
      // 최종 결전을 돌파했으면 맨 앞에
      const slain = pub.tables.flatMap((t) => t.done ?? []).filter((d) => d.team === w.team).map((d) => d.agenda)
        .sort((a, b) => Number(b === FINAL_AGENDA) - Number(a === FINAL_AGENDA));
      const titles = slain.slice(0, 3).map((id) => esc(AGENDAS[id].title)).join(', ');
      const gates = slain.length ? `${titles}${slain.length > 3 ? ' 등' : ''} 총 <b>${slain.length}개</b> 관문 돌파` : '돌파한 관문 없이 끝까지 항해';
      return `${winners.length > 1 ? `<li class="finale-who">${esc(teamName(w.team))}</li>` : ''}
        <li>${glyph('greek-temple', 'inline')} 최종 도달 거리 : <b>[ ${distanceOf(w.score)}해리 (${where}) ]</b></li>
        <li>${glyph('crossed-swords', 'inline')} 극복한 관문 : ${gates}</li>`;
    })
    .join('');
  const dust = Array.from({ length: 40 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  const bursts = Array.from({ length: 6 }, (_, b) => `<span class="burst" style="--b:${b}">${Array.from({ length: 12 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</span>`).join('');
  return `<section class="finale">
    <div class="finale-aura" aria-hidden="true"></div>
    ${templeArt()}
    <div class="finale-dust" aria-hidden="true">${dust}</div>
    <div class="finale-bursts" aria-hidden="true">${bursts}</div>
    <div class="finale-card">
      ${laurel()}
      <p class="finale-kicker">${glyph('crown', 'inline')} [ ${home ? '고국 이타카 귀환 성공' : '고국 이타카를 눈앞에'} ]</p>
      <h1>"20년의 거친 바다를 헤치고 마침내 왕이 돌아왔다!"</h1>
      <div class="finale-winner">
        <p class="finale-title">${glyph('laurels-trophy', 'inline')} 최종 우승 : <b>[ ${names} ]</b></p>
        <p class="finale-quote">"왕좌를 위협하던 구혼자들을 물리치고,<br />사랑하는 가족의 품으로 돌아가 이타카의 왕좌를 되찾았습니다!"</p>
      </div>
      <ul class="finale-stats">${stats}</ul>
    </div>
    ${showDock() ? '<div class="row center-row finale-nav"><button class="narrow" data-action="rank">전체 순위 보기 ▶</button></div>' : ''}
  </section>`;
}

/** 피날레 배경: 바다 너머 고향 섬 위에 빛나는 신전 (라인 아트) */
function templeArt(): string {
  const cols = Array.from({ length: 6 }, (_, k) => `<rect x="${121 + k * 13}" y="62" width="6" height="34" rx="1"/>`).join('');
  return `<svg class="finale-temple" viewBox="0 0 320 140" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <path class="isle" d="M0 140 L0 118 Q60 108 100 100 Q160 90 220 100 Q270 108 320 118 L320 140Z"/>
    <g class="temple">
      <path d="M112 60 L160 38 L208 60Z"/>
      <rect x="112" y="58" width="96" height="5"/>
      ${cols}
      <rect x="108" y="96" width="104" height="4"/>
      <rect x="104" y="100" width="112" height="4"/>
    </g>
    <path class="sea-line" d="M0 126 Q20 122 40 126 T80 126 T120 126 T160 126 T200 126 T240 126 T280 126 T320 126"/>
    <path class="sea-line" d="M0 134 Q20 130 40 134 T80 134 T120 134 T160 134 T200 134 T240 134 T280 134 T320 134"/>
  </svg>`;
}

function rankView(): string {
  const rows = ranking(eng().pub);
  const winners = rows.filter((r) => r.rank === 1);
  const list = rows
    .map((r) => `<li class="rank-${r.rank}"><span class="rank">${r.rank === 1 ? glyph('laurel-crown') : ''}${r.rank}위</span><span class="name">${esc(teamName(r.team))}</span><span class="score">${distanceLabel(distanceOf(r.score))}</span><span class="muted">돌파 ${r.deals}회${eng().pub.rescue?.rewards?.[r.team] ? ` · ${glyph('greek-sphinx', 'inline')}스핑크스 +${eng().pub.rescue!.rewards![r.team]}해리` : ''}</span></li>`)
    .join('');
  const best = winners[0] ? distanceOf(winners[0].score) : START_DISTANCE;
  const where = best <= 0 ? `고국 이타카에 도착해 내륙 ${-best}해리까지 들어간` : `고국까지 ${best}해리를 남긴`;
  return `<section class="final-board">
    <div class="confetti">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    <h1>${glyph('laurels-trophy', 'title-glyph')}최종 결과 · 고국과의 거리</h1>
    ${seaMap(rows.map((r) => r.team), Object.fromEntries(rows.map((r) => [r.team, r.score])), { key: 'final', goal: true, arrive: arrivedTeams() })}
    <ol class="podium">${list}</ol>
    <blockquote class="closing">
      "${ROUNDS}일간의 험난한 항해가 모두 끝났습니다! 오늘 가장 먼저 귀환한 함대는 ${where}
      ${winners.map((w) => esc(teamName(w.team))).join(', ')}입니다! 축하드립니다!<br />
      이번 항해에서는 역경의 남은 생명력을 가늠하고 마지막 일격을 넣는 타이밍이 핵심이었습니다.
      실제 교섭에서도 큰 역경을 함께 깎아 내는 끈기와, 제시안을 내는 '타이밍 전략'이 성공적인 타결을 만든다는 점을 기억해 주시기 바랍니다!"
    </blockquote>
    ${showDock() ? '<div class="row center-row"><button class="secondary narrow" data-action="rank">◀ 왕좌 복위식</button><button class="narrow" data-action="final-tab">항해 일지 보기 ▶</button></div>' : ''}
  </section>`;
}

/** 항해 일지: 모든 역경의 생명력·공격 이력·돌파한 함대 (게임이 끝난 뒤라 비공개였던 이력도 공개) */
function agendaReveal(): string {
  const { pub, secret } = eng();
  const dealtBy = new Map(pub.tables.flatMap((t) => t.done ?? []).map((d) => [d.agenda, d.team]));
  const slainTrail = new Map((secret.history ?? []).map((h) => [h.agenda, h.trail]));
  // 끝까지 버틴 역경은 해역에 남은 이력
  const aliveTrail = new Map(pub.tables.map((t, i) => [t.agenda, secret.trail?.[i] ?? []]));
  const { tables, queue } = activeSetup();
  const cards = [...tables, ...queue, FINAL_AGENDA].map((id, i) => {
    const a = AGENDAS[id];
    const team = dealtBy.get(id);
    const trail = slainTrail.get(id) ?? aliveTrail.get(id);
    const hits = (trail ?? [])
      .map((h, k, all) => `<li class="${team && k === all.length - 1 ? 'last' : ''}">${esc(teamName(h.team))} ${cardGlyph(h.card, 'inline')}<b>−${h.amount}</b></li>`)
      .join('');
    const result = team ? `${glyph('crossed-swords', 'inline')} <b>${esc(teamName(team))}</b> 돌파` : trail ? '살아남음' : '등장하지 않음';
    return `<li class="reveal-card${team ? '' : ' alive'}" style="--i:${i}">
      <div class="reveal-head"><span class="pictogram">${agendaGlyph(id)}</span><b>${esc(a.title)}</b><span class="reveal-hp">생명력 ${hpOf(id)}</span></div>
      ${hits ? `<ol class="reveal-trail">${hits}</ol>` : '<p class="reveal-trail none">공격 없음</p>'}
      <div class="reveal-result">${result}</div>
    </li>`;
  }).join('');
  return `<section class="agenda-reveal">
    <h1>${glyph('treasure-map', 'title-glyph')}항해 일지 · 역경별 공격 기록</h1>
    <ol class="reveal-grid" style="--rows:${Math.ceil((tables.length + queue.length + 1) / 2)}">${cards}</ol>
    <blockquote class="closing lesson">
      혼자서는 쓰러뜨릴 수 없는 <b>거대한 역경</b>도, 여러 함대가 조금씩 깎아 두면 결국 쓰러집니다.<br />
      남은 힘을 읽고 <b>마지막 일격의 타이밍</b>을 잡는 것, 그것이 교섭의 기술입니다.
    </blockquote>
    ${showDock() ? '<div class="row center-row"><button class="secondary narrow" data-action="final-tab">◀ 순위 보기</button><button class="narrow" data-action="credits">엔딩 크레딧 ▶</button></div>' : ''}
  </section>`;
}

/** 마지막 페이지: 영화처럼 아래에서 위로 올라가는 엔딩 크레딧 */
const CREDITS: [string, string[]][] = [
  ['PROJECT LEADERS', ['Original Concept Brought By<b>이주영 매니저</b>', 'Odyssey Universe Created By<b>정현목 매니저</b>']],
  ['WORLD BUILDING & GAME DESIGN', ['Storyline & Game Simulation By<b>이주영 매니저</b>', 'Event & Feature Developed By<b>이주영 매니저 & 정현목 매니저</b>']],
  ['PRESENTATION & PRODUCTION', ['AI Design & Visualizing By<b>이주영 매니저</b>', 'Stage Layout & Game Balancing By<b>이주영 매니저</b>']],
  ['SPECIAL THANKS TO', ['<b>거친 바다를 헤치고 귀환에 성공한<br />모든 참가자 여러분</b>']],
];

function credits(): string {
  const groups = CREDITS.map(([head, lines]) => `<div class="credit-group"><h3>[ ${head} ]</h3>${lines.map((l) => `<p>${l}</p>`).join('')}</div>`).join('');
  return `<section class="credits">
    <div class="credits-roll">
      <div class="credits-mark">ENDING CREDITS</div>
      <h1>&lt; 오디세이아 : 귀환의 항해 &gt;</h1>
      ${groups}
      <div class="credits-end">${glyph('trireme')}</div>
    </div>
    ${showDock() ? '<div class="row center-row credits-nav"><button class="secondary narrow" data-action="credits">◀ 항해 일지</button><button class="secondary narrow" data-action="credits-replay">↻ 다시 재생</button>' + (isConsole ? '' : '<button class="secondary narrow" data-action="home">처음 화면</button>') + '</div>' : ''}
  </section>`;
}

/* ───────── 그리기 ───────── */

function draw() {
  // 튜토리얼 설명문은 A~E 함대 기준이라 이름 바꾸기를 적용하지 않음
  setTeamNames(mode === 'tutorial' ? {} : game.names);
  useSetup(game.engine?.setup);
  if (mode === 'tutorial') return render(app, tutorialView());
  if (mode === 'home' || !game.engine) {
    if (isConsole) return render(app, `<section class="card center"><h2>${glyph('laptop')} 진행자 창</h2><p>프로젝터 화면에서 출항하면 여기에 입력 패널이 나와요.</p></section>`);
    return render(app, homeView());
  }
  render(app, gameView());
  tickTimer();
}

function tickTimer() {
  const pub = game.engine?.pub;
  for (const el of app.querySelectorAll<HTMLElement>('[data-timer]')) {
    if (mode !== 'game' || pub?.stage !== 'submit') {
      el.textContent = '';
      continue;
    }
    const left = pub.deadline - Date.now();
    el.innerHTML = left > 0 ? `${glyph('sands-of-time')} ${formatTimer(left)}` : `${glyph('hourglass')} 시간 종료`;
    el.classList.toggle('over', left <= 0);
    el.closest('.submit-guide')?.classList.toggle('over', left <= 0);
  }
  // 스핑크스 생각 시간
  const quiz = pub?.rescue?.timer;
  for (const el of app.querySelectorAll<HTMLElement>('[data-quiz-timer]')) {
    const left = quiz ? quiz.until - Date.now() : 0;
    el.textContent = left > 0 ? formatTimer(left) : '시간 종료!';
    el.closest('.quiz-timer')?.classList.toggle('over', left <= 0);
  }
}

/* ───────── 동작 ───────── */

/** 각 진행 버튼이 눌릴 수 있는 단계 (두 번 눌러도 한 번만 처리) */
const ALLOWED: Record<string, Stage[]> = {
  submit: ['order'],
  'final-open': ['order'],
  resolve: ['submit'],
  'sub-table': ['submit'],
  'sub-card': ['submit'],
  'sub-cut': ['submit'],
  'sub-extra': ['submit'],
  'sub-extra-table': ['submit'],
  'sub-clear': ['submit'],
  scout: ['submit'],
  reveal: ['reveal'],
  'reveal-all': ['reveal'],
  'next-round': ['reveal'],
  'practice-end': ['reveal'],
  'rescue-open': ['reveal'],
  'quiz-level': ['reveal'],
  'quiz-correct': ['reveal'],
  'quiz-settle': ['reveal'],
  'quiz-timer': ['reveal'],
  'rescue-skip': ['reveal'],
  finish: ['reveal'],
};

function setSub(team: TeamId, patch: Partial<Submission>) {
  const cur: Submission = game.subs[team] ?? { table: 0, card: 'basic', cutIn: 0 };
  save({ ...game, subs: { ...game.subs, [team]: { ...cur, ...patch } } });
}

function act(action: string, el: HTMLElement) {
  const team = el.dataset.team as TeamId;
  const value = el.dataset.value ?? '';
  if (ALLOWED[action] && (!game.engine || !ALLOWED[action].includes(stage()))) return;
  switch (action) {
    /* 처음 화면 */
    case 'toggle-team':
      picked.has(team) ? picked.delete(team) : picked.add(team);
      return draw();
    case 'resume':
      mode = 'game';
      return draw();
    case 'new-game': {
      if (game.engine && game.engine.pub.stage !== 'final' && !confirm('진행 중인 항해를 지우고 새로 출항할까요?')) return;
      const teams = TEAM_IDS.filter((t) => picked.has(t));
      // 출항할 때마다 구간 안에서 섞은 역경 배치
      const step = startRound(createGame(teams, shuffledSetup()));
      mode = 'game';
      inputOpen = false;
      return save({ ...emptyGame(game.names), engine: step.state, log: logNotes(step) });
    }
    case 'home':
      mode = 'home';
      return draw();

    /* 튜토리얼 */
    case 'tutorial':
      mode = 'tutorial';
      tutorialIndex = 0;
      return draw();
    case 'practice': {
      if (game.engine && !isPractice() && game.engine.pub.stage !== 'final' && !confirm('진행 중인 실제 항해를 지우고 연습 항해를 시작할까요?')) return;
      stopAutoplay();
      const teams = TEAM_IDS.filter((t) => picked.has(t));
      const step = startRound(createGame(teams.length ? teams : TEAM_IDS, practiceSetup()));
      mode = 'game';
      inputOpen = false;
      return save({ ...emptyGame(game.names), engine: step.state, log: logNotes(step) });
    }
    case 'practice-end':
      mode = 'home';
      return save(emptyGame(game.names));
    case 'tut-next':
      return goTutorial(tutorialIndex + 1);
    case 'tut-prev':
      return goTutorial(tutorialIndex - 1);
    case 'tut-go':
      return goTutorial(Number(el.dataset.index));
    case 'tut-auto':
      if (autoplay) stopAutoplay();
      else {
        if (tutorialIndex === steps.length - 1) tutorialIndex = 0;
        autoplay = window.setInterval(() => goTutorial(tutorialIndex + 1), 5000);
      }
      return draw();
    case 'tut-exit':
      stopAutoplay();
      mode = game.engine ? 'game' : 'home';
      return draw();

    /* 게임 진행 */
    case 'undo': {
      const prev = undo(game);
      if (!prev) return;
      scoutShown = null;
      return save(prev);
    }
    case 'open-console':
      window.open('?console', 'deal-console', 'width=1100,height=900');
      return;
    case 'input-toggle':
      inputOpen = !inputOpen;
      return draw();
    case 'final-open':
      return save(commit(game, { finalShown: true }));
    case 'submit':
      inputOpen = false;
      return save(commit(game, { engine: beginSubmit(eng(), Date.now()), subs: {} }));
    case 'sub-table':
      return setSub(team, { table: Number(value) });
    case 'sub-card':
      return setSub(team, { card: value as CardId });
    case 'sub-cut':
      return setSub(team, { cutIn: Number(value) });
    case 'sub-extra': {
      const cur = game.subs[team]?.extra;
      return setSub(team, { extra: value ? { card: value as ExtraCardId, table: cur?.table ?? 0 } : undefined });
    }
    case 'sub-extra-table': {
      const cur = game.subs[team]?.extra;
      if (!cur) return;
      return setSub(team, { extra: { ...cur, table: Number(value) } });
    }
    case 'sub-clear': {
      const { [team]: _, ...rest } = game.subs;
      return save({ ...game, subs: rest });
    }
    case 'scout': {
      const table = Number(value);
      if (!confirm(`${teamName(team)}: ${SCOUT_COST}해리 물러나서 ${table}번 해역의 남은 생명력을 확인할까요?`)) return;
      const { state, result } = scout(eng(), team, table);
      if (result.error) return toast(result.error);
      scoutShown = { ...result, team };
      const entry = { round: state.pub.round, team, text: `${SCOUT_NAME}: ${table}번 ${agendaTitle(result.agenda)} 남은 생명력 ${result.remaining}` };
      return save(commit(game, { engine: state, log: [...game.log, entry] }));
    }
    case 'scout-close':
      scoutShown = null;
      return draw();
    case 'resolve': {
      const n = eng().pub.order.length;
      const subs = Object.fromEntries(Object.entries(game.subs).filter(([, s]) => s?.table));
      const missing = n - Object.keys(subs).length;
      if (missing && !confirm(`${missing}함대가 입력되지 않았어요. 이 함대들은 오늘 쉬는 것으로 처리할까요?`)) return;
      const noTable = Object.entries(subs).filter(([, s]) => s?.extra && !s.extra.table).map(([t]) => teamName(t as TeamId));
      if (noTable.length && !confirm(`${noTable.join(', ')}의 추가 카드 해역이 비어 있어요. 추가 카드 없이 진행할까요?`)) return;
      inputOpen = false;
      scoutShown = null;
      const step = resolveRound(eng(), subs);
      return save(commit(game, { engine: step.state, subs: {}, log: [...game.log, ...logNotes(step)] }));
    }
    case 'reveal':
    case 'reveal-all':
      return save(commit(game, { engine: revealNext(eng(), action === 'reveal-all') }));
    case 'next-round': {
      if (eng().pub.revealed < eng().pub.events.length) return;
      // 구조선 이벤트를 마쳐야 다음 날로
      if (canOpenRescue(eng()) || eng().pub.rescue?.phase === 'offer') return;
      const step = startRound(eng());
      return save(commit(game, { engine: step.state, log: [...game.log, ...logNotes(step)] }));
    }
    case 'finish':
      return save(commit(game, { engine: finish(eng()), rankShown: false, agendasShown: false, creditsShown: false }));
    case 'rank':
      return save({ ...game, rankShown: !game.rankShown, agendasShown: false, creditsShown: false });
    case 'rescue-open':
      return save(commit(game, { engine: openRescue(eng()) }));
    case 'quiz-level': {
      if (!team) return;
      const level = el.dataset.value as QuizLevel;
      // 같은 난도를 다시 누르면 지움
      return save(commit(game, { engine: markQuiz(eng(), team, { level: eng().pub.rescue?.level?.[team] === level ? null : level }) }));
    }
    case 'quiz-correct': {
      if (!team) return;
      const ok = el.dataset.value === 'yes';
      return save(commit(game, { engine: markQuiz(eng(), team, { correct: eng().pub.rescue?.correct?.[team] === ok ? null : ok }) }));
    }
    case 'quiz-timer':
      if (!team) return;
      return save(commit(game, { engine: startQuizTimer(eng(), el.dataset.value === 'start' ? team : undefined, Date.now()) }));
    case 'quiz-settle':
      return save(commit(game, { engine: settleRescue(eng()) }));
    case 'rescue-skip':
      if (!confirm('스핑크스 이벤트를 건너뛸까요? (아무도 전진하지 않음)')) return;
      return save(commit(game, { engine: settleRescue(eng(), true) }));
    case 'final-tab':
      return save({ ...game, agendasShown: !game.agendasShown, creditsShown: false });
    case 'credits':
      return save({ ...game, agendasShown: true, creditsShown: !game.creditsShown });
    case 'credits-replay': {
      // 애니메이션을 처음부터 다시: 크레딧 요소를 새로 그림
      const roll = app.querySelector<HTMLElement>('.credits-roll');
      if (roll) {
        roll.style.animation = 'none';
        void roll.offsetHeight;
        roll.style.animation = '';
      }
      return;
    }
  }
}

/** Space·→ 로 누를 '다음' 버튼 (제출 단계는 실수 방지를 위해 직접 클릭) */
function primaryAction(): string | null {
  if (mode === 'tutorial') return 'tut-next';
  if (mode !== 'game' || !game.engine || !showDock()) return null;
  const { pub } = eng();
  if (pub.stage === 'order') return finalPending() ? 'final-open' : 'submit';
  if (pub.stage === 'final') return !game.rankShown ? 'rank' : !game.agendasShown ? 'final-tab' : !game.creditsShown ? 'credits' : null;
  if (pub.stage === 'reveal') {
    if (pub.revealed < pub.events.length) return 'reveal';
    if (isPractice()) return pub.round < PRACTICE_DAYS ? 'next-round' : null;
    if (canOpenRescue(eng())) return 'rescue-open';
    if (pub.rescue?.phase === 'offer') return null;
    return pub.round < ROUNDS ? 'next-round' : 'finish';
  }
  return null;
}

onAction(app, act);

app.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  const t = input.dataset.name as TeamId | undefined;
  if (!t) return;
  game = { ...game, names: { ...game.names, [t]: input.value } };
  setTeamNames(game.names);
  saveGame(game);
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, textarea') || e.repeat) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (mode === 'game' && showDock()) act('undo', app);
    return;
  }
  if (mode === 'tutorial' && (e.key === 'ArrowLeft' || e.key === 'PageUp')) return goTutorial(tutorialIndex - 1);
  if (mode === 'tutorial' && e.key === 'Escape') return act('tut-exit', app);
  if (scoutShown && e.key === 'Escape') return act('scout-close', app);
  if (![' ', 'ArrowRight', 'PageDown'].includes(e.key)) return;
  if (scoutShown) return;
  const action = primaryAction();
  if (!action) return;
  e.preventDefault();
  if (mode === 'tutorial' && tutorialIndex === steps.length - 1) return;
  act(action, app);
});

// 스카우터 숫자: 누르고 있는 동안만 보이기
const peek = (on: boolean) => app.querySelector('[data-peek-box]')?.classList.toggle('peek', on);
app.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('[data-peek]')) peek(true);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) app.addEventListener(ev, () => peek(false));

// 다른 창(진행자 창 ↔ 프로젝터 화면)에서 바뀐 내용 반영
onGameChange(() => {
  game = loadGame();
  setTeamNames(game.names);
  if (!game.engine && mode === 'game' && !isConsole) mode = 'home';
  draw();
});

let dockShown = showDock();
setInterval(() => {
  if (isConsole) beatConsole();
  else if (showDock() !== dockShown) {
    dockShown = showDock();
    draw();
  }
}, 1000);
if (isConsole) {
  beatConsole();
  window.addEventListener('pagehide', closeConsole);
}
setInterval(tickTimer, 250);

draw();
