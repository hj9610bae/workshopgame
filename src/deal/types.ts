import type { CardId, SpecialCardId, TeamId } from './data';

/** 안건의 요구 수치를 깎은 기록 (합의되기 전까지 비공개) */
export interface Hit {
  team: TeamId;
  card: CardId;
  amount: number;
}

/** lobby: 대기실 · order: 순서 발표 · submit: 비공개 제출 · reveal: 제안 공개 · final: 최종 결과 */
export type Stage = 'lobby' | 'order' | 'submit' | 'reveal' | 'final';

export interface TableState {
  /** 안건 번호. 0이면 비어 있음(대기열 소진, 또는 아직 열리지 않았거나 닫힌 4번 테이블) */
  agenda: number;
  frozen: boolean;
  /** 홍보물을 부착한 팀 (부착 순서) */
  promos: TeamId[];
  /** 이 테이블에서 합의되어 지나간 안건 (오래된 것부터). 테이블에 쌓이는 연출용, 예전 저장 게임엔 없음 */
  done?: { agenda: number; team: TeamId }[];
}

export interface TeamState {
  score: number;
  deals: number;
}

export type EventKind = 'finalOpen' | 'practiceDeal' | 'start' | 'hold' | 'proposal' | 'promoDeal' | 'end';
export type ProposalResult = 'done' | 'deal' | 'promo' | 'void' | 'pass';
export type VoidReason = 'hold' | 'empty' | 'invalid';

/** 사회자 화면에 공개되는 사건. 남은 수치나 낸 카드 같은 비공개 정보는 담지 않음 (합의된 안건의 이력만 예외) */
export interface GameEvent {
  kind: EventKind;
  team?: TeamId;
  table?: number;
  agenda?: number;
  reward?: number;
  /** 합의로 특수 카드를 받았는지 (어떤 카드인지는 비공개) */
  loot?: boolean;
  result?: ProposalResult;
  reason?: VoidReason;
  /** start: 새치기로 순서가 바뀌었는지, 바뀐 순서 */
  cutIn?: boolean;
  order?: TeamId[];
  /** 합의 사건: 블라인드였던 처음 요구 수치와 깎인 이력 (합의 순간에 공개) */
  demand?: number;
  trail?: Hit[];
  /** 이 사건 직후의 테이블·점수 (공개 연출용) */
  tables: TableState[];
  scores: Partial<Record<TeamId, number>>;
}

/** Firebase rooms/{code}/pub — 모두가 읽는 공개 상태 */
export interface PublicState {
  stage: Stage;
  round: number;
  /** 제출 마감 시각 (서버 기준 ms) */
  deadline: number;
  /** 게임에 참여하는 팀 (게임 시작 시 대표가 접속한 팀) */
  teamIds: TeamId[];
  order: TeamId[];
  prevOrder: TeamId[];
  /** index 0~3 → 1~4번 테이블 */
  tables: TableState[];
  /** 다음에 보충될 QUEUE 인덱스 */
  queue: number;
  teams: Partial<Record<TeamId, TeamState>>;
  events: GameEvent[];
  /** 사회자 화면에 공개된 사건 수 */
  revealed: number;
}

/** Firebase rooms/{code}/secret — 사회자만 읽음 */
export interface SecretState {
  /** index 0~3 → 테이블별 남은 요구 수치 */
  remaining: number[];
  /** index 0~3 → 테이블에 올라온 안건이 지금까지 깎인 이력 */
  trail: Hit[][];
  /** 다음 라운드 시작 시 발동할 실무 교섭 병행 */
  practice: { team: TeamId; table: number }[];
}

export type Hand = Record<SpecialCardId, number>;

/** Firebase rooms/{code}/submissions/{team} — 대표가 쓰고 사회자가 읽음 */
export interface Submission {
  table: number;
  card: CardId;
  /** 새치기로 원하는 순번 (1부터). 0이면 사용 안 함 */
  cutIn: number;
}

/** 팀에게만 보이는 결과 메시지. reveal 단계 메시지는 해당 사건이 공개된 뒤에 보여줌 */
export interface Note {
  round: number;
  phase: 'start' | 'reveal';
  event: number;
  text: string;
}

export interface ScoutResult {
  round: number;
  table: number;
  agenda?: number;
  remaining?: number;
  error?: string;
}
