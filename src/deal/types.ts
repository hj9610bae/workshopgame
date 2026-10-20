import type { CardId, ExtraCardId, SpecialCardId, TeamId } from './data';

/** 역경의 생명력을 깎은 기록 (비공개, 진행자 창에만) */
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

/** 공개 화면에 보이는 사건. 남은 생명력·낸 무기·공격 이력 같은 비공개 정보는 담지 않음 */
export interface GameEvent {
  kind: EventKind;
  team?: TeamId;
  table?: number;
  agenda?: number;
  reward?: number;
  /** 돌파로 받은 전리품 (역경 카드에 이름이 공개돼 있음) */
  loot?: SpecialCardId;
  /** 돌파 사건: 마지막 일격에 쓴 무기 (공격 이력은 비공개지만 마지막 일격의 무기는 공개) */
  weapon?: CardId;
  result?: ProposalResult;
  reason?: VoidReason;
  /** 합의 사건: 실무 교섭 병행으로 보상을 가로챈 팀 */
  stolenBy?: TeamId;
  /** proposal: 지난 라운드 안건 보류 우선권으로 순번보다 먼저 적용됨 */
  first?: boolean;
  /** start: 새치기로 순서가 바뀌었는지, 바뀐 순서 */
  cutIn?: boolean;
  order?: TeamId[];
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
  /** 구조선 hidden event (RESCUE_ROUND 공개 뒤). 예전 저장 게임엔 없음 */
  rescue?: RescueState;
}

/** 구조선: 1등을 뺀 함대(candidates) 중 가위바위보로 뽑힌 함대(chosen)가 탈지(boarded) 정함 */
export interface RescueState {
  phase: 'offer' | 'done';
  candidates: TeamId[];
  chosen?: TeamId;
  boarded?: boolean;
}

/** Firebase rooms/{code}/secret — 사회자만 읽음 */
export interface SecretState {
  /** index 0~3 → 테이블별 남은 요구 수치 */
  remaining: number[];
  /** index 0~3 → 테이블에 올라온 안건이 지금까지 깎인 이력 */
  trail: Hit[][];
  /** 다음 라운드 시작 시 발동할 실무 교섭 병행 (가로채기에 실패한 카드의 −6) */
  practice: { team: TeamId; table: number }[];
  /** 다음 라운드에 그 테이블에 낸 제안을 가장 먼저 적용받는 팀 (지난 라운드 안건 보류). 예전 저장 게임엔 없음 */
  priority?: { team: TeamId; table: number }[];
}

export type Hand = Record<SpecialCardId, number>;

/** Firebase rooms/{code}/submissions/{team} — 대표가 쓰고 사회자가 읽음 */
export interface Submission {
  table: number;
  card: CardId;
  /** 새치기로 원하는 순번 (1부터). 0이면 사용 안 함 */
  cutIn: number;
  /** 제시안과 함께 추가로 내는 특수 카드 (홍보물·안건 보류) */
  extra?: { card: ExtraCardId; table: number };
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
