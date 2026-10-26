/* 현장 진행 화면(board.html)이 쓰는 '탐험 해역'·함대 자리 그림 조각 */
import { esc } from '../ui';
import { AGENDAS, CARDS, distanceOf, type CardId, type SpecialCardId, type TeamId } from './data';
import type { TableState } from './types';
import { agendaGlyph, cardGlyph, glyph } from './icons';
import { activeSetup, hpOf, lootOf, teamName } from './view';

export interface TableLook {
  /** 방금 돌파된 역경 (해역에는 이미 새 역경이 올라와 있음) */
  deal?: { team: TeamId; agenda: number; reward: number };
  /** 방금 새 역경이 들어옴 */
  fresh?: boolean;
  /** 돌파 발표 중: 새 역경 대신 방금 돌파된 역경을 어둡게(할퀸 자국) 보여 주고 그 위에 인장 */
  slain?: boolean;
  /** 방금 쇠사슬로 동결됨 (동결 표식은 이때 한 번만 찍히는 연출, 그 뒤로는 그대로 유지) */
  freeze?: boolean;
  /** 방금 전갈 화살이 꽂힘 */
  promo?: boolean;
}

/** 이 해역에서 돌파되어 지나간 역경이 뒤로 희미하게 쌓인 모양 (최근 3장) */
function pile(table: TableState, skipLast = false): { html: string; depth: number } {
  const done = (table.done ?? []).slice(0, skipLast ? -1 : undefined);
  const shown = done.slice(-3);
  const more = done.length - shown.length;
  const html = shown
    .map((d, k) => {
      const a = AGENDAS[d.agenda];
      const label = `${k === 0 && more ? `외 ${more}개 · ` : ''}${agendaGlyph(a.id)} ${esc(a.title)} · ${esc(teamName(d.team))} ✔`;
      return `<div class="past" style="--k:${shown.length - k}"><span>${label}</span></div>`;
    })
    .join('');
  return { html, depth: shown.length };
}

/**
 * 역경 카드: 픽토그램 + 역경 이름 + 생명력 + 전리품 특수 무기.
 * 전진 거리는 처음 생명력과 같아서 따로 적지 않음. 실제 게임·연습 항해·항해 설명이 모두 이 양식을 씀.
 * full: 항해 설명에서는 무기 풀네임, 게임 화면에서는 짧은 이름
 */
export function adversaryCard(id: number, hp: number, loot?: SpecialCardId, shownHp: string = String(hp), full = false): string {
  const a = AGENDAS[id];
  // 생명력: 숫자 배지 + 처음 생명력만큼의 눈금 게이지 (남은 생명력은 비공개라 눈금은 늘 가득)
  const pips = Array.from({ length: hp }, () => '<i></i>').join('');
  return `<div class="agenda-card">
      <div class="pictogram">${agendaGlyph(a.id)}</div>
      <h3>${esc(a.title)}</h3>
      ${loot ? `<p class="loot">${cardGlyph(loot)} ${full ? CARDS[loot].name : CARDS[loot].short}</p>` : ''}
      <div class="hp"><span class="hp-label">생명력</span><b>${shownHp}</b><span class="hp-pips" aria-hidden="true">${pips}</span></div>
    </div>`;
}

/** 무기 카드: 역경 카드와 같은 양식 (픽토그램 + 무기 이름 + 공격력). secret 이면 공격력·효과를 ? 로 */
export function weaponCard(id: CardId, secret = false): string {
  const c = CARDS[id];
  const foot = id === 'basic' ? '기본 무기 · 계속 사용' : secret ? '효과는 획득한 함대만' : '특수 무기 · 1회용';
  return `<div class="agenda-card weapon ${id}${secret ? ' secret' : ''}">
      <div class="pictogram">${cardGlyph(id)}</div>
      <h3>${c.name}</h3>
      <div class="hp"><span class="hp-label">공격력</span><b>${secret ? '?' : c.powerText}</b></div>
      <div class="reward"><span>${foot}</span></div>
    </div>`;
}

export function feltTable(table: TableState, index: number, look: TableLook = {}): string {
  const no = index + 1;
  const isFinal = index === 3;
  const slain = look.slain && look.deal ? look.deal : undefined;
  const a = AGENDAS[slain ? slain.agenda : table.agenda];
  // t1~t3: 해역 번호 (카드 색은 모두 같음). live: 아직 공격할 역경이 있는 해역은 은은한 금빛 글로우
  const live = !slain && a && !table.frozen;
  const cls = ['ftable', `t${no}`, isFinal ? 'final' : '', table.frozen ? 'frozen' : '', look.fresh && !slain ? 'fresh' : '', slain ? 'slain' : '', live ? 'live' : '']
    .filter(Boolean)
    .join(' ');
  // 돌파 도장: 카드를 어둡게 덮고 회전 없이 월계관 + 돌파 완료
  const stamp = look.deal
    ? `<div class="deal-stamp">${glyph('laurel-crown', 'stamp-laurel')}<span>돌파 완료</span><small><b>${esc(teamName(look.deal.team))}</b> ${look.deal.reward}해리 전진</small></div>`
    : '';
  const head = `<div class="ftable-no"><span>${no}번 해역${isFinal ? ' · 최종 결전' : ''}</span></div>`;
  const past = pile(table, !!slain);
  if (!a) {
    // 4번 해역은 FINAL_OPEN_ROUND 전에는 아예 그리지 않음 (board.ts)
    const label = isFinal ? '최종 결전 종료' : '대기열 소진';
    return `<article class="${cls} empty">${head}<div class="stack" style="--n:${past.depth}">${past.html}<div class="ftable-slot"><div class="ftable-wait">${label}</div></div></div>${stamp}</article>`;
  }
  // 처음 생명력은 공개, 남은 생명력은 비공개 (아폴론의 예지로만 확인)
  if (slain) {
    return `<article class="${cls}">${head}<div class="stack" style="--n:${past.depth}">${past.html}${adversaryCard(a.id, hpOf(a.id), lootOf(a.id))}</div>${stamp}</article>`;
  }
  const promos = table.promos
    .map((t, i) => `<span class="sticker${look.promo && i === table.promos.length - 1 ? ' new' : ''}">${cardGlyph('promo')} ${esc(teamName(t))}</span>`)
    .join('');
  return `<article class="${cls}">
    ${head}
    <div class="stack" style="--n:${past.depth}">${past.html}${adversaryCard(a.id, hpOf(a.id), lootOf(a.id))}</div>
    ${promos ? `<div class="stickers">${promos}</div>` : ''}
    ${table.frozen ? `<div class="frozen-cover${look.freeze ? ' new' : ''}">${cardGlyph('hold')}<span>동결</span></div>` : ''}
    ${stamp}
  </article>`;
}

export const deck = (queue: number): string => deckOf(activeSetup().queue.slice(queue), hpOf, lootOf);

/** 대기열 목록. 항해 설명은 기준 배치(SETUP)의 생명력·전리품으로 그림 */
export function deckOf(rest: number[], hp: (id: number) => number, loot: (id: number) => SpecialCardId | undefined, SHOW = 5): string {
  // 다음 SHOW 개까지만 이름을 보여 줌
  const more = rest.length > SHOW ? `<p class="deck-more">외 ${rest.length - SHOW}개</p>` : '';
  const list = rest
    .slice(0, SHOW)
    .map((id) => `<li>${agendaGlyph(id)} ${esc(AGENDAS[id].title)} <small>${hp(id)}${loot(id) ? ` ${cardGlyph(loot(id)!)}` : ''}</small></li>`)
    .join('');
  return `<div class="deck">
    <div class="deck-label">대기열 <span>${rest.length}</span></div>
    ${list ? `<ol class="deck-list">${list}</ol>${more}` : '<p class="muted small">비었어요</p>'}
  </div>`;
}

export interface SeatLook {
  active?: TeamId;
  /** 함대 이름 옆 작은 표시 (제출 상태 등) */
  status?: Partial<Record<TeamId, string>>;
  deltas?: Partial<Record<TeamId, number>>;
  /** 구조선으로 귀환해 항해하지 않는 함대 (순번 대신 닻 표시) */
  docked?: TeamId[];
  /** 배 위치를 기억해 움직임을 그리는 단위 (게임 화면·설명·최종 결과가 서로 섞이지 않게) */
  key?: string;
  /** 이타카 내륙 왼쪽에 결승선(왕궁) 표시 (FINAL_OPEN_ROUND 부터) */
  goal?: boolean;
  /** 결승선에 완전히 도착해 왕좌를 되찾은 함대 (10일차 끝·최종 결과의 1등) */
  arrive?: TeamId[];
}

/** 결승선의 가로 위치(%): 왼쪽 왕궁 그림 바로 오른쪽 */
const GOAL_X = 13;

/** 바다 지도의 배 핀: 짙은 선체 + 금빛 돛 두 장 (앞 돛은 밝게, 뒤 돛은 어둡게 해 입체감) */
const SHIP_SVG = `<svg class="ship-art" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M15.5 3v20" stroke="#5a3a1a" stroke-width="1.6"/>
  <path d="M14.6 5 L14.6 21 L5 21 Q9 13 14.6 5Z" fill="#ffd95a"/>
  <path d="M14.6 5 L14.6 21 L10.5 21 Q12 13 14.6 5Z" fill="#f4c430"/>
  <path d="M16.6 7 L16.6 21 L25 21 Q22 14 16.6 7Z" fill="#d4af37"/>
  <path d="M15.5 2 l4 1.6 -4 1.4z" fill="#e63946"/>
  <path d="M3.5 22.5 H28.5 L24.5 28.5 H7.5Z" fill="#6b3f1d"/>
  <path d="M3.5 22.5 H28.5 L27.6 24 H4.4Z" fill="#d4af37"/>
</svg>`;

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
  const hi = far + Math.max(1.5, span * 0.1);
  // 결승선이 있으면 가장 안쪽 함대도 결승선보다 오른쪽(지도의 약 20% 이후)에 오도록 내륙을 넓힘
  const lo = near - Math.max(2, span * 0.15, look.goal ? (hi - near) * 0.26 : 0);
  const x = (d: number) => ((d - lo) / (hi - lo)) * 100;
  const port = x(0);
  const step = tickStep(hi - lo);
  // 눈금마다 은은하게 빛나는 세로 점선 (항구 0은 따로 굵게 그림)
  const ticks: string[] = [];
  for (let v = Math.ceil(lo / step) * step; v < hi; v += step) {
    // 결승선 왼쪽(왕궁 그림 밑)의 눈금은 그리지 않음
    if (v !== 0 && !(look.goal && x(v) < GOAL_X + 1)) ticks.push(`<span class="sea-tick${v < 0 ? ' land' : ''}" style="--x:${x(v).toFixed(2)}%"><small>${v > 0 ? `${v}해리` : v}</small></span>`);
  }
  const ships = order
    .map((t, i) => {
      const d = dist[i];
      const home = !!look.goal && !!look.arrive?.includes(t);
      const px = home ? GOAL_X : x(d);
      const id = `${key}:${t}`;
      // 처음 그리는 도착 함대도 제자리에서 결승선까지 항해해 오게
      const prev = lastX.get(id) ?? (home ? x(d) : undefined);
      lastX.set(id, px);
      const sail = prev !== undefined && Math.abs(prev - px) > 0.05;
      // 이타카 내륙(음수)에 들어가면 배 대신 말
      const art = d < 0 || home ? glyph('horse-head', 'ship-horse') : SHIP_SVG;
      const badge = home ? glyph('crown') : look.docked?.includes(t) ? glyph('anchor') : i + 1;
      // delta 는 전진 거리 변화: 전진하면 고국과의 거리가 줄어듦
      const dd = look.deltas?.[t] ?? 0;
      const delta = dd ? `<span class="delta ${dd > 0 ? 'up' : 'down'}">${dd > 0 ? '−' : '+'}${Math.abs(dd)}</span>` : '';
      const status = look.status?.[t];
      const style = `--i:${i};--x:${px.toFixed(2)}%${sail ? `;--from:${prev!.toFixed(2)}%` : ''}`;
      // 금빛 돛 핀이 정확히 거리 자리에 뜨고, 아래 말풍선에 함대 이름 (거리). 왕좌 복위는 말(진행 방향) 앞에 따로
      return `<li class="ship${look.active === t ? ' active' : ''}${sail ? ' sail' : ''}${home ? ' home' : ''}" style="${style}">
        ${home ? '<span class="ship-crown">왕좌 복위</span>' : ''}
        <span class="ship-pin">${art}<span class="ship-pos">${badge}</span></span>
        <span class="ship-tag"><b class="ship-name">${esc(teamName(t))}</b> <span class="ship-dist">(${distanceLabel(d)})</span>${delta}${status ? `<span class="ship-status">${status}</span>` : ''}</span>
      </li>`;
    })
    .join('');
  // 결승선: 이타카 왕궁과 기다리는 페넬로페
  const goal = look.goal
    ? `<div class="sea-goal${look.arrive?.length ? ' reached' : ''}" style="--goal:${GOAL_X}%">
        <div class="goal-art" aria-hidden="true">${glyph('greek-temple')}${glyph('queen-crown')}</div>
        <b>이타카 왕궁</b><small>${glyph('checkered-flag', 'inline')}결승선</small>
      </div>`
    : '';
  return `<section class="sea${look.goal ? ' has-goal' : ''}" style="--rows:${order.length};--port:${port.toFixed(2)}%">
    <div class="sea-waves" aria-hidden="true"></div>
    <div class="sea-land"><span>${glyph('greek-temple', 'inline')}이타카</span></div>
    ${goal}
    <div class="sea-ticks">${ticks.join('')}</div>
    <div class="sea-port"><span>${glyph('anchor', 'inline')}이타카 항구 0</span></div>
    <div class="sea-troy"><span>${glyph('crossed-swords', 'inline')}트로이 전장</span></div>
    <ol class="sea-ships">${ships}</ol>
  </section>`;
}
