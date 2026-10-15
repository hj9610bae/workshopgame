/* 교섭의 도박사들: 고정 데이터. 숫자를 조정할 때는 docs/rules.md 도 함께 수정하세요. */

export const TEAM_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
export type TeamId = (typeof TEAM_IDS)[number];

export const ROUNDS = 5;
export const START_SCORE = 10;
export const SUBMIT_SECONDS = 180;
/** 이 라운드 시작 시 4번 테이블(최종 교섭)이 열림 */
export const FINAL_OPEN_ROUND = 4;
export const TABLE_COUNT = 4;
export const SCOUT_COST = 1;
export const CUT_IN_COST = 2;

export type CardId = 'basic' | 'blitz' | 'practice' | 'promo' | 'hold';
export type SpecialCardId = Exclude<CardId, 'basic'>;

export const CARDS: Record<CardId, { name: string; power: number; desc: string }> = {
  basic: { name: '기본 제시안', power: 2, desc: '요구 수치 2 감소 · 매 라운드 사용' },
  blitz: { name: '전격 타결', power: 6, desc: '요구 수치 6 감소 · 1회용' },
  practice: {
    name: '실무 교섭 병행',
    power: 6,
    desc: '이번 라운드 그 테이블에서 합의가 나면 보상을 가로챔. 못 가로채면 다음 라운드 시작 시 6 감소 · 비공개',
  },
  promo: { name: '홍보물 발행', power: 1, desc: '제시안과 함께 추가로 냄. 테이블에 부착, 매 라운드 종료 시 1 감소' },
  hold: {
    name: '안건 보류',
    power: 0,
    desc: '제시안과 함께 추가로 냄. 이번 라운드 그 테이블의 모든 제안 무효 + 다음 라운드 그 테이블에 낸 우리 제안을 가장 먼저 적용',
  },
};

/** 제시안과 함께 '추가 카드'로 내는 특수 카드 */
export type ExtraCardId = 'promo' | 'hold';
export const EXTRA_CARDS: ExtraCardId[] = ['promo', 'hold'];

export const SPECIAL_CARDS: SpecialCardId[] = ['blitz', 'practice', 'promo', 'hold'];

export interface Agenda {
  id: number;
  /** 제목에 맞는 픽토그램 */
  icon: string;
  title: string;
  /** 노조 요구안 (테이블에 공개) */
  union: string;
  /** 회사 제시안 = 실제 타결 내용 (합의되는 순간 공개) */
  company: string;
  demand: number;
  reward: number;
  /** 겉보기와 실제가 다른 안건: hard = 보상은 작은데 수치가 큼(난항), easy = 보상은 큰데 수치가 작음(원만) */
  fake?: 'hard' | 'easy';
}

const list: Agenda[] = [
  { id: 3, icon: '🩺', title: '검진비', union: '10만 원 인상', company: '(수면비) 5만 원 인상', demand: 2, reward: 2 },
  { id: 5, icon: '👶', title: '난임시술', union: '본인부담금 100% & 100만 원 인상', company: '100% 지원', demand: 3, reward: 2 },
  { id: 8, icon: '🏃', title: '체육대회', union: '체육대회 실시', company: '가족초청 행사 실시', demand: 3, reward: 3 },
  { id: 12, icon: '🔌', title: '전기차', union: '충전소 확대', company: '사내 완속 충전기 추가 설치', demand: 8, reward: 2, fake: 'hard' },
  { id: 2, icon: '💪', title: '근속/건강', union: '41,182원 인상', company: '수당 5,045원 인상', demand: 5, reward: 4 },
  { id: 7, icon: '✈️', title: '해외연수', union: '해외연수 재개', company: '2027년 조건부 시행', demand: 5, reward: 4 },
  { id: 4, icon: '🎁', title: '복지포인트', union: '80만P 인상', company: '선택형 10만P 인상', demand: 6, reward: 4 },
  { id: 6, icon: '⏰', title: '근무제도', union: '상주 자율근무제', company: '상주 휴식플러스제', demand: 6, reward: 5 },
  { id: 9, icon: '🏦', title: '복지기금', union: '200억 출연', company: '후생제도 개선 TF 구성', demand: 3, reward: 7, fake: 'easy' },
  { id: 10, icon: '📋', title: '제도개선', union: '전사제도개선위', company: '임금제도개선위 구성', demand: 8, reward: 6 },
  { id: 1, icon: '💵', title: '기본급', union: '179,320원 인상', company: '80,000원 인상', demand: 10, reward: 8 },
  { id: 11, icon: '💰', title: '성과급', union: "'25년 대비 150%", company: '300%+500만 원+30만 원', demand: 12, reward: 10 },
];

export const AGENDAS: Record<number, Agenda> = Object.fromEntries(list.map((a) => [a.id, a]));

/** 1~3번 테이블의 처음 안건 */
export const INITIAL_TABLES = [3, 5, 8];
/** 1~3번 테이블에서 합의되면 순서대로 보충되는 대기열 */
export const QUEUE = [12, 2, 7, 4, 6, 9, 10, 1];
/** 4라운드에 4번 테이블로 열리는 최종 교섭 안건 */
export const FINAL_AGENDA = 11;

/** 전리품(특수 카드)은 안건과 따로 정하고, 테이블에 오르는 순서대로 앞쪽 안건에 하나씩 붙임. 화면에는 '특수 카드'로만 표시 */
export const LOOT_ORDER: SpecialCardId[] = ['promo', 'hold', 'blitz', 'blitz', 'practice'];
export const LOOT: Partial<Record<number, SpecialCardId>> = Object.fromEntries(
  [...INITIAL_TABLES, ...QUEUE].slice(0, LOOT_ORDER.length).map((id, i) => [id, LOOT_ORDER[i]]),
);

/** 안건 배치·요구 수치·전리품. 실제 게임은 SETUP, 연습 게임은 무작위로 만든 배치를 씀 */
export interface Setup {
  tables: number[];
  queue: number[];
  demand: Record<number, number>;
  loot: Partial<Record<number, SpecialCardId>>;
}

export const SETUP: Setup = {
  tables: INITIAL_TABLES,
  queue: QUEUE,
  demand: Object.fromEntries(list.map((a) => [a.id, a.demand])),
  loot: LOOT,
};

/** 마지막에 공개하는 안건 순서 (테이블에 오르는 순서, 성과급 마지막) */
export const ALL_AGENDAS = [...INITIAL_TABLES, ...QUEUE, FINAL_AGENDA];
