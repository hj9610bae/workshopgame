/* 현장 진행 화면(board.html)이 쓰는 '탐험 해역'·선단 자리 그림 조각 */
import { esc } from '../ui';
import { AGENDAS, FINAL_AGENDA, FINAL_OPEN_ROUND, TIER_LABEL, distanceOf, type TeamId } from './data';
import type { GameEvent, TableState } from './types';
import { activeSetup, hpOf, rewardText, teamName, trailSteps } from './view';

export interface TableLook {
  /** 방금 처치된 역경 (해역에는 이미 새 역경이 올라와 있음) */
  deal?: { team: TeamId; agenda: number; reward: number };
  /** 방금 새 역경이 들어옴 */
  fresh?: boolean;
  /** 방금 쇠사슬이 걸림 */
  promo?: boolean;
}

/** 이 해역에서 처치되어 지나간 역경이 뒤로 희미하게 쌓인 모양 (최근 3장) */
function pile(table: TableState): { html: string; depth: number } {
  const done = table.done ?? [];
  const shown = done.slice(-3);
  const more = done.length - shown.length;
  const html = shown
    .map((d, k) => {
      const a = AGENDAS[d.agenda];
      const label = `${k === 0 && more ? `외 ${more}개 · ` : ''}${a.icon} ${esc(a.title)} · ${esc(teamName(d.team))} ✔`;
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
    ? `<div class="deal-stamp"><span>처치!</span><small>${esc(teamName(look.deal.team))} ${look.deal.reward}해리 전진</small></div>`
    : '';
  const head = `<div class="ftable-no">${no}번 해역${isFinal ? ' · 최종 결전' : ''}</div>`;
  if (!a) {
    const label = isFinal
      ? round < FINAL_OPEN_ROUND
        ? `<div class="ftable-wait">👑 ${FINAL_OPEN_ROUND}일차 개시</div><div class="ftable-teaser">${esc(AGENDAS[FINAL_AGENDA].title)} · 생명력 ${hpOf(FINAL_AGENDA)}</div>`
        : '<div class="ftable-wait">최종 결전 종료</div>'
      : '<div class="ftable-wait">대기열 소진</div>';
    const past = pile(table);
    return `<article class="${cls} empty">${head}<div class="stack" style="--n:${past.depth}">${past.html}<div class="ftable-slot">${label}</div></div>${stamp}</article>`;
  }
  // 처음 생명력은 공개, 남은 생명력은 비공개 (아폴론의 예지로만 확인)
  const promos = table.promos
    .map((t, i) => `<span class="sticker${look.promo && i === table.promos.length - 1 ? ' new' : ''}">⛓️ ${esc(teamName(t))}</span>`)
    .join('');
  const past = pile(table);
  return `<article class="${cls}">
    ${head}
    <div class="stack" style="--n:${past.depth}">${past.html}
    <div class="agenda-card">
      <div class="pictogram" aria-hidden="true">${a.icon}</div>
      <h3>${esc(a.title)}</h3>
      <p class="gap"><span>${TIER_LABEL[a.tier]} · ${esc(a.topic)}</span>❤️ 생명력 <b>${hpOf(a.id)}</b></p>
      <div class="reward">⛵ ${rewardText(a.id)}</div>
    </div>
    </div>
    ${promos ? `<div class="stickers">${promos}</div>` : ''}
    ${table.frozen ? '<div class="frozen-cover">🔱 동결</div>' : ''}
    ${stamp}
  </article>`;
}

export function deck(queue: number): string {
  const rest = activeSetup().queue.slice(queue);
  const stack = rest.length ? Array.from({ length: Math.min(rest.length, 5) }, (_, i) => `<i style="--i:${i}"></i>`).join('') : '';
  // 역경이 많아 다음 8개까지만 이름을 보여 줌
  const SHOW = 8;
  const more = rest.length > SHOW ? `<li class="more">외 ${rest.length - SHOW}개</li>` : '';
  const list = rest
    .slice(0, SHOW)
    .map((id) => `<li>${AGENDAS[id].icon} ${esc(AGENDAS[id].title)} <small>❤️${hpOf(id)}</small></li>`)
    .join('') + more;
  return `<div class="deck">
    <div class="deck-stack">${stack}<span class="deck-count">${rest.length}</span></div>
    <div class="deck-label">대기열</div>
    ${list ? `<ol class="deck-list">${list}</ol>` : '<p class="muted small">비었어요</p>'}
  </div>`;
}

export interface SeatLook {
  active?: TeamId;
  /** 선단 이름 아래 작은 표시 (제출 상태 등) */
  status?: Partial<Record<TeamId, string>>;
  deltas?: Partial<Record<TeamId, number>>;
}

/** 공격 순서대로 늘어선 선단 자리. 점수는 고국과의 거리(해리)로 보여 줌 */
export function seats(order: TeamId[], scores: Partial<Record<TeamId, number>>, look: SeatLook = {}): string {
  const items = order
    .map((t, i) => {
      // d 는 전진 거리 변화: 전진하면 고국과의 거리가 줄어듦
      const d = look.deltas?.[t] ?? 0;
      const delta = d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '−' : '+'}${Math.abs(d)}</span>` : '';
      const status = look.status?.[t];
      return `<li class="seat${look.active === t ? ' active' : ''}">
        <span class="seat-pos">${i + 1}</span>
        <div class="seat-name">${esc(teamName(t))}</div>
        <div class="seat-score"><span class="coin">🧭</span><strong>${distanceOf(scores[t] ?? 0)}</strong><small>해리</small>${delta}</div>
        ${status ? `<div class="seat-status">${status}</div>` : ''}
      </li>`;
    })
    .join('');
  return `<ol class="seats">${items}</ol>`;
}

/** 처치된 역경의 공격 이력: 처음 생명력부터 한 단계씩 깎여 온 과정 */
export function trailStrip(e: Pick<GameEvent, 'agenda' | 'demand' | 'trail'>): string {
  if (!e.demand) return '';
  const steps = trailSteps(e as GameEvent)
    .map(
      (s, i) => `<span class="trail-arrow" style="--d:${i + 1}">➔</span>
        <span class="trail-hit${s.after <= 0 ? ' last' : ''}" style="--d:${i + 1}"><small>${esc(s.label)}</small><b>−${s.amount}</b><em>${s.after}</em></span>`,
    )
    .join('');
  return `<div class="trail">
    <span class="trail-start"><small>처음 생명력</small><b>${e.demand}</b></span>${steps}
  </div>`;
}
