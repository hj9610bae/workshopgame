/* 사회자 화면·대표 폰이 함께 쓰는 화면 조각 */
import { esc } from '../ui';
import { AGENDAS, CARDS, FINAL_AGENDA, FINAL_OPEN_ROUND, ROUNDS, SETUP, type CardId, type Setup, type SpecialCardId, type TeamId } from './data';
import { agendaTitle } from './engine';
import type { GameEvent, PublicState, Stage, TableState } from './types';

let customNames: Partial<Record<TeamId, string>> = {};

/** 현장 진행 화면에서 정한 함대 이름 (비우면 기본값 'A함대') */
export const setTeamNames = (names: Partial<Record<TeamId, string>>): void => {
  customNames = names;
};

export const teamName = (t: TeamId): string => customNames[t]?.trim() || `${t}함대`;

let setup: Setup = SETUP;

/** 지금 그리는 게임의 역경 배치 (연습 게임은 무작위 배치). 대기열·생명력·전리품 표시에 씀 */
export const useSetup = (s: Setup | undefined): void => {
  setup = s ?? SETUP;
};

export const activeSetup = (): Setup => setup;

export const STAGE_LABEL: Record<Stage, string> = {
  lobby: '출항 대기',
  order: '순서 발표',
  submit: '비공개 제출',
  reveal: '공격 공개',
  final: '최종 결과',
};

/** 공개 연출 중에는 마지막으로 공개된 사건 시점의 테이블·점수를 보여줘요. */
export function snapshot(pub: PublicState): { tables: TableState[]; scores: Partial<Record<TeamId, number>> } {
  const shown = pub.stage === 'reveal' ? pub.events[pub.revealed - 1] : undefined;
  if (shown) return { tables: shown.tables, scores: shown.scores };
  return {
    tables: pub.tables,
    scores: Object.fromEntries(pub.teamIds.map((t) => [t, pub.teams[t]?.score ?? 0])),
  };
}

/** 처음 생명력 (공개) = 돌파 시 전진 거리 */
export const hpOf = (agendaId: number): number => setup.demand[agendaId] ?? AGENDAS[agendaId]?.demand ?? 0;

/** 돌파 시 받는 전리품 (특수 무기) */
export const lootOf = (agendaId: number): SpecialCardId | undefined => setup.loot[agendaId];

/** 돌파 보상: 전진 거리 + 전리품 무기 이름 */
export function rewardText(agendaId: number): string {
  const loot = lootOf(agendaId);
  return `${hpOf(agendaId)}해리 전진${loot ? ` · ${CARDS[loot].icon} ${CARDS[loot].short}` : ''}`;
}

export function tableCard(table: TableState, index: number, round: number): string {
  const no = index + 1;
  const isFinal = index === 3;
  const a = AGENDAS[table.agenda];
  const promos = table.promos.length
    ? `<div class="promos">${table.promos.map((t) => `<span class="chip">${CARDS.promo.icon} ${t}</span>`).join('')}</div>`
    : '';
  if (!a) {
    const label = isFinal
      ? round < FINAL_OPEN_ROUND
        ? `👑 ${FINAL_OPEN_ROUND}일차 개시<br><strong>${esc(agendaTitle(FINAL_AGENDA))} ${rewardText(FINAL_AGENDA)}</strong>`
        : '최종 결전 종료'
      : '대기열 소진';
    return `<article class="table empty${isFinal ? ' final' : ''}"><div class="table-no">${no}번 해역</div><p>${label}</p></article>`;
  }
  return `<article class="table${isFinal ? ' final' : ''}${table.frozen ? ' frozen' : ''}">
    <div class="table-no">${no}번 해역${isFinal ? ' · 최종 결전' : ''}</div>
    <h3>${a.icon} ${esc(a.title)}</h3>
    <p class="gap">생명력 ${hpOf(a.id)}</p>
    <div class="table-stats">
      <div><span class="label">돌파 보상</span><strong>${rewardText(a.id)}</strong></div>
    </div>
    ${promos}
    ${table.frozen ? `<div class="frozen-badge">${CARDS.hold.icon} 동결</div>` : ''}
  </article>`;
}

export function queueStrip(pub: PublicState): string {
  const rest = setup.queue.slice(pub.queue);
  if (!rest.length) return '<p class="muted">대기열이 비었어요</p>';
  return `<ol class="queue">${rest.map((id) => `<li>${AGENDAS[id].icon} ${esc(agendaTitle(id))}</li>`).join('')}</ol>`;
}

/** 받침에 맞춘 조사 '으로/로' (받침 없거나 ㄹ 받침이면 '로') */
function ro(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const jong = code >= 0 && code < 11172 ? code % 28 : 0;
  return jong === 0 || jong === 8 ? '로' : '으로';
}

/** 마지막 일격의 무기: '🗡️ 기본 무기 단검으로' / '🔱 특수 무기 삼지창으로' (게임 화면이라 짧은 이름) */
export function weaponPhrase(card: CardId): string {
  const c = CARDS[card];
  return `${c.icon} ${card === 'basic' ? '기본' : '특수'} 무기 ${c.short}${ro(c.short)}`;
}

/** 특수 무기는 다른 함대가 효과를 모르니 돌파 발표에 짧은 효과 설명을 붙임 (전갈 화살은 꽂을 때 이미 효과를 발표해서 생략) */
const effectNote = (card: CardId | undefined): string =>
  card && card !== 'basic' && card !== 'promo' ? `${CARDS[card].icon} ${CARDS[card].short}: ${CARDS[card].effect} · ` : '';

/** 공개 화면에 띄울 사건 문장 */
export function describeEvent(e: GameEvent): {
  icon: string;
  title: string;
  detail?: string;
  tone?: 'deal' | 'bad';
} {
  const team = e.team ? teamName(e.team) : '';
  const agenda = e.agenda ? `${agendaTitle(e.agenda)}` : '';
  const reward = e.reward ? `고국으로 ${e.reward}해리 전진${e.loot ? ` · ${CARDS[e.loot].icon} ${CARDS[e.loot].short} 획득` : ''}` : '';
  const firstMark = e.first ? ' (쇠사슬 우선권으로 먼저)' : '';
  switch (e.kind) {
    case 'finalOpen':
      return { icon: '👑', title: `최종 결전 개시! ${e.table}번 해역에 ${agendaTitle(FINAL_AGENDA)} 등장`, detail: `생명력 ${hpOf(FINAL_AGENDA)} · 돌파 보상 ${rewardText(FINAL_AGENDA)}`, tone: 'deal' };
    case 'practiceDeal':
      return { icon: '⚡', title: `${team}, ${weaponPhrase('practice')} ${agenda} 돌파!`, detail: `${effectNote('practice')}${reward}`, tone: 'deal' };
    case 'start':
      return e.cutIn
        ? { icon: '🌬️', title: '제피로스의 순풍! 공격 순서가 바뀌었어요', detail: e.order?.map(teamName).join(' → ') }
        : { icon: '⚔️', title: '공격을 공개합니다' };
    case 'hold':
      return { icon: CARDS.hold.icon, title: `${team ? `${team}, ` : ''}${CARDS.hold.short}로 ${e.table}번 해역 동결!`, detail: '오늘 이 해역에 대한 공격은 모두 무효', tone: 'bad' };
    case 'promoDeal':
      return { icon: CARDS.promo.icon, title: `${team}, ${weaponPhrase('promo')} ${agenda} 돌파!`, detail: `${effectNote('promo')}${reward}`, tone: 'deal' };
    case 'end':
      return { icon: '🌙', title: '오늘의 항해 끝' };
    case 'steal': {
      // 투척 창 주인의 차례: 앞서 돌파한 함대의 전진을 가로챔
      const victim = e.victim ? teamName(e.victim) : '';
      return {
        icon: CARDS.practice.icon,
        title: `${team}, ${CARDS.practice.short}으로 ${victim}의 ${agenda} 돌파를 가로챘다!`,
        detail: `${CARDS.practice.icon} ${CARDS.practice.short}: 그날 그 해역의 돌파 보상을 가로챔 · ${victim} ${e.reward}해리 후퇴, ${team} ${e.reward}해리 전진${e.loot ? ` · ${CARDS[e.loot].icon} ${CARDS[e.loot].short} 획득` : ''}`,
        tone: 'deal',
      };
    }
    case 'proposal':
      switch (e.result) {
        case 'deal':
          return { icon: '🎉', title: `${team}, ${e.weapon ? `${weaponPhrase(e.weapon)} ` : ''}${agenda} 돌파!${firstMark}`, detail: `${effectNote(e.weapon)}${reward}`, tone: 'deal' };
        case 'promo':
          return { icon: CARDS.promo.icon, title: `${team}, ${e.table}번 해역에 ${CARDS.promo.short}`, detail: '매일 끝날 때 생명력 1 감소' };
        case 'void':
          // 동결된 해역에 낸 공격은 평소 공격과 똑같이 보여 줌 (동결 표식은 해역에 계속 남아 있고, 낸 해역도 드러나지 않게)
          if (e.reason === 'hold') return { icon: '⚔️', title: `${team} 공격 완료${firstMark}`, detail: '역경은 아직 버티고 있습니다' };
          return {
            icon: '🚫',
            title: `${team} 공격 무효`,
            detail: e.reason === 'empty' ? `${e.table}번 해역에 역경 없음` : undefined,
            tone: 'bad',
          };
        case 'pass':
          return { icon: '💤', title: `${team} 제출 없음 (쉼)` };
        default:
          return { icon: '⚔️', title: `${team} 공격 완료${firstMark}`, detail: '역경은 아직 버티고 있습니다' };
      }
  }
}

export function eventItem(e: GameEvent, big = false): string {
  const d = describeEvent(e);
  return `<li class="event${d.tone ? ` ${d.tone}` : ''}${big ? ' big' : ''}"><span class="icon">${d.icon}</span>
    <div><strong>${esc(d.title)}</strong>${d.detail ? `<span class="muted">${esc(d.detail)}</span>` : ''}</div></li>`;
}

export const roundLabel = (pub: PublicState): string =>
  pub.stage === 'lobby' ? '출항 대기' : pub.stage === 'final' ? '최종 결과' : `${pub.round}일차/${ROUNDS}일차 · ${STAGE_LABEL[pub.stage]}`;

export function formatTimer(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
