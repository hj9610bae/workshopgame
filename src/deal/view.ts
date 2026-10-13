/* 사회자 화면·대표 폰이 함께 쓰는 화면 조각 */
import { esc } from '../ui';
import { AGENDAS, CARDS, FINAL_AGENDA, FINAL_OPEN_ROUND, QUEUE, ROUNDS, type TeamId } from './data';
import { agendaTitle } from './engine';
import type { GameEvent, PublicState, Stage, TableState } from './types';

let customNames: Partial<Record<TeamId, string>> = {};

/** 현장 진행 화면에서 정한 팀 이름 (비우면 기본값 'A팀') */
export const setTeamNames = (names: Partial<Record<TeamId, string>>): void => {
  customNames = names;
};

export const teamName = (t: TeamId): string => customNames[t]?.trim() || `${t}팀`;

export const STAGE_LABEL: Record<Stage, string> = {
  lobby: '대기실',
  order: '순서 발표',
  submit: '비공개 제출',
  reveal: '제안 공개',
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

export function rewardText(agendaId: number): string {
  const a = AGENDAS[agendaId];
  return `+${a.reward}${a.card ? ` · ${CARDS[a.card].name}` : ''}`;
}

export function tableCard(table: TableState, index: number, round: number): string {
  const no = index + 1;
  const isFinal = index === 3;
  const a = AGENDAS[table.agenda];
  const promos = table.promos.length
    ? `<div class="promos">${table.promos.map((t) => `<span class="chip">📣 ${t}</span>`).join('')}</div>`
    : '';
  if (!a) {
    const label = isFinal
      ? round < FINAL_OPEN_ROUND
        ? `🏁 ${FINAL_OPEN_ROUND}라운드 개시<br><strong>성과급 ${rewardText(FINAL_AGENDA)}</strong>`
        : '최종 교섭 종료'
      : '대기열 소진';
    return `<article class="table empty${isFinal ? ' final' : ''}"><div class="table-no">${no}번 테이블</div><p>${label}</p></article>`;
  }
  return `<article class="table${isFinal ? ' final' : ''}${table.frozen ? ' frozen' : ''}">
    <div class="table-no">${no}번 테이블${isFinal ? ' · 최종 교섭' : ''}</div>
    <h3>안건 ${a.id} · ${esc(a.title)}</h3>
    <p class="gap">${esc(a.union)} ➔ ${esc(a.company)}</p>
    <div class="table-stats">
      <div><span class="label">요구 수치</span><strong>?</strong><span class="muted"> / ${a.demand}</span></div>
      <div><span class="label">합의 보상</span><strong>${rewardText(a.id)}</strong></div>
    </div>
    ${promos}
    ${table.frozen ? '<div class="frozen-badge">⛔ 보류</div>' : ''}
  </article>`;
}

export function queueStrip(pub: PublicState): string {
  const rest = QUEUE.slice(pub.queue);
  if (!rest.length) return '<p class="muted">대기열이 비었어요</p>';
  return `<ol class="queue">${rest.map((id) => `<li>${esc(agendaTitle(id))} <span class="muted">${AGENDAS[id].demand}</span></li>`).join('')}</ol>`;
}

/** 사회자 화면에 띄울 사건 문장 */
export function describeEvent(e: GameEvent): { icon: string; title: string; detail?: string; tone?: 'deal' | 'bad' } {
  const team = e.team ? teamName(e.team) : '';
  const agenda = e.agenda ? `${agendaTitle(e.agenda)}` : '';
  const reward = e.reward ? `주도권 +${e.reward}${e.card ? ` · [${CARDS[e.card].name}] 획득` : ''}` : '';
  switch (e.kind) {
    case 'finalOpen':
      return { icon: '🏁', title: `최종 교섭 개시! ${e.table}번 테이블에 성과급 등장`, detail: `합의 보상 ${rewardText(FINAL_AGENDA)}`, tone: 'deal' };
    case 'practiceDeal':
      return { icon: '🤝', title: `비공개 실무 교섭 타결! ${team}, ${agenda} 합의`, detail: reward, tone: 'deal' };
    case 'start':
      return e.cutIn
        ? { icon: '⚡', title: '새치기 발생! 제안 순서가 바뀌었어요' }
        : { icon: '📨', title: '제안을 공개합니다' };
    case 'hold':
      return { icon: '⛔', title: `${e.table}번 테이블 안건 보류!`, detail: '이번 라운드 이 테이블에 대한 제안은 모두 무효', tone: 'bad' };
    case 'promoDeal':
      return { icon: '📣', title: `홍보물 효과! ${team}, ${agenda} 합의`, detail: reward, tone: 'deal' };
    case 'end':
      return { icon: '🔔', title: '라운드 종료', detail: '홍보물 효과 적용 완료' };
    case 'proposal':
      switch (e.result) {
        case 'deal':
          return { icon: '🎉', title: `${team}, ${agenda} 합의!`, detail: reward, tone: 'deal' };
        case 'promo':
          return { icon: '📣', title: `${team}, ${e.table}번 테이블에 홍보물 부착`, detail: '매 라운드 종료 시 요구 수치 1 감소' };
        case 'void':
          return {
            icon: '🚫',
            title: `${team} 제안 무효`,
            detail: e.reason === 'hold' ? `${e.table}번 테이블 보류` : e.reason === 'empty' ? `${e.table}번 테이블에 안건 없음` : undefined,
            tone: 'bad',
          };
        case 'pass':
          return { icon: '💤', title: `${team} 제출 없음 (패스)` };
        default:
          return { icon: '📝', title: `${team} 제안 완료`, detail: '아직 합의되지 않았습니다' };
      }
  }
}

export function eventItem(e: GameEvent, big = false): string {
  const d = describeEvent(e);
  return `<li class="event${d.tone ? ` ${d.tone}` : ''}${big ? ' big' : ''}"><span class="icon">${d.icon}</span>
    <div><strong>${esc(d.title)}</strong>${d.detail ? `<span class="muted">${esc(d.detail)}</span>` : ''}</div></li>`;
}

export const roundLabel = (pub: PublicState): string =>
  pub.stage === 'lobby' ? '대기실' : pub.stage === 'final' ? '최종 결과' : `라운드 ${pub.round}/${ROUNDS} · ${STAGE_LABEL[pub.stage]}`;

export function formatTimer(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
