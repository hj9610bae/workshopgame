/* 현장 진행 화면(board.html)과 튜토리얼이 함께 쓰는 '교섭 테이블' 그림 조각 */
import { esc } from '../ui';
import { AGENDAS, CARDS, FINAL_AGENDA, FINAL_OPEN_ROUND, QUEUE, type TeamId } from './data';
import type { Submission, TableState } from './types';
import { rewardText, teamName } from './view';

export interface TableLook {
  /** 남은 수치를 보여줄 때만 (튜토리얼, 진행자 창) */
  remaining?: number;
  /** 방금 깎인 양 */
  hit?: number;
  /** 방금 합의된 안건 (테이블에는 이미 새 안건이 올라와 있음) */
  deal?: { team: TeamId; agenda: number; reward: number };
  /** 방금 새 안건이 들어옴 */
  fresh?: boolean;
  /** 방금 홍보물이 붙음 */
  promo?: boolean;
  /** 이번 제안의 대상 (튜토리얼) */
  target?: boolean;
}

export function feltTable(table: TableState, index: number, round: number, look: TableLook = {}): string {
  const no = index + 1;
  const isFinal = index === 3;
  const a = AGENDAS[table.agenda];
  const cls = ['ftable', isFinal ? 'final' : '', table.frozen ? 'frozen' : '', look.target ? 'target' : '', look.fresh ? 'fresh' : '']
    .filter(Boolean)
    .join(' ');
  const stamp = look.deal
    ? `<div class="deal-stamp"><span>합의!</span><small>${esc(teamName(look.deal.team))} +${look.deal.reward}</small></div>`
    : '';
  const hit = look.hit ? `<div class="hit-float">−${look.hit}</div>` : '';
  const head = `<div class="ftable-no">${no}번 테이블${isFinal ? ' · 최종 교섭' : ''}</div>`;
  if (!a) {
    const label = isFinal
      ? round < FINAL_OPEN_ROUND
        ? `<div class="ftable-wait">🏁 ${FINAL_OPEN_ROUND}라운드 개시</div><div class="ftable-teaser">성과급 ${rewardText(FINAL_AGENDA)}</div>`
        : '<div class="ftable-wait">최종 교섭 종료</div>'
      : '<div class="ftable-wait">대기열 소진</div>';
    return `<article class="${cls} empty">${head}<div class="ftable-slot">${label}</div>${stamp}</article>`;
  }
  const num = look.remaining === undefined ? '?' : String(Math.max(0, look.remaining));
  const promos = table.promos
    .map((t, i) => `<span class="sticker${look.promo && i === table.promos.length - 1 ? ' new' : ''}">📣 ${esc(teamName(t))}</span>`)
    .join('');
  return `<article class="${cls}">
    ${head}
    <div class="agenda-card">
      <div class="agenda-id">안건 ${a.id}</div>
      <h3>${esc(a.title)}</h3>
      <p class="gap">${esc(a.union)}<br>➔ ${esc(a.company)}</p>
      <div class="demand${look.remaining === undefined ? ' hidden' : ''}"><strong>${num}</strong><span>/ ${a.demand}</span></div>
      <div class="reward">🏆 ${rewardText(a.id)}</div>
      ${hit}
    </div>
    ${promos ? `<div class="stickers">${promos}</div>` : ''}
    ${table.frozen ? '<div class="frozen-cover">⛔ 보류</div>' : ''}
    ${stamp}
  </article>`;
}

export function deck(queue: number): string {
  const rest = QUEUE.slice(queue);
  const stack = rest.length ? Array.from({ length: Math.min(rest.length, 5) }, (_, i) => `<i style="--i:${i}"></i>`).join('') : '';
  const list = rest.map((id) => `<li>${esc(AGENDAS[id].title)} <b>${AGENDAS[id].demand}</b></li>`).join('');
  return `<div class="deck">
    <div class="deck-stack">${stack}<span class="deck-count">${rest.length}</span></div>
    <div class="deck-label">대기열</div>
    ${list ? `<ol class="deck-list">${list}</ol>` : '<p class="muted small">비었어요</p>'}
  </div>`;
}

export interface SeatLook {
  active?: TeamId;
  /** 팀 이름 아래 작은 표시 (제출 상태 등) */
  status?: Partial<Record<TeamId, string>>;
  deltas?: Partial<Record<TeamId, number>>;
}

/** 제안 순서대로 앉은 팀 자리 */
export function seats(order: TeamId[], scores: Partial<Record<TeamId, number>>, look: SeatLook = {}): string {
  const items = order
    .map((t, i) => {
      const d = look.deltas?.[t] ?? 0;
      const delta = d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : '';
      const status = look.status?.[t];
      return `<li class="seat${look.active === t ? ' active' : ''}">
        <span class="seat-pos">${i + 1}</span>
        <div class="seat-name">${esc(teamName(t))}</div>
        <div class="seat-score"><span class="coin">💰</span><strong>${scores[t] ?? 0}</strong>${delta}</div>
        ${status ? `<div class="seat-status">${status}</div>` : ''}
      </li>`;
    })
    .join('');
  return `<ol class="seats">${items}</ol>`;
}

/** 손으로 쓴 제출 용지 모양 */
export function slip(team: TeamId, sub: Submission): string {
  return `<div class="slip">
    <div class="slip-team">${esc(teamName(team))}</div>
    <div class="slip-line"><span>테이블</span><b>${sub.table}번</b></div>
    <div class="slip-line"><span>카드</span><b>${CARDS[sub.card].name}</b></div>
    ${sub.cutIn ? `<div class="slip-line"><span>새치기</span><b>${sub.cutIn}번째</b></div>` : ''}
  </div>`;
}
