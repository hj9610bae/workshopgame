/* 현장 진행 화면(board.html)이 쓰는 '탐험 해역'·함대 자리 그림 조각 */
import { esc } from '../ui';
import { AGENDAS, CARDS, distanceOf, type CardId, type SpecialCardId, type TeamId } from './data';
import type { TableState } from './types';
import { activeSetup, hpOf, lootOf, teamName } from './view';

export interface TableLook {
  /** 방금 돌파된 역경 (해역에는 이미 새 역경이 올라와 있음) */
  deal?: { team: TeamId; agenda: number; reward: number };
  /** 방금 새 역경이 들어옴 */
  fresh?: boolean;
  /** 방금 쇠사슬이 걸림 */
  promo?: boolean;
}

/** 이 해역에서 돌파되어 지나간 역경이 뒤로 희미하게 쌓인 모양 (최근 3장) */
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

/**
 * 역경 카드: 픽토그램 + 역경 이름 + 생명력 + 전리품(전진 거리, 특수 무기 이름).
 * 실제 게임·연습 항해·항해 설명이 모두 이 양식을 씀
 */
export function adversaryCard(id: number, hp: number, loot?: SpecialCardId): string {
  const a = AGENDAS[id];
  return `<div class="agenda-card">
      <div class="pictogram" aria-hidden="true">${a.icon}</div>
      <h3>${esc(a.title)}</h3>
      <p class="hp">❤️ 생명력 <b>${hp}</b></p>
      <div class="reward"><span>⛵ ${hp}해리 전진</span>${loot ? `<span class="loot">${CARDS[loot].icon} ${CARDS[loot].name}</span>` : ''}</div>
    </div>`;
}

/** 무기 카드: 역경 카드와 같은 양식 (픽토그램 + 무기 이름 + 공격력) */
export function weaponCard(id: CardId): string {
  const c = CARDS[id];
  return `<div class="agenda-card weapon ${id}">
      <div class="pictogram" aria-hidden="true">${c.icon}</div>
      <h3>${c.name}</h3>
      <p class="hp">⚔️ 공격력 <b>${c.powerText}</b></p>
      <div class="reward"><span>${id === 'basic' ? '기본 무기 · 계속 사용' : '특수 무기 · 1회용'}</span></div>
    </div>`;
}

export function feltTable(table: TableState, index: number, look: TableLook = {}): string {
  const no = index + 1;
  const isFinal = index === 3;
  const a = AGENDAS[table.agenda];
  const cls = ['ftable', isFinal ? 'final' : '', table.frozen ? 'frozen' : '', look.fresh ? 'fresh' : '']
    .filter(Boolean)
    .join(' ');
  const stamp = look.deal
    ? `<div class="deal-stamp"><span>돌파!</span><small>${esc(teamName(look.deal.team))} ${look.deal.reward}해리 전진</small></div>`
    : '';
  const head = `<div class="ftable-no"><span>⚑ ${no}번 해역${isFinal ? ' · 최종 결전' : ''}</span></div>`;
  const past = pile(table);
  if (!a) {
    // 4번 해역은 FINAL_OPEN_ROUND 전에는 아예 그리지 않음 (board.ts)
    const label = isFinal ? '최종 결전 종료' : '대기열 소진';
    return `<article class="${cls} empty">${head}<div class="stack" style="--n:${past.depth}">${past.html}<div class="ftable-slot"><div class="ftable-wait">${label}</div></div></div>${stamp}</article>`;
  }
  // 처음 생명력은 공개, 남은 생명력은 비공개 (아폴론의 예지로만 확인)
  const promos = table.promos
    .map((t, i) => `<span class="sticker${look.promo && i === table.promos.length - 1 ? ' new' : ''}">⛓️ ${esc(teamName(t))}</span>`)
    .join('');
  return `<article class="${cls}">
    ${head}
    <div class="stack" style="--n:${past.depth}">${past.html}${adversaryCard(a.id, hpOf(a.id), lootOf(a.id))}</div>
    ${promos ? `<div class="stickers">${promos}</div>` : ''}
    ${table.frozen ? '<div class="frozen-cover">🔱 동결</div>' : ''}
    ${stamp}
  </article>`;
}

export function deck(queue: number): string {
  const rest = activeSetup().queue.slice(queue);
  // 역경이 많으면 다음 14개까지만 이름을 보여 줌
  const SHOW = 14;
  const more = rest.length > SHOW ? `<li class="more">외 ${rest.length - SHOW}개</li>` : '';
  const list = rest
    .slice(0, SHOW)
    .map((id) => `<li>${AGENDAS[id].icon} ${esc(AGENDAS[id].title)} <small>❤️${hpOf(id)}${lootOf(id) ? ` ${CARDS[lootOf(id)!].icon}` : ''}</small></li>`)
    .join('') + more;
  return `<div class="deck">
    <div class="deck-label">대기열 <span>${rest.length}</span></div>
    ${list ? `<ol class="deck-list">${list}</ol>` : '<p class="muted small">비었어요</p>'}
  </div>`;
}

export interface SeatLook {
  active?: TeamId;
  /** 함대 이름 옆 작은 표시 (제출 상태 등) */
  status?: Partial<Record<TeamId, string>>;
  deltas?: Partial<Record<TeamId, number>>;
  /** 배 위치를 기억해 움직임을 그리는 단위 (게임 화면·설명·최종 결과가 서로 섞이지 않게) */
  key?: string;
}

/** 지난번에 그린 배의 가로 위치(%). 거리가 바뀌면 그 자리에서 새 자리로 항해해 오게 */
const lastX = new Map<string, number>();

/** 눈금 간격: 지도에 6칸 안팎이 되도록 1·2·5·10… 중에서 */
function tickStep(range: number): number {
  const raw = range / 6;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= raw) ?? 10 * pow;
}

export const distanceLabel = (d: number): string => (d < 0 ? `내륙 ${-d}해리` : d === 0 ? '항구 도착' : `${d}해리`);

/**
 * 공격 순서대로 한 줄씩, 고국과의 거리만큼 떨어진 자리에 배를 그린 바다 지도.
 * 왼쪽 끝이 이타카 섬(0 = 항구, 음수 = 섬 안쪽), 오른쪽 끝이 트로이 전장.
 * 축척은 그날 함대들의 거리와 항구가 화면에 꽉 차도록 매번 맞춤 (간격은 실제 거리 차이에 비례)
 */
export function seaMap(order: TeamId[], scores: Partial<Record<TeamId, number>>, look: SeatLook = {}): string {
  const key = look.key ?? 'game';
  const dist = order.map((t) => distanceOf(scores[t] ?? 0));
  const near = Math.min(0, ...dist);
  const far = Math.max(0, ...dist);
  const span = Math.max(far - near, 6);
  const lo = near - Math.max(2, span * 0.15);
  const hi = far + Math.max(1.5, span * 0.1);
  const x = (d: number) => ((d - lo) / (hi - lo)) * 100;
  const port = x(0);
  const step = tickStep(hi - lo);
  const ticks: string[] = [];
  for (let v = Math.ceil(lo / step) * step; v < hi; v += step) {
    if (v !== 0) ticks.push(`<span class="sea-tick" style="--x:${x(v).toFixed(2)}%">${v}</span>`);
  }
  const ships = order
    .map((t, i) => {
      const d = dist[i];
      const px = x(d);
      const id = `${key}:${t}`;
      const prev = lastX.get(id);
      lastX.set(id, px);
      const sail = prev !== undefined && Math.abs(prev - px) > 0.05;
      // delta 는 전진 거리 변화: 전진하면 고국과의 거리가 줄어듦
      const dd = look.deltas?.[t] ?? 0;
      const delta = dd ? `<span class="delta ${dd > 0 ? 'up' : 'down'}">${dd > 0 ? '−' : '+'}${Math.abs(dd)}</span>` : '';
      const status = look.status?.[t];
      const style = `--i:${i};--x:${px.toFixed(2)}%${sail ? `;--from:${prev!.toFixed(2)}%` : ''}`;
      return `<li class="ship${look.active === t ? ' active' : ''}${sail ? ' sail' : ''}" style="${style}">
        <span class="ship-pos">${i + 1}</span><span class="ship-icon" aria-hidden="true">⛵</span>
        <b class="ship-name">${esc(teamName(t))}</b><span class="ship-dist">${distanceLabel(d)}</span>${delta}
        ${status ? `<span class="ship-status">${status}</span>` : ''}
      </li>`;
    })
    .join('');
  return `<section class="sea" style="--rows:${order.length};--port:${port.toFixed(2)}%">
    <div class="sea-land"><span>🏝️ 이타카 섬</span></div>
    <div class="sea-port"><span>⚓ 이타카 항구 0</span></div>
    <div class="sea-troy"><span>⚔️ 트로이 전장</span></div>
    <div class="sea-ticks">${ticks.join('')}</div>
    <ol class="sea-ships">${ships}</ol>
  </section>`;
}
