import './style.css';
import { update } from 'firebase/database';
import { toDataURL } from 'qrcode';
import { FINAL_OPEN_ROUND, ROUNDS, TEAM_IDS, type TeamId } from './deal/data';
import { beginSubmit, createGame, ranking, resolveRound, revealNext, scout, startRound } from './deal/engine';
import { engineState, normHostRoom, saveStep, type HostRoom, type TeamSlot } from './deal/sync';
import type { PublicState, Stage } from './deal/types';
import { eventItem, formatTimer, queueStrip, roundLabel, snapshot, tableCard, teamName } from './deal/view';
import { signIn } from './firebase';
import { clean, createRoom, getHostId, normalizeCode, roomRef, serverNow, watch } from './room';
import { esc, errorMessage, onAction, render, showFatal, toast } from './ui';

document.body.classList.add('host');
const app = document.querySelector<HTMLElement>('#app')!;

/** 새로고침해도 같은 방을 이어서 진행할 수 있도록 URL 의 ?room= 을 확인 */
async function resolveRoom(uid: string): Promise<string> {
  const requested = normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
  if (requested && (await getHostId(requested).catch(() => null)) === uid) return requested;
  const code = await createRoom(uid, { pub: { stage: 'lobby' } });
  history.replaceState(null, '', `?room=${code}`);
  return code;
}

const dot = (slot: TeamSlot | undefined) =>
  `<span class="dot ${slot?.repUid ? (slot.online ? 'on' : 'off') : 'none'}" title="대표 접속 상태"></span>`;

function header(pub: PublicState, code: string): string {
  const reset = pub.stage === 'lobby' ? '' : '<button class="small secondary" data-action="reset">처음부터</button>';
  return `<header class="hbar">
    <div class="brand">💼 교섭의 도박사들 <span class="muted">Deal or No Deal</span></div>
    <div class="round">${roundLabel(pub)}</div>
    <div class="room">방 코드 <b>${code}</b> ${reset}</div>
  </header>`;
}

function lobbyView(room: HostRoom, code: string, joinUrl: string, qr: string): string {
  const slots = TEAM_IDS.map((t) => {
    const slot = room.teams[t];
    const status = !slot?.repUid ? '대기 중' : slot.online ? '접속 중' : '연결 끊김';
    const release = slot?.repUid ? `<button class="small secondary" data-action="release" data-team="${t}">해제</button>` : '';
    return `<li class="slot">${dot(slot)}<strong>${teamName(t)}</strong><span class="muted">${status}</span>${release}</li>`;
  }).join('');
  const ready = TEAM_IDS.filter((t) => room.teams[t]?.repUid).length;
  return `<section class="lobby">
    <div class="card center">
      <p class="muted">팀 대표는 QR을 찍고 팀을 선택하세요</p>
      <img class="qr" src="${qr}" alt="참가 QR 코드" />
      <div class="code">${code}</div>
      <p class="muted small">${esc(joinUrl)}</p>
    </div>
    <div class="card">
      <h2>팀 대표 접속 (${ready}/${TEAM_IDS.length})</h2>
      <ul class="slots">${slots}</ul>
      <button data-action="start" ${ready ? '' : 'disabled'}>게임 시작</button>
      <p class="muted small">대표가 접속한 팀만 게임에 참여해요. 대표 폰이 바뀌면 '해제' 후 새 폰으로 다시 선택하세요.</p>
    </div>
  </section>`;
}

function stagePanel(room: HostRoom): string {
  const { pub } = room;
  const n = pub.teamIds.length;
  switch (pub.stage) {
    case 'order': {
      const events = pub.events.map((e) => eventItem(e, true)).join('');
      return `<div class="panel-row">
        <div class="grow">
          <h2>${pub.round}라운드 순서 발표</h2>
          ${events ? `<ul class="events">${events}</ul>` : ''}
          <p class="muted">주도권이 높은 팀부터 제안해요. ${pub.round === 1 ? '1라운드는 무작위 추첨!' : '동점이면 지난 라운드 뒤 순번이 우선.'}</p>
        </div>
        <button class="wide" data-action="submit">비공개 제출 시작 ▶</button>
      </div>`;
    }
    case 'submit': {
      const done = pub.teamIds.filter((t) => room.submissions[t]).length;
      return `<div class="panel-row">
        <div class="timer" data-timer></div>
        <div class="grow">
          <h2>대표 폰으로 제출하세요</h2>
          <p>${done}/${n}팀 제출 완료 · 스카우터와 새치기를 쓸 수 있어요</p>
        </div>
        <button class="wide" data-action="resolve">제안 공개${done < n ? ' (미제출 팀은 패스)' : ''}</button>
      </div>`;
    }
    case 'reveal': {
      const shown = pub.events.slice(0, pub.revealed);
      const latest = shown.at(-1);
      const earlier = shown.slice(0, -1).reverse();
      const left = pub.events.length - pub.revealed;
      const next = pub.round + 1;
      const buttons =
        left > 0
          ? `<button class="wide" data-action="reveal">다음 공개 ▶ <span class="small">(${left})</span></button>
             <button class="secondary" data-action="reveal-all">모두 공개</button>`
          : pub.round < ROUNDS
            ? `<button class="wide" data-action="next-round">${next}라운드 시작 ▶${next === FINAL_OPEN_ROUND ? ' 최종 교섭 개시!' : ''}</button>`
            : '<button class="wide" data-action="finish">🏆 최종 결과 발표</button>';
      return `<div class="panel-row">
        <ul class="events grow">${latest ? eventItem(latest, true) : ''}${earlier.map((e) => eventItem(e)).join('')}</ul>
        <div class="actions">${buttons}</div>
      </div>`;
    }
    default:
      return '';
  }
}

function gameView(room: HostRoom): string {
  const { pub } = room;
  const snap = snapshot(pub);
  const tables = snap.tables.map((t, i) => tableCard(t, i, pub.round)).join('');
  const order = pub.order
    .map((t, i) => {
      const status = pub.stage === 'submit' ? `<span class="status">${room.submissions[t] ? '✅' : '⌛'}</span>` : '';
      return `<li><span class="pos">${i + 1}</span><span class="name">${dot(room.teams[t])}${teamName(t)}</span>${status}<span class="score">${snap.scores[t] ?? 0}</span></li>`;
    })
    .join('');
  const queueVisible = pub.stage !== 'reveal' || pub.revealed >= pub.events.length;
  return `<div class="board">
      <section class="tables-grid">${tables}</section>
      <aside class="card side">
        <h2>제안 순서 · 주도권</h2>
        <ol class="order">${order}</ol>
        <h3>대기열</h3>
        ${queueVisible ? queueStrip(pub) : '<p class="muted">공개 중…</p>'}
      </aside>
    </div>
    <section class="card stage-panel">${stagePanel(room)}</section>`;
}

function finalView(pub: PublicState): string {
  const rows = ranking(pub);
  const winners = rows.filter((r) => r.rank === 1);
  const list = rows
    .map((r) => `<li class="rank-${r.rank}"><span class="rank">${r.rank}위</span><span class="name">${teamName(r.team)}</span><span class="score">${r.score}점</span><span class="muted">합의 ${r.deals}건</span></li>`)
    .join('');
  return `<section class="final">
    <h1>🏆 최종 결과</h1>
    <ol class="podium">${list}</ol>
    <blockquote class="closing">
      "5라운드에 걸친 치열한 교섭이 모두 끝났습니다! 오늘 최종 우승은 총 주도권 ${winners[0]?.score ?? 0}점을 확보한
      ${winners.map((w) => teamName(w.team)).join(', ')}입니다! 축하드립니다!<br />
      이번 게임에서는 노조의 요구 수치를 가늠하고 합의(막타)를 이끌어내는 타이밍이 핵심이었습니다.
      실제 교섭장에서도 회사의 제시안을 내는 시점과 비공개 채널을 가동하는 '타이밍 전략'이 성공적인 타결을 만든다는 점을 기억해 주시기 바랍니다!"
    </blockquote>
  </section>`;
}

/** 각 버튼이 눌릴 수 있는 단계. 두 번 눌러도 한 번만 처리되도록 확인 */
const ALLOWED: Record<string, Stage[]> = {
  start: ['lobby'],
  release: ['lobby', 'order', 'submit', 'reveal', 'final'],
  submit: ['order'],
  resolve: ['submit'],
  reveal: ['reveal'],
  'reveal-all': ['reveal'],
  'next-round': ['reveal'],
  finish: ['reveal'],
  reset: ['order', 'submit', 'reveal', 'final'],
};

async function main() {
  render(app, '<p class="center muted">방을 준비하는 중…</p>');
  const uid = await signIn();
  const code = await resolveRoom(uid);
  const joinUrl = new URL(`play.html?room=${code}`, location.href).toString();
  const qr = await toDataURL(joinUrl, { margin: 1, width: 480 });
  const patch = (values: Record<string, unknown>) => update(roomRef(code), clean(values));

  let room: HostRoom | null = null;

  // 사회자 화면이 모든 판정을 담당하므로 쓰기 작업은 한 번에 하나씩 순서대로 처리
  let chain: Promise<void> = Promise.resolve();
  const run = (task: () => Promise<unknown>) => {
    chain = chain.then(task).then(
      () => undefined,
      (err) => toast(errorMessage(err)),
    );
  };

  const handledRequests = new Set<string>();
  const processRequests = () => {
    for (const team of TEAM_IDS) {
      for (const [id, req] of Object.entries(room?.requests[team] ?? {})) {
        if (handledRequests.has(id)) continue;
        handledRequests.add(id);
        run(async () => {
          if (!room) return;
          const { state, result } = scout(engineState(room), team, Number(req.table));
          await patch({ pub: state.pub, [`private/${team}/scouts/${id}`]: result, [`requests/${team}/${id}`]: null });
        });
      }
    }
  };

  const tickTimer = () => {
    const el = app.querySelector<HTMLElement>('[data-timer]');
    if (!el || !room) return;
    const left = room.pub.deadline - serverNow();
    el.textContent = left > 0 ? formatTimer(left) : '시간 종료';
    el.classList.toggle('over', left <= 0);
  };

  const draw = () => {
    if (!room) return render(app, '<p class="center">방이 사라졌어요. 새로고침해서 새 방을 만드세요.</p>');
    const { pub } = room;
    const body = pub.stage === 'lobby' ? lobbyView(room, code, joinUrl, qr) : pub.stage === 'final' ? finalView(pub) : gameView(room);
    render(app, header(pub, code) + body);
    tickTimer();
  };

  watch(code, '', (raw) => {
    room = normHostRoom(raw);
    processRequests();
    draw();
  });
  setInterval(tickTimer, 250);

  onAction(app, (action, el) =>
    run(async () => {
      if (!room || !ALLOWED[action]?.includes(room.pub.stage)) return;
      const state = engineState(room);
      switch (action) {
        case 'start': {
          const teamIds = TEAM_IDS.filter((t) => room!.teams[t]?.repUid);
          await patch({ private: null, submissions: null, requests: null, secret: null });
          await saveStep(code, startRound(createGame(teamIds)));
          break;
        }
        case 'release':
          await patch({ [`teams/${el.dataset.team as TeamId}`]: null });
          break;
        case 'submit':
          await patch({ pub: beginSubmit(state, serverNow()).pub, submissions: null, requests: null });
          break;
        case 'resolve':
          await saveStep(code, resolveRound(state, room.submissions));
          break;
        case 'reveal':
        case 'reveal-all':
          await patch({ 'pub/revealed': revealNext(state, action === 'reveal-all').pub.revealed });
          break;
        case 'next-round':
          if (room.pub.revealed < room.pub.events.length) return;
          await saveStep(code, startRound(state));
          break;
        case 'finish':
          await patch({ 'pub/stage': 'final' });
          break;
        case 'reset':
          if (!confirm('게임을 처음부터 다시 시작할까요? 점수와 카드가 모두 초기화돼요.')) return;
          await patch({ pub: { stage: 'lobby' }, secret: null, private: null, submissions: null, requests: null });
          break;
      }
    }),
  );
}

main().catch((err) => showFatal(app, err));
