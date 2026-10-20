/*
 * Firebase 데이터 구조 (rooms/{code}/...)
 *   hostId                     사회자 uid
 *   pub                        공개 상태 (모두 읽기)
 *   secret                     남은 수치 등 (사회자만)
 *   teams/{team}               { repUid, online } 대표 정보 (모두 읽기)
 *   private/{team}             { hand, notes, scouts } (그 팀 대표 + 사회자)
 *   submissions/{team}         이번 라운드 제출 (대표가 쓰고 사회자가 읽음)
 *   requests/{team}/{id}       스카우터 요청 (대표가 쓰고 사회자가 처리)
 * 접근 권한은 database.rules.json 참고
 */
import { push, runTransaction, set, update } from 'firebase/database';
import { clean, roomRef } from '../room';
import { TEAM_IDS, type TeamId } from './data';
import { emptyHand, type EngineState, type Step } from './engine';
import type { GameEvent, Hand, Note, PublicState, ScoutResult, SecretState, Submission, TableState } from './types';

export interface TeamSlot {
  repUid?: string;
  online?: boolean;
}

export interface PrivateData {
  hand: Hand;
  notes: Note[];
  scouts: ScoutResult[];
}

/** 사회자가 읽는 방 전체 */
export interface HostRoom {
  hostId: string;
  pub: PublicState;
  secret: SecretState;
  teams: Partial<Record<TeamId, TeamSlot>>;
  hands: Partial<Record<TeamId, Hand>>;
  submissions: Partial<Record<TeamId, Submission>>;
  requests: Partial<Record<TeamId, Record<string, { table: number }>>>;
}

/* Firebase 는 빈 배열·객체를 저장하지 않으므로 읽을 때 기본값을 채워요. */

const normTable = (t: Partial<TableState> | undefined): TableState => ({
  agenda: t?.agenda ?? 0,
  frozen: t?.frozen ?? false,
  promos: t?.promos ?? [],
  done: t?.done ?? [],
});

const normEvent = (e: GameEvent): GameEvent => ({
  ...e,
  tables: (e.tables ?? []).map(normTable),
  scores: e.scores ?? {},
});

export function normPub(raw: Partial<PublicState> | null): PublicState {
  const r = raw ?? {};
  return {
    stage: r.stage ?? 'lobby',
    round: r.round ?? 0,
    deadline: r.deadline ?? 0,
    teamIds: r.teamIds ?? [],
    order: r.order ?? [],
    prevOrder: r.prevOrder ?? [],
    tables: Array.from({ length: 4 }, (_, i) => normTable(r.tables?.[i])),
    queue: r.queue ?? 0,
    teams: r.teams ?? {},
    events: (r.events ?? []).map(normEvent),
    revealed: r.revealed ?? 0,
  };
}

const normHand = (h: Partial<Hand> | undefined): Hand => ({ ...emptyHand(), ...h });

export function normPrivate(raw: { hand?: Partial<Hand>; notes?: Record<string, Note>; scouts?: Record<string, ScoutResult> } | null): PrivateData {
  return {
    hand: normHand(raw?.hand),
    notes: Object.values(raw?.notes ?? {}),
    scouts: Object.values(raw?.scouts ?? {}),
  };
}

export function normHostRoom(raw: any): HostRoom | null {
  if (!raw) return null;
  const remaining: number[] = raw.secret?.remaining ?? [];
  return {
    hostId: raw.hostId,
    pub: normPub(raw.pub),
    secret: {
      remaining: Array.from({ length: 4 }, (_, i) => remaining[i] ?? 0),
      trail: Array.from({ length: 4 }, (_, i) => raw.secret?.trail?.[i] ?? []),
      practice: raw.secret?.practice ?? [],
      priority: raw.secret?.priority ?? [],
    },
    teams: raw.teams ?? {},
    hands: Object.fromEntries(TEAM_IDS.map((t) => [t, normHand(raw.private?.[t]?.hand)])),
    submissions: raw.submissions ?? {},
    requests: raw.requests ?? {},
  };
}

export const engineState = (room: HostRoom): EngineState => ({ pub: room.pub, secret: room.secret, hands: room.hands });

/** 엔진 진행 결과를 한 번에 저장 (공개 상태, 비밀 상태, 팀별 카드·메시지) */
export function saveStep(code: string, step: Step, extra: Record<string, unknown> = {}): Promise<void> {
  const { pub, secret, hands } = step.state;
  const patch: Record<string, unknown> = { pub: clean(pub), secret: clean(secret), ...extra };
  for (const t of pub.teamIds) {
    patch[`private/${t}/hand`] = hands[t] ?? emptyHand();
    for (const n of step.notes[t] ?? []) {
      const key = push(roomRef(code, `private/${t}/notes`)).key!;
      patch[`private/${t}/notes/${key}`] = { ...n, round: pub.round } satisfies Note;
    }
  }
  return update(roomRef(code), patch);
}

/* ── 대표 폰에서 쓰는 함수 ── */

/** 팀 대표 자리 차지. 이미 다른 사람이 있으면 false */
export async function claimTeam(code: string, team: TeamId, uid: string): Promise<boolean> {
  const result = await runTransaction(roomRef(code, `teams/${team}/repUid`), (current) =>
    current === null ? uid : undefined,
  );
  return result.committed;
}

export const releaseTeam = (code: string, team: TeamId): Promise<void> => set(roomRef(code, `teams/${team}/repUid`), null);

export const submitProposal = (code: string, team: TeamId, sub: Submission): Promise<void> =>
  set(roomRef(code, `submissions/${team}`), sub);

export const requestScout = (code: string, team: TeamId, table: number): Promise<void> =>
  set(push(roomRef(code, `requests/${team}`)), { table });
