/*
 * 현장 진행 화면: 프로젝터 한 화면을 모두가 보고, 게임 보조자가 손으로 걷은 제출 용지를 입력해 진행.
 * 서버 없이 이 브라우저에만 저장. ?console 로 열면 같은 PC 의 '진행자 창'(비공개 입력용)이 됨.
 */
import './style.css';
import './board.css';
import { AGENDAS, ALL_AGENDAS, CARDS, CUT_IN_COST, EXTRA_CARDS, FINAL_OPEN_ROUND, ROUNDS, SCOUT_COST, SCOUT_NAME, START_DISTANCE, START_SCORE, SUBMIT_SECONDS, TEAM_IDS, TIER_LABEL, distanceOf, type CardId, type ExtraCardId, type TeamId } from './deal/data';
import { agendaTitle, beginSubmit, createGame, finish, ranking, resolveRound, revealNext, scout, startRound, type EngineState } from './deal/engine';
import { deck, distanceLabel, feltTable, seaMap, trailStrip, type TableLook } from './deal/felt';
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
import { STAGE_LABEL, describeEvent, formatTimer, hpOf, setTeamNames, snapshot, teamName, useSetup } from './deal/view';
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
/** 연습 항해: 무작위 배치(setup)로 하루만 */
const isPractice = (): boolean => !!game.engine?.setup;
const stage = (): Stage => game.engine?.pub.stage ?? 'lobby';
/** 진행자 창이 따로 열려 있으면 프로젝터 화면에는 조작 버튼을 숨김 */
const showDock = () => isConsole || !consoleAlive();

/* ───────── 처음 화면 ───────── */

function homeView(): string {
  const rows = TEAM_IDS.map((t) => {
    const on = picked.has(t);
    return `<li class="pick${on ? ' on' : ''}">
      <button class="pick-toggle" data-action="toggle-team" data-team="${t}">${on ? '✅' : '⬜'} ${t}</button>
      <input data-name="${t}" value="${esc(game.names[t] ?? '')}" placeholder="${t}함대" maxlength="12" ${on ? '' : 'disabled'} />
    </li>`;
  }).join('');
  const resume = game.engine
    ? `<button class="secondary" data-action="resume">이어서 진행 <span class="small">(${game.engine.pub.stage === 'final' ? '최종 결과' : `${game.engine.pub.round}일차`})</span></button>`
    : '';
  return `<section class="home-board">
    <div class="hero">
      <div class="hero-chips">${['⛵', '🗡️', '🐉', '🧭'].map((c) => `<span>${c}</span>`).join('')}</div>
      <h1>오디세이아 : 귀환의 항해</h1>
      <p class="muted">${ROUNDS}일간의 항해 · 한 화면 현장 진행</p>
      <button class="tutorial-btn" data-action="tutorial">📖 항해 설명 보기</button>
      <button class="secondary practice-home" data-action="practice">🎲 바로 연습 항해 (하루, 무작위 역경)</button>
    </div>
    <div class="card setup">
      <h2>참가 함대</h2>
      <ul class="picks">${rows}</ul>
      <p class="muted small">함대 이름은 비워 두면 'A함대'처럼 표시돼요.</p>
      ${resume}
      <button data-action="new-game" ${picked.size ? '' : 'disabled'}>▶ 출항 (${picked.size}함대)</button>
    </div>
  </section>`;
}

/* ───────── 튜토리얼 ───────── */

function tutorialView(): string {
  const step = steps[tutorialIndex];
  const body = `<section class="slide"><h1>${esc(step.title)}</h1>${step.html}${step.sea ? exampleSea() : ''}</section>`;
  const dots = steps
    .map((_, i) => `<button class="dot-btn${i === tutorialIndex ? ' on' : ''}" data-action="tut-go" data-index="${i}" aria-label="${i + 1}번째 장면"></button>`)
    .join('');
  const last = tutorialIndex === steps.length - 1;
  return `<div class="tutorial">
    <header class="topbar">
      <div class="brand">📖 항해 설명</div>
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

/** 설명용 바다 지도: 고국에 가까운 순으로 늘어선 예시 */
function exampleSea(): string {
  const dist: Record<TeamId, number> = { A: -2, B: 3, C: 7, D: 10, E: 15 };
  const scores = Object.fromEntries(TEAM_IDS.map((t) => [t, START_DISTANCE + START_SCORE - dist[t]]));
  return `<div class="slide-sea">${seaMap([...TEAM_IDS], scores, { key: 'tutorial' })}</div>`;
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
const shortTitle = (id: number): string => (AGENDAS[id] ? `${AGENDAS[id].icon} ${AGENDAS[id].title}` : agendaTitle(id));

function roundText(): string {
  const { pub } = eng();
  if (isPractice()) return `🎲 연습 항해 · ${STAGE_LABEL[pub.stage]}`;
  return pub.stage === 'final' ? '최종 결과' : `${pub.round}일차/${ROUNDS} · ${STAGE_LABEL[pub.stage]}`;
}

function topbar(): string {
  const tools = showDock()
    ? `<div class="tools">
        <button class="small secondary" data-action="undo" ${game.history.length ? '' : 'disabled'} title="Ctrl+Z">↶ 되돌리기</button>
        ${isConsole ? '' : '<button class="small secondary" data-action="open-console" title="노트북 화면에 비공개 입력 창을 띄워요">🖥 진행자 창</button>'}
        ${isConsole ? '' : '<button class="small secondary" data-action="home">처음 화면</button>'}
      </div>`
    : '';
  return `<header class="topbar">
    <div class="brand">${isConsole ? '🖥 진행자 창' : '⛵ 오디세이아'}</div>
    <div class="round-pill">${roundText()}</div>
    <div class="timer" data-timer></div>
    ${tools}
  </header>`;
}

/** 공개 중인 마지막 사건 (공개 단계에서만) */
function latestEvent(): GameEvent | undefined {
  const { pub } = eng();
  return pub.stage === 'reveal' ? pub.events[pub.revealed - 1] : undefined;
}

function tableLooks(): TableLook[] {
  const { pub } = eng();
  const looks: TableLook[] = pub.tables.map(() => ({}));
  const shown = pub.stage === 'reveal' ? [pub.events[pub.revealed - 1]] : pub.stage === 'order' ? pub.events : [];
  for (const e of shown) {
    if (!e?.table) continue;
    const i = e.table - 1;
    if (e.kind === 'finalOpen') looks[i] = { fresh: true };
    else if (e.agenda && e.reward && e.team) looks[i] = { deal: { team: e.stolenBy ?? e.team, agenda: e.agenda, reward: e.reward }, fresh: true };
    else if (e.kind === 'proposal' && e.result === 'promo') looks[i] = { promo: true };
  }
  return looks;
}

function banner(): string {
  const { pub } = eng();
  const done = pub.teamIds.filter((t) => game.subs[t]?.table).length;
  switch (pub.stage) {
    case 'order': {
      const news = pub.events.map((e) => describeEvent(e)).map((d) => `<li>${d.icon} ${esc(d.title)}${d.detail ? ` <span class="muted">${esc(d.detail)}</span>` : ''}</li>`);
      const tie = pub.round === 1 ? '1일차 순서는 추첨!' : '고국에 가까운 함대부터. 같으면 지난 날 뒤 순번이 먼저.';
      return `<div class="banner calm"><h2>${pub.round}일차 순서 발표</h2><p>${pub.order.map((t) => esc(teamName(t))).join(' → ')}</p>
        ${news.length ? `<ul class="news">${news.join('')}</ul>` : ''}<p class="muted small">${tie}</p></div>`;
    }
    case 'submit':
      return `<div class="banner calm submit-guide">
        <div class="guide-main">
          <h2>📝 포스트잇에 적어 내세요</h2>
          <div class="big-timer" data-timer></div>
          <p class="scout-now">🔮 <b>${SCOUT_NAME}</b>를 쓰려면 <b>지금</b> 진행자에게 오세요! <span>(${SCOUT_COST}해리 후퇴, 해역 1곳의 남은 생명력)</span></p>
          <p class="muted">${done}/${pub.teamIds.length}함대 입력 완료</p>
        </div>
        <div class="guide-example">
          <div class="postit">
            <div class="postit-team">A함대</div>
            <div class="postit-line"><span>해역</span><b>2번</b></div>
            <div class="postit-line"><span>무기</span><b>${CARDS.basic.name}</b></div>
            <div class="postit-line opt"><span>순풍</span><b>1번째</b><em>(쓸 때만)</em></div>
            <div class="postit-line opt"><span>추가</span><b>무기명 3번</b><em>(가진 함대만)</em></div>
          </div>
          <p class="muted small">이렇게 적어 주세요</p>
        </div>
      </div>`;
    case 'reveal': {
      const e = latestEvent();
      if (!e) return '';
      const d = describeEvent(e);
      return `<div class="banner pop ${d.tone ?? ''}" data-key="${pub.revealed}"><div class="banner-icon">${d.icon}</div><h2>${esc(d.title)}</h2>${d.detail ? `<p>${esc(d.detail)}</p>` : ''}${trailStrip(e)}</div>`;
    }
    default:
      return '';
  }
}

function eventRail(): string {
  const { pub } = eng();
  if (pub.stage !== 'reveal') return '';
  const items = pub.events
    .slice(0, pub.revealed)
    .map((e) => describeEvent(e))
    .reverse()
    .map((d) => `<li class="${d.tone ?? ''}">${d.icon} ${esc(d.title)}${d.trail ? `<small>${esc(d.trail)}</small>` : ''}</li>`)
    .join('');
  return `<div class="rail-events"><h3>오늘의 항해</h3><ol>${items}</ol></div>`;
}

function seatLook() {
  const { pub } = eng();
  const status: Partial<Record<TeamId, string>> = {};
  if (pub.stage === 'submit') for (const t of pub.teamIds) status[t] = game.subs[t]?.table ? '✅ 입력 완료' : '⌛ 대기';
  const e = latestEvent();
  const prevScores = pub.stage === 'reveal' ? pub.events[pub.revealed - 2]?.scores : undefined;
  const deltas = e && prevScores ? Object.fromEntries(pub.teamIds.map((t) => [t, (e.scores[t] ?? 0) - (prevScores[t] ?? 0)])) : {};
  return { status, deltas, active: e?.team };
}

function gameView(): string {
  const { pub } = eng();
  if (pub.stage === 'final') return topbar() + finalView();
  const snap = snapshot(pub);
  const looks = tableLooks();
  const tables = snap.tables.map((t, i) => feltTable(t, i, pub.round, looks[i])).join('');
  if (isConsole) return topbar() + dock() + secretPanel();
  return `${topbar()}
    <div class="arena">
      <section class="felt">
        <div class="felt-tables">${tables}</div>
        ${banner()}
      </section>
      <aside class="rail">${deck(eventQueue())}${eventRail()}</aside>
    </div>
    ${seaMap(pub.order, snap.scores, seatLook())}
    ${showDock() ? dock() : ''}`;
}

/** 공개 연출 중에는 대기열도 그 사건 시점으로 (아직 공개 안 된 합의가 드러나지 않게) */
function eventQueue(): number {
  const { pub } = eng();
  let q = pub.queue;
  // 아직 공개되지 않은 사건 중 1~3번 해역 처치 수만큼 되돌림
  for (const e of pub.events.slice(pub.revealed)) if (e.agenda && e.reward && e.table && e.table <= 3) q -= 1;
  return Math.max(0, q);
}

/* ───────── 조작 패널 ───────── */

function dock(): string {
  const { pub } = eng();
  let main = '';
  switch (pub.stage) {
    case 'order':
      main = `<button class="wide" data-action="submit">📝 제출 받기 시작 (${SUBMIT_SECONDS / 60}분) ▶</button>`;
      break;
    case 'submit': {
      const done = pub.teamIds.filter((t) => game.subs[t]?.table).length;
      main = `${inputPanel()}
        <button class="wide" data-action="resolve">⚔️ 공격 공개 ▶${done < pub.teamIds.length ? ` <span class="small">(미입력 ${pub.teamIds.length - done}함대는 쉼)</span>` : ''}</button>`;
      break;
    }
    case 'reveal': {
      const left = pub.events.length - pub.revealed;
      const next = pub.round + 1;
      main =
        left > 0
          ? `<div class="row"><button class="wide" data-action="reveal">다음 공개 ▶ <span class="small">(${left})</span></button>
             <button class="secondary narrow" data-action="reveal-all">모두 공개</button></div>`
          : isPractice()
            ? '<button class="wide" data-action="practice-end">🏁 연습 끝 · 실제 항해 준비하기</button>'
            : pub.round < ROUNDS
            ? `<button class="wide" data-action="next-round">${next}일차 출항 ▶${next === FINAL_OPEN_ROUND ? ' 👑 최종 결전 개시!' : ''}</button>`
            : '<button class="wide" data-action="finish">🏆 최종 결과 발표</button>';
      break;
    }
  }
  return `<section class="dock card">${main}<p class="muted small keys">⌨ Space·→ : 다음 진행 · Ctrl+Z : 되돌리기</p>${scoutModal()}</section>`;
}

function inputPanel(): string {
  const { pub } = eng();
  if (!isConsole && !inputOpen) {
    return `<div class="input-closed">
      <span>🙈 제출 내용은 가려져 있어요.</span>
      <button class="secondary narrow" data-action="input-toggle">입력 패널 열기</button>
      <span class="muted small">노트북을 따로 보고 싶으면 위의 '🖥 진행자 창'을 쓰세요.</span>
    </div>`;
  }
  const rows = pub.order.map((t, pos) => inputRow(t, pos)).join('');
  const close = isConsole ? '' : '<button class="secondary narrow" data-action="input-toggle">🙈 입력 패널 닫기</button>';
  return `<div class="input-panel"><div class="input-head"><h3>포스트잇 입력</h3>${close}</div>${rows}</div>`;
}

function inputRow(t: TeamId, pos: number): string {
  const { pub } = eng();
  const sub = game.subs[t];
  const hand = eng().hands[t];
  const score = pub.teams[t]?.score ?? 0;
  const btn = (action: string, value: string | number, label: string, on: boolean, enabled = true) =>
    `<button class="pill${on ? ' on' : ''}" data-action="${action}" data-team="${t}" data-value="${value}" ${enabled ? '' : 'disabled'}>${label}</button>`;
  const tableBtns = pub.tables
    .map((tb, i) => btn('sub-table', i + 1, `${i + 1}번 <small>${esc(shortTitle(tb.agenda))}</small>`, sub?.table === i + 1, tb.agenda > 0))
    .join('');
  const mainCards: CardId[] = ['basic', 'blitz', 'practice'];
  const cards = mainCards
    .map((c) => {
      const n = c === 'basic' ? Infinity : (hand?.[c] ?? 0);
      const label = `${CARDS[c].name}${c === 'basic' ? '' : ` ×${n}`}`;
      return btn('sub-card', c, label, (sub?.card ?? 'basic') === c && !!sub?.table, n > 0);
    })
    .join('');
  // 추가 카드(쇠사슬·삼지창)는 공격 무기와 함께 1장
  const extra = sub?.extra;
  const extras = [
    btn('sub-extra', '', '안 함', !extra),
    ...EXTRA_CARDS.map((c) => btn('sub-extra', c, `${CARDS[c].name} ×${hand?.[c] ?? 0}`, extra?.card === c, (hand?.[c] ?? 0) > 0)),
  ].join('');
  const extraTables = extra
    ? `<div class="in-group"><span class="in-label">추가 카드 해역</span>${pub.tables
        .map((tb, i) => btn('sub-extra-table', i + 1, `${i + 1}번 <small>${esc(shortTitle(tb.agenda))}</small>`, extra.table === i + 1, tb.agenda > 0))
        .join('')}</div>`
    : '';
  const cuts = [
    btn('sub-cut', 0, '안 함', !sub?.cutIn),
    ...pub.order.map((_, i) => btn('sub-cut', i + 1, `${i + 1}번째`, sub?.cutIn === i + 1, score >= CUT_IN_COST)),
  ].join('');
  const scouts = pub.tables.map((tb, i) => btn('scout', i + 1, `${i + 1}번`, false, tb.agenda > 0 && score >= SCOUT_COST)).join('');
  const extraText = extra ? ` · + ${CARDS[extra.card].name} ${extra.table ? `${extra.table}번` : '(해역 선택!)'}` : '';
  const state = sub?.table ? `✅ ${sub.table}번 · ${CARDS[sub.card].name}${extraText}${sub.cutIn ? ` · 순풍 ${sub.cutIn}번째` : ''}` : '⌛ 미입력 (쉼)';
  return `<div class="in-row${sub?.table ? ' done' : ''}">
    <div class="in-team"><b>${pos + 1}. ${esc(teamName(t))}</b><span>🧭 ${distanceOf(score)}해리</span><span class="in-state">${state}</span>
      ${sub ? `<button class="pill ghost" data-action="sub-clear" data-team="${t}">지우기</button>` : ''}</div>
    <div class="in-group"><span class="in-label">해역</span>${tableBtns}</div>
    <div class="in-group"><span class="in-label">무기</span>${cards}</div>
    <div class="in-group"><span class="in-label">추가 카드</span>${extras}</div>
    ${extraTables || '<div></div>'}
    <div class="in-group"><span class="in-label">💨 순풍 +${CUT_IN_COST}해리</span>${cuts}</div>
    <div class="in-group"><span class="in-label">🔮 예지 +${SCOUT_COST}해리</span>${scouts}</div>
  </div>`;
}

function scoutModal(): string {
  if (!scoutShown) return '';
  const s = scoutShown;
  return `<div class="modal-back"><div class="modal" data-peek-box>
    <h2>🔮 ${esc(teamName(s.team))} ${SCOUT_NAME}</h2>
    <p>${s.table}번 해역 · ${esc(agendaTitle(s.agenda))} · 남은 생명력</p>
    <div class="scout-num"><span class="masked">?</span><strong>${s.remaining}</strong></div>
    <p class="muted">📢 함대 대표가 직접 <b>누르고 있는 동안</b>만 숫자가 보여요. 손을 떼면 다시 가려져요.</p>
    <button class="secondary peek-btn" data-peek>👁 누르고 있기</button>
    <button data-action="scout-close">닫기</button>
  </div></div>`;
}

/** 진행자 창 전용: 남은 생명력, 보유 무기, 함대별 결과 기록 */
function secretPanel(): string {
  const s = eng();
  const tables = s.pub.tables
    .map((t, i) => {
      if (!t.agenda) return `<li><b>${i + 1}번</b> ${esc(agendaTitle(t.agenda))} <strong class="secret-num">-</strong></li>`;
      const hits = (s.secret.trail?.[i] ?? []).map((h) => `${esc(teamName(h.team))} −${h.amount}`).join(', ');
      return `<li><b>${i + 1}번</b> ${esc(agendaTitle(t.agenda))} <strong class="secret-num">${s.secret.remaining[i]} / ${hpOf(t.agenda)}</strong>${hits ? `<br><span class="muted small">${hits}</span>` : ''}</li>`;
    })
    .join('');
  const hands = s.pub.teamIds
    .map((t) => {
      const h = s.hands[t];
      const cards = h ? (Object.keys(h) as (keyof typeof h)[]).filter((c) => h[c] > 0).map((c) => `${CARDS[c].name} ${h[c]}`) : [];
      return `<li><b>${esc(teamName(t))}</b> ${cards.length ? cards.join(' · ') : `<span class="muted">${CARDS.basic.name}만</span>`}</li>`;
    })
    .join('');
  const practice = s.secret.practice.map((p) => `${esc(teamName(p.team))} → ${p.table}번`).join(', ');
  const log = game.log
    .slice(-30)
    .reverse()
    .map((l) => `<li><span class="muted">R${l.round}</span> <b>${esc(teamName(l.team))}</b> ${esc(l.text)}</li>`)
    .join('');
  return `<section class="secret card">
    <div><h3>남은 / 처음 생명력</h3><ul class="plain">${tables}</ul>${practice ? `<p class="muted small">내일 날아갈 투척 창: ${practice}</p>` : ''}</div>
    <div><h3>보유 특수 무기</h3><ul class="plain">${hands}</ul></div>
    <div class="log"><h3>함대별 결과 (함대에게 알려 주세요)</h3><ul class="plain">${log || '<li class="muted">아직 없어요</li>'}</ul></div>
  </section>`;
}

function finalView(): string {
  return game.agendasShown ? agendaReveal() : rankView();
}

function rankView(): string {
  const rows = ranking(eng().pub);
  const winners = rows.filter((r) => r.rank === 1);
  const medal = ['🥇', '🥈', '🥉'];
  const list = rows
    .map((r) => `<li class="rank-${r.rank}"><span class="rank">${medal[r.rank - 1] ?? `${r.rank}위`}</span><span class="name">${esc(teamName(r.team))}</span><span class="score">${distanceLabel(distanceOf(r.score))}</span><span class="muted">처치 ${r.deals}회</span></li>`)
    .join('');
  const best = winners[0] ? distanceOf(winners[0].score) : START_DISTANCE;
  const where = best <= 0 ? `고국 이타카에 도착해 내륙 ${-best}해리까지 들어간` : `고국까지 ${best}해리를 남긴`;
  return `<section class="final-board">
    <div class="confetti">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    <h1>🏆 최종 결과 · 고국과의 거리</h1>
    ${seaMap(rows.map((r) => r.team), Object.fromEntries(rows.map((r) => [r.team, r.score])), { key: 'final' })}
    <ol class="podium">${list}</ol>
    <blockquote class="closing">
      "${ROUNDS}일간의 험난한 항해가 모두 끝났습니다! 오늘 가장 먼저 귀환한 함대는 ${where}
      ${winners.map((w) => esc(teamName(w.team))).join(', ')}입니다! 축하드립니다!<br />
      이번 항해에서는 역경의 남은 생명력을 가늠하고 마지막 일격을 넣는 타이밍이 핵심이었습니다.
      실제 교섭에서도 큰 역경을 함께 깎아 내는 끈기와, 제시안을 내는 '타이밍 전략'이 성공적인 타결을 만든다는 점을 기억해 주시기 바랍니다!"
    </blockquote>
    ${showDock() ? '<div class="row center-row"><button class="narrow" data-action="final-tab">🗺️ 항해 일지 보기 ▶</button></div>' : ''}
  </section>`;
}

/** 모든 역경의 생명력·실제 교섭 안건·처치한 함대 */
function agendaReveal(): string {
  const { pub } = eng();
  const dealtBy = new Map(pub.tables.flatMap((t) => t.done ?? []).map((d) => [d.agenda, d.team]));
  const cards = ALL_AGENDAS.map((id, i) => {
    const a = AGENDAS[id];
    const team = dealtBy.get(id);
    return `<li class="reveal-card tier-${a.tier}" style="--i:${i}">
      <div class="reveal-head"><span class="pictogram">${a.icon}</span><b>${esc(a.title)}</b></div>
      <div class="reveal-topic">${TIER_LABEL[a.tier]} · ${esc(a.topic)}</div>
      <div class="reveal-nums"><span><small>생명력</small><strong>${hpOf(id)}</strong></span></div>
      <div class="reveal-result">${team ? `⚔️ ${esc(teamName(team))} 처치` : '살아남음'}</div>
    </li>`;
  }).join('');
  return `<section class="agenda-reveal">
    <h1>🗺️ 항해 일지 · 역경 뒤의 교섭 안건</h1>
    <ol class="reveal-grid">${cards}</ol>
    <blockquote class="closing lesson">
      혼자서는 쓰러뜨릴 수 없는 <b>거대한 역경</b>도, 여러 함대가 조금씩 깎아 두면 결국 쓰러집니다.<br />
      남은 힘을 읽고 <b>마지막 일격의 타이밍</b>을 잡는 것, 그것이 교섭의 기술입니다.
    </blockquote>
    ${showDock() ? '<div class="row center-row"><button class="secondary narrow" data-action="final-tab">◀ 순위 보기</button>' + (isConsole ? '' : '<button class="secondary narrow" data-action="home">처음 화면</button>') + '</div>' : ''}
  </section>`;
}

/* ───────── 그리기 ───────── */

function draw() {
  // 튜토리얼 설명문은 A~E 함대 기준이라 이름 바꾸기를 적용하지 않음
  setTeamNames(mode === 'tutorial' ? {} : game.names);
  useSetup(game.engine?.setup);
  if (mode === 'tutorial') return render(app, tutorialView());
  if (mode === 'home' || !game.engine) {
    if (isConsole) return render(app, '<section class="card center"><h2>🖥 진행자 창</h2><p>프로젝터 화면에서 출항하면 여기에 입력 패널이 나와요.</p></section>');
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
    el.textContent = left > 0 ? `⏱ ${formatTimer(left)}` : '⏱ 시간 종료';
    el.classList.toggle('over', left <= 0);
  }
}

/* ───────── 동작 ───────── */

/** 각 진행 버튼이 눌릴 수 있는 단계 (두 번 눌러도 한 번만 처리) */
const ALLOWED: Record<string, Stage[]> = {
  submit: ['order'],
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
      const step = startRound(createGame(teams));
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
      const entry = { round: state.pub.round, team, text: `🔮 ${SCOUT_NAME}: ${table}번 ${agendaTitle(result.agenda)} 남은 생명력 ${result.remaining}` };
      return save(commit(game, { engine: state, log: [...game.log, entry] }));
    }
    case 'scout-close':
      scoutShown = null;
      return draw();
    case 'resolve': {
      const n = eng().pub.teamIds.length;
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
      const step = startRound(eng());
      return save(commit(game, { engine: step.state, log: [...game.log, ...logNotes(step)] }));
    }
    case 'finish':
      return save(commit(game, { engine: finish(eng()), agendasShown: false }));
    case 'final-tab':
      return save({ ...game, agendasShown: !game.agendasShown });
  }
}

/** Space·→ 로 누를 '다음' 버튼 (제출 단계는 실수 방지를 위해 직접 클릭) */
function primaryAction(): string | null {
  if (mode === 'tutorial') return 'tut-next';
  if (mode !== 'game' || !game.engine || !showDock()) return null;
  const { pub } = eng();
  if (pub.stage === 'order') return 'submit';
  if (pub.stage === 'final') return game.agendasShown ? null : 'final-tab';
  if (pub.stage === 'reveal') {
    if (pub.revealed < pub.events.length) return 'reveal';
    return isPractice() ? null : pub.round < ROUNDS ? 'next-round' : 'finish';
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
