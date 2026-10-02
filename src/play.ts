import './style.css';
import { AGENDAS, CARDS, CUT_IN_COST, ROUNDS, SCOUT_COST, SPECIAL_CARDS, TEAM_IDS, type CardId, type TeamId } from './deal/data';
import { agendaTitle, ranking } from './deal/engine';
import { claimTeam, normPrivate, normPub, releaseTeam, requestScout, submitProposal, type PrivateData, type TeamSlot } from './deal/sync';
import type { PublicState, Submission } from './deal/types';
import { formatTimer, rewardText, roundLabel, snapshot, teamName } from './deal/view';
import { signIn } from './firebase';
import { CODE_LENGTH, getHostId, normalizeCode, roomRef, serverNow, trackOnline, watch } from './room';
import { errorMessage, esc, keepScreenOn, onAction, render, showFatal, storage, toast } from './ui';

const app = document.querySelector<HTMLElement>('#app')!;
const ROOM_KEY = 'workshopgame:room';

interface Selection {
  table: number;
  card: CardId;
  cutIn: number;
  scout: number;
}

const state = {
  code: '',
  uid: '',
  teams: {} as Partial<Record<TeamId, TeamSlot>>,
  team: null as TeamId | null,
  pub: normPub(null),
  priv: normPrivate(null),
  sub: null as Submission | null,
  sel: { table: 0, card: 'basic', cutIn: 0, scout: 0 } as Selection,
  selKey: '',
};

/* ───────── 화면 ───────── */

function codeForm(message = ''): void {
  render(app, `<form class="card join-form">
    <h1>교섭의 도박사들</h1>
    <p class="muted">팀 대표만 접속하세요</p>
    <label>방 코드<input name="code" maxlength="${CODE_LENGTH}" autocapitalize="characters" autocomplete="off" required /></label>
    <button type="submit">다음</button>
    <p class="error" ${message ? '' : 'hidden'}>${esc(message)}</p>
  </form>`);
  app.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeCode(String(new FormData(e.target as HTMLFormElement).get('code')));
    history.replaceState(null, '', `?room=${code}`);
    void openRoom(code);
  });
}

function teamPicker(): string {
  const buttons = TEAM_IDS.map((t) => {
    const taken = Boolean(state.teams[t]?.repUid);
    return `<button class="team-pick" data-action="claim" data-team="${t}" ${taken ? 'disabled' : ''}>
      ${teamName(t)}<span class="small">${taken ? '대표 접속 중' : '선택'}</span></button>`;
  }).join('');
  return `<section class="card">
    <h1>우리 팀을 선택하세요</h1>
    <p class="muted">방 코드 ${state.code} · 팀당 대표 1명만 접속해요</p>
    <div class="team-grid">${buttons}</div>
  </section>`;
}

function myScore(pub: PublicState, team: TeamId): number {
  return snapshot(pub).scores[team] ?? 0;
}

function handView(priv: PrivateData): string {
  const cards = SPECIAL_CARDS.filter((c) => priv.hand[c] > 0)
    .map((c) => `<li><strong>${CARDS[c].name}</strong> ×${priv.hand[c]}<span class="muted small">${CARDS[c].desc}</span></li>`)
    .join('');
  return `<h3>보유 카드</h3><ul class="hand">
    <li><strong>${CARDS.basic.name}</strong> 영구<span class="muted small">${CARDS.basic.desc}</span></li>${cards}</ul>`;
}

function notesView(pub: PublicState, priv: PrivateData): string {
  const notes = priv.notes.filter(
    (n) => n.round === pub.round && (n.phase === 'start' || pub.stage !== 'reveal' || n.event < pub.revealed),
  );
  if (!notes.length) return '';
  return `<h3>우리 팀 결과</h3><ul class="notes">${notes.map((n) => `<li>${esc(n.text)}</li>`).join('')}</ul>`;
}

function submitView(pub: PublicState, team: TeamId): string {
  const { sel, sub, priv } = state;
  const score = myScore(pub, team);
  const open = snapshot(pub).tables.map((t, i) => ({ no: i + 1, agenda: t.agenda })).filter((t) => t.agenda);
  const choice = (action: string, value: string | number, on: boolean, label: string, disabled = false) =>
    `<button class="choice${on ? ' on' : ''}" data-action="${action}" data-value="${value}" ${disabled ? 'disabled' : ''}>${label}</button>`;

  const tables = open
    .map(({ no, agenda }) =>
      choice('pick-table', no, sel.table === no, `<b>${no}번</b> ${esc(agendaTitle(agenda))}<span class="small">처음 ${AGENDAS[agenda].demand} · ${rewardText(agenda)}</span>`),
    )
    .join('');
  const cards = (['basic', ...SPECIAL_CARDS] as CardId[])
    .filter((c) => c === 'basic' || priv.hand[c] > 0)
    .map((c) => {
      const lastRound = c === 'practice' && pub.round >= ROUNDS;
      const count = c === 'basic' ? '' : ` ×${priv.hand[c]}`;
      const desc = lastRound ? '마지막 라운드에는 쓸 수 없어요' : CARDS[c].desc;
      return choice('pick-card', c, sel.card === c, `<b>${CARDS[c].name}${count}</b><span class="small">${desc}</span>`, lastRound);
    })
    .join('');
  const positions = [0, ...pub.order.map((_, i) => i + 1)]
    .map((p) => choice('pick-cutin', p, sel.cutIn === p, p ? `${p}번째` : '안 함', p > 0 && score < CUT_IN_COST))
    .join('');
  const scoutButtons = open.map(({ no, agenda }) => choice('pick-scout', no, sel.scout === no, `${no}번 ${esc(agendaTitle(agenda))}`)).join('');
  const scouts = priv.scouts
    .filter((s) => s.round === pub.round)
    .reverse()
    .map((s) => `<li>${s.error ? `⚠️ ${esc(s.error)}` : `🔍 ${s.table}번 ${esc(agendaTitle(s.agenda))}: 남은 요구 수치 <b>${s.remaining}</b>`}</li>`)
    .join('');
  const submitted = sub
    ? `<p class="ok">✅ 제출됨: ${sub.table}번 테이블 · ${CARDS[sub.card]?.name ?? ''}${sub.cutIn ? ` · 새치기 ${sub.cutIn}번째` : ''}</p>`
    : '';

  return `<div class="timer small-timer" data-timer></div>
    <section class="card">
      <h3>① 테이블 선택</h3><div class="choices">${tables}</div>
      <h3>② 카드 선택</h3><div class="choices">${cards}</div>
      <h3>③ 새치기 <span class="muted small">(선택 · 주도권 −${CUT_IN_COST})</span></h3><div class="choices row">${positions}</div>
      <button data-action="submit" ${sel.table ? '' : 'disabled'}>${sub ? '제출 내용 변경' : '제출하기'}</button>
      ${submitted}
    </section>
    <section class="card">
      <h3>🔍 속마음 스카우터 <span class="muted small">(주도권 −${SCOUT_COST} · 우리 팀만 보여요)</span></h3>
      <div class="choices row">${scoutButtons}</div>
      <button class="secondary" data-action="scout" ${sel.scout && score >= SCOUT_COST ? '' : 'disabled'}>남은 요구 수치 확인 (−${SCOUT_COST})</button>
      ${scouts ? `<ul class="notes">${scouts}</ul>` : ''}
    </section>`;
}

function gameView(team: TeamId): string {
  const { pub, priv } = state;
  const score = myScore(pub, team);
  const header = `<header class="pbar"><b>${teamName(team)} 대표</b><span>${roundLabel(pub)}</span><span>주도권 <b>${score}</b></span></header>`;

  if (pub.stage === 'lobby') {
    return `${header}<section class="card center">
      <h2>${teamName(team)} 대표로 접속했어요</h2>
      <p>사회자가 게임을 시작하면 화면이 바뀌어요. 팀원들과 함께 사회자 화면을 봐주세요.</p>
      <button class="secondary" data-action="release">팀 다시 선택</button></section>`;
  }
  if (!pub.teamIds.includes(team)) {
    return `${header}<section class="card center"><h2>이번 게임에 참여하지 않는 팀이에요</h2>
      <p class="muted">게임 시작 후에 접속했어요. 사회자에게 문의하세요.</p></section>`;
  }
  if (pub.stage === 'final') {
    const rows = ranking(pub);
    const me = rows.find((r) => r.team === team)!;
    return `${header}<section class="card center">
      <p class="muted">최종 순위</p><div class="huge">${me.rank}위</div>
      <p>주도권 ${me.score}점 · 합의 ${me.deals}건</p></section>`;
  }

  const position = pub.order.indexOf(team) + 1;
  const notes = notesView(pub, priv);
  switch (pub.stage) {
    case 'order':
      return `${header}<section class="card center">
        <p class="muted">이번 라운드 제안 순서</p><div class="huge">${position}번째</div>
        <p>곧 제출 시간이 시작돼요. 팀원들과 전략을 상의하세요!</p></section>
        ${notes ? `<section class="card">${notes}</section>` : ''}
        <section class="card">${handView(priv)}</section>`;
    case 'submit':
      return `${header}${notes ? `<section class="card">${notes}</section>` : ''}${submitView(pub, team)}`;
    case 'reveal':
      return `${header}<section class="card center">
        <p>📺 사회자 화면에서 제안을 공개하고 있어요</p>
        <p class="muted">${position}번째로 제안했어요</p></section>
        ${notes ? `<section class="card">${notes}</section>` : ''}`;
    default:
      return header;
  }
}

function draw(): void {
  render(app, state.team ? gameView(state.team) : teamPicker());
  tickTimer();
}

function tickTimer(): void {
  const el = app.querySelector<HTMLElement>('[data-timer]');
  if (!el) return;
  const left = state.pub.deadline - serverNow();
  el.textContent = left > 0 ? `남은 시간 ${formatTimer(left)}` : '제출 시간 종료';
  el.classList.toggle('over', left <= 0);
}

/** 라운드가 바뀌면 선택을 초기화 (이미 제출했다면 그 내용으로) */
function syncSelection(): void {
  const key = `${state.pub.round}:${state.pub.stage}`;
  if (key === state.selKey) return;
  state.selKey = key;
  const sub = state.sub;
  state.sel = sub ? { table: sub.table, card: sub.card, cutIn: sub.cutIn, scout: 0 } : { table: 0, card: 'basic', cutIn: 0, scout: 0 };
}

/* ───────── 연결 ───────── */

let unsubscribeTeam: (() => void)[] = [];

function setTeam(team: TeamId | null): void {
  if (team === state.team) return;
  unsubscribeTeam.forEach((off) => off());
  unsubscribeTeam = [];
  state.team = team;
  state.priv = normPrivate(null);
  state.sub = null;
  state.selKey = '';
  if (!team) return;
  keepScreenOn();
  unsubscribeTeam = [
    trackOnline(roomRef(state.code, `teams/${team}/online`)),
    watch(state.code, `private/${team}`, (raw) => {
      state.priv = normPrivate(raw as Parameters<typeof normPrivate>[0]);
      draw();
    }),
    watch<Submission>(state.code, `submissions/${team}`, (sub) => {
      state.sub = sub;
      // 새로고침 직후에는 제출 내용이 늦게 도착하므로 선택 상태를 채워줌
      if (sub && !state.sel.table) state.sel = { table: sub.table, card: sub.card, cutIn: sub.cutIn, scout: 0 };
      draw();
    }),
  ];
}

async function openRoom(code: string): Promise<void> {
  render(app, '<p class="center muted">방을 찾는 중…</p>');
  if (!code || !(await getHostId(code))) return codeForm(code ? '존재하지 않는 방 코드예요.' : '');
  state.code = code;
  storage.set(ROOM_KEY, code);

  watch<Partial<Record<TeamId, TeamSlot>>>(code, 'teams', (teams) => {
    state.teams = teams ?? {};
    setTeam(TEAM_IDS.find((t) => state.teams[t]?.repUid === state.uid) ?? null);
    draw();
  });
  watch<Partial<PublicState>>(code, 'pub', (pub) => {
    state.pub = normPub(pub);
    syncSelection();
    draw();
  });
  setInterval(tickTimer, 250);

  onAction(app, async (action, el) => {
    const { sel, team } = state;
    const value = el.dataset.value ?? '';
    switch (action) {
      case 'claim':
        if (!(await claimTeam(state.code, el.dataset.team as TeamId, state.uid))) toast('이미 다른 대표가 선택한 팀이에요');
        return;
      case 'release':
        if (team) await releaseTeam(state.code, team);
        return;
      case 'pick-table':
        sel.table = Number(value);
        break;
      case 'pick-card':
        sel.card = value as CardId;
        break;
      case 'pick-cutin':
        sel.cutIn = Number(value);
        break;
      case 'pick-scout':
        sel.scout = Number(value);
        break;
      case 'submit':
        if (!team || !sel.table) return;
        if (serverNow() > state.pub.deadline) return toast('제출 시간이 끝났어요');
        try {
          await submitProposal(state.code, team, { table: sel.table, card: sel.card, cutIn: sel.cutIn });
          toast('제출했어요. 시간 안에는 바꿀 수 있어요');
        } catch {
          toast('제출하지 못했어요. 시간이 끝났는지 확인하세요');
        }
        return;
      case 'scout':
        if (!team || !sel.scout) return;
        await requestScout(state.code, team, sel.scout);
        sel.scout = 0;
        toast('스카우터 확인 중…');
        break;
    }
    draw();
  });
}

async function main() {
  render(app, '<p class="center muted">연결 중…</p>');
  state.uid = await signIn();
  const code = normalizeCode(new URLSearchParams(location.search).get('room') ?? storage.get(ROOM_KEY) ?? '');
  await openRoom(code).catch((err) => codeForm(errorMessage(err)));
}

main().catch((err) => showFatal(app, err));
