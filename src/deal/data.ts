/* 교섭의 도박사들: 고정 데이터. 숫자를 조정할 때는 docs/rules.md 도 함께 수정하세요. */

export const TEAM_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
export type TeamId = (typeof TEAM_IDS)[number];

export const ROUNDS = 5;
export const START_SCORE = 10;
export const SUBMIT_SECONDS = 120;
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
  practice: { name: '실무 교섭 병행', power: 10, desc: '다음 라운드 시작 시 10 감소 · 비공개' },
  promo: { name: '홍보물 발행', power: 1, desc: '테이블에 부착, 매 라운드 종료 시 1 감소' },
  hold: { name: '안건 보류', power: 0, desc: '이번 라운드 그 테이블의 모든 제안 무효' },
};

export const SPECIAL_CARDS: SpecialCardId[] = ['blitz', 'practice', 'promo', 'hold'];

export interface Agenda {
  id: number;
  title: string;
  union: string;
  company: string;
  demand: number;
  reward: number;
  card?: SpecialCardId;
}

const list: Agenda[] = [
  { id: 3, title: '검진비', union: '10만 원 인상', company: '(수면비) 5만 원 인상', demand: 2, reward: 2 },
  { id: 5, title: '난임시술', union: '본인부담금 100% & 100만 원 인상', company: '100% 지원', demand: 3, reward: 2 },
  { id: 8, title: '체육대회', union: '체육대회 실시', company: '가족초청 행사 실시', demand: 3, reward: 3 },
  { id: 12, title: '전기차', union: '충전소 확대', company: '사내 완속 충전기 추가 설치', demand: 4, reward: 3 },
  { id: 2, title: '근속/건강', union: '41,182원 인상', company: '수당 5,045원 인상', demand: 5, reward: 4, card: 'blitz' },
  { id: 7, title: '해외연수', union: '해외연수 재개', company: '2027년 조건부 시행', demand: 5, reward: 4, card: 'blitz' },
  { id: 4, title: '복지포인트', union: '80만P 인상', company: '선택형 10만P 인상', demand: 6, reward: 4, card: 'hold' },
  { id: 6, title: '근무제도', union: '상주 자율근무제', company: '상주 휴식플러스제', demand: 6, reward: 5, card: 'promo' },
  { id: 9, title: '복지기금', union: '200억 출연', company: '후생제도 개선 TF 구성', demand: 8, reward: 7 },
  { id: 10, title: '제도개선', union: '전사제도개선위', company: '임금제도개선위 구성', demand: 8, reward: 6 },
  { id: 1, title: '기본급', union: '179,320원 인상', company: '80,000원 인상', demand: 10, reward: 8, card: 'practice' },
  { id: 11, title: '성과급', union: "'25년 대비 150%", company: '300%+500만 원+30만 원', demand: 12, reward: 10 },
];

export const AGENDAS: Record<number, Agenda> = Object.fromEntries(list.map((a) => [a.id, a]));

/** 1~3번 테이블의 처음 안건 */
export const INITIAL_TABLES = [3, 5, 8];
/** 1~3번 테이블에서 합의되면 순서대로 보충되는 대기열 */
export const QUEUE = [12, 2, 7, 4, 6, 9, 10, 1];
/** 4라운드에 4번 테이블로 열리는 최종 교섭 안건 */
export const FINAL_AGENDA = 11;
