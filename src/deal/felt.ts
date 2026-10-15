/* 현장 진행 화면(board.html)과 튜토리얼이 함께 쓰는 '교섭 테이블' 그림 조각 */
import { esc } from '../ui';
import { AGENDAS, FINAL_AGENDA, FINAL_OPEN_ROUND, type TeamId } from './data';
import type { GameEvent, TableState } from './types';
import { activeSetup, rewardText, teamName, trailSteps } from './view';

export interface TableLook {
  /** 방금 합의된 안건 (테이블에는 이미 새 안건이 올라와 있음) */
  deal?: { team: TeamId; agenda: number; reward: number };
  /** 방금 새 안건이 들어옴 */
  fresh?: boolean;
  /** 방금 홍보물이 붙음 */
  promo?: boolean;
}

/** 이 테이블에서 합의되어 지나간 안건이 뒤로 희미하게 쌓인 모양 (최근 3장) */
function pile(table: TableState): { html: string; depth: number } {
  const done = table.done ?? [];
  const shown = done.slice(-3);
  const more = done.length - shown.length;
  const html = shown
    .map((d, k) => {
      const a = AGENDAS[d.agenda];
      const label = `${k === 0 && more ? `+${more} · ` : ''}${a.icon} ${esc(a.title)} · ${esc(teamName(d.team))} ✔`;
      return `<div class="past" style="--k:${shown.length - k}"><span>${label}</span></div>`;
    })
    .join('');
  return { html, depth: shown.length };
}

export function feltTable(table: TableState, index: number, round: number, look: TableLook = {}): string {
  const no = index + 1;
  const isFinal = index === 3;
  const a = AGENDAS[table.agenda];
  const cls = ['ftable', isFinal ? 'final' : '', table.frozen ? 'frozen' : '', look.fresh ? 'fresh' : '']
    .filter(Boolean)
    .join(' ');
  const stamp = look.deal
    ? `<div class="deal-stamp"><span>합의!</span><small>${esc(teamName(look.deal.team))} +${look.deal.reward}</small></div>`
    : '';
  const head = `<div class="ftable-no">${no}번 테이블${isFinal ? ' · 최종 교섭' : ''}</div>`;
  if (!a) {
    const label = isFinal
      ? round < FINAL_OPEN_ROUND
        ? `<div class="ftable-wait">🏁 ${FINAL_OPEN_ROUND}라운드 개시</div><div class="ftable-teaser">성과급 ${rewardText(FINAL_AGENDA)}</div>`
        : '<div class="ftable-wait">최종 교섭 종료</div>'
      : '<div class="ftable-wait">대기열 소진</div>';
    const past = pile(table);
    return `<article class="${cls} empty">${head}<div class="stack" style="--n:${past.depth}">${past.html}<div class="ftable-slot">${label}</div></div>${stamp}</article>`;
  }
  // 요구 수치는 블라인드라 카드에 숫자 없이 픽토그램과 노조 요구안만
  const promos = table.promos
    .map((t, i) => `<span class="sticker${look.promo && i === table.promos.length - 1 ? ' new' : ''}">📣 ${esc(teamName(t))}</span>`)
    .join('');
  const past = pile(table);
  return `<article class="${cls}">
    ${head}
    <div class="stack" style="--n:${past.depth}">${past.html}
    <div class="agenda-card">
      <div class="pictogram" aria-hidden="true">${a.icon}</div>
      <h3>${esc(a.title)}</h3>
      <p class="gap"><span>노조 요구</span>${esc(a.union)}</p>
      <div class="reward">🏆 ${rewardText(a.id)}</div>
    </div>
    </div>
    ${promos ? `<div class="stickers">${promos}</div>` : ''}
    ${table.frozen ? '<div class="frozen-cover">⛔ 보류</div>' : ''}
    ${stamp}
  </article>`;
}

export function deck(queue: number): string {
  const rest = activeSetup().queue.slice(queue);
  const stack = rest.length ? Array.from({ length: Math.min(rest.length, 5) }, (_, i) => `<i style="--i:${i}"></i>`).join('') : '';
  const list = rest.map((id) => `<li>${AGENDAS[id].icon} ${esc(AGENDAS[id].title)}</li>`).join('');
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

/** 합의된 안건의 블라인드 해제: 실제 타결 내용과, 처음 요구 수치부터 한 단계씩 깎여 온 과정 */
export function trailStrip(e: Pick<GameEvent, 'agenda' | 'demand' | 'trail'>): string {
  if (!e.demand) return '';
  const a = e.agenda ? AGENDAS[e.agenda] : undefined;
  const settled = a
    ? `<div class="settled"><span class="settled-from">노조 요구 ${esc(a.union)}</span><span class="settled-arrow">➔</span><span class="settled-to">타결 <b>${esc(a.company)}</b></span></div>`
    : '';
  const steps = trailSteps(e as GameEvent)
    .map(
      (s, i) => `<span class="trail-arrow" style="--d:${i + 1}">➔</span>
        <span class="trail-hit${s.after <= 0 ? ' last' : ''}" style="--d:${i + 1}"><small>${esc(s.label)}</small><b>−${s.amount}</b><em>${s.after}</em></span>`,
    )
    .join('');
  return `${settled}<div class="trail">
    <span class="trail-start"><small>블라인드 공개 · 요구 수치</small><b>${e.demand}</b></span>${steps}
  </div>`;
}
