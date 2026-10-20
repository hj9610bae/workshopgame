/* 오디세이아 : 귀환의 항해 — 고정 데이터. 숫자를 조정할 때는 docs/rules.md 도 함께 수정하세요. */

export const TEAM_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
export type TeamId = (typeof TEAM_IDS)[number];

/** 10일간의 항해 */
export const ROUNDS = 10;
/**
 * 엔진 내부 점수(전진한 거리). 화면에는 '고국과의 거리'(distanceOf)로 바꿔 보여 줌.
 * 아이템 비용을 낼 만큼 점수가 남아 있어야 하는 규칙 때문에 0이 아닌 값에서 시작
 */
export const START_SCORE = 10;
/** 출발 시 고국(이타카)까지의 거리 (해리) */
export const START_DISTANCE = 15;
/** 고국과의 거리: 작을수록(음수면 내륙까지) 좋음 */
export const distanceOf = (score: number): number => START_DISTANCE + START_SCORE - score;
export const SUBMIT_SECONDS = 180;
/** 이 일차 순서 발표 때 4번 해역(최종 결전)이 생김. 그 전에는 화면에 4번 해역이 없음 */
export const FINAL_OPEN_ROUND = 8;
export const TABLE_COUNT = 4;
export const SCOUT_COST = 1;
export const CUT_IN_COST = 2;

export const SCOUT_NAME = '아폴론의 예지';
export const CUT_IN_NAME = '제피로스의 순풍';

export type CardId = 'basic' | 'blitz' | 'practice' | 'promo' | 'hold';
export type SpecialCardId = Exclude<CardId, 'basic'>;

/** icon·power 는 화면에 쓰는 픽토그램과 공격력 표기 (역경 카드와 같은 양식의 무기 카드) */
/** effect: 돌파 발표에 붙이는 짧은 효과 설명 (다른 함대는 특수 무기 효과를 모르므로) */
export const CARDS: Record<CardId, { name: string; icon: string; power: number; powerText: string; effect: string; desc: string }> = {
  basic: { name: '단검', icon: '🗡️', power: 2, powerText: '−2', effect: '생명력 2 감소', desc: '생명력 2 감소 · 매일 사용' },
  blitz: { name: '아폴론의 전갈 화살', icon: '🏹', power: 6, powerText: '−6', effect: '생명력 6 감소', desc: '생명력 6 감소 · 1회용' },
  practice: {
    name: '헤르메스의 투척 창',
    icon: '🎯',
    power: 6,
    powerText: '가로채기',
    effect: '가로챌 돌파가 없으면 다음 날 시작 시 생명력 6 감소',
    desc: '오늘 그 해역에서 역경이 쓰러지면 전진 보상을 가로챔. 못 가로채면 다음 날 시작 시 6 감소 · 비공개',
  },
  promo: { name: '아테나의 쇠사슬', icon: '⛓️', power: 1, powerText: '매일 −1', effect: '해역에 걸어 두면 매일 끝날 때 생명력 1 감소', desc: '공격 무기와 함께 추가로 냄. 해역에 걸어 두면 매일 끝날 때 1 감소' },
  hold: {
    name: '포세이돈의 삼지창',
    icon: '🔱',
    power: 0,
    powerText: '동결',
    effect: '그날 그 해역의 모든 공격 무효',
    desc: '공격 무기와 함께 추가로 냄. 오늘 그 해역을 동결해 모든 공격 무효 + 다음 날 그 해역에 낸 우리 공격을 가장 먼저 적용',
  },
};

/** 공격 무기와 함께 '추가 카드'로 내는 특수 무기 */
export type ExtraCardId = 'promo' | 'hold';
export const EXTRA_CARDS: ExtraCardId[] = ['promo', 'hold'];

export const SPECIAL_CARDS: SpecialCardId[] = ['blitz', 'practice', 'promo', 'hold'];

/** 난이도 구간: 하(소형) · 중 · 상(대형) */
export type Tier = 'low' | 'mid' | 'high';
export const TIER_LABEL: Record<Tier, string> = { low: '🟢 하', mid: '🟡 중', high: '🔴 상' };

/** 신화 속 역경 (규칙 엔진에서는 '안건') */
export interface Agenda {
  id: number;
  /** 픽토그램 */
  icon: string;
  title: string;
  /** 이 역경에 겹쳐 둔 실제 교섭 안건 (비어 있으면 항해 일지에 표시 안 함) */
  topic: string;
  /** 처음 생명력 (공개). 돌파하면 이만큼 고국으로 전진 */
  demand: number;
  tier: Tier;
}

const list: Agenda[] = [
  { id: 1, icon: '🌸', title: '망각의 로투스 섬', topic: '검진비', demand: 2, tier: 'low' },
  { id: 2, icon: '🌬️', title: '아이올로스의 바람 자루', topic: '난임시술', demand: 3, tier: 'low' },
  { id: 3, icon: '🏛️', title: '외경의 거대 충전소', topic: '전기차', demand: 4, tier: 'mid' },
  { id: 4, icon: '🐖', title: '키르케의 환락', topic: '체육대회', demand: 3, tier: 'low' },
  { id: 5, icon: '🍇', title: '디오니소스의 포도밭', topic: '휴게실 개선', demand: 2, tier: 'low' },
  { id: 6, icon: '📜', title: '헤르메스의 기상 계약', topic: '안무/안전구', demand: 3, tier: 'low' },
  { id: 7, icon: '🐮', title: '태양신의 금기된 소', topic: '근속/건강', demand: 5, tier: 'mid' },
  { id: 8, icon: '🧜‍♀️', title: '세이렌의 달콤한 노래', topic: '해외연수', demand: 5, tier: 'mid' },
  { id: 9, icon: '🌀', title: '카리브디스의 소용돌이', topic: '복지포인트', demand: 6, tier: 'mid' },
  { id: 10, icon: '👹', title: '식인 거인 라이스트리곤', topic: '제도개선위', demand: 8, tier: 'high' },
  { id: 11, icon: '🌊', title: '포세이돈의 풍랑', topic: '근무제도', demand: 6, tier: 'mid' },
  { id: 12, icon: '🦉', title: '미네르바의 밤안개', topic: '유급휴가 확대', demand: 5, tier: 'mid' },
  { id: 13, icon: '🛡️', title: '아레스의 군신 장막', topic: '사내 복지제도', demand: 6, tier: 'mid' },
  { id: 14, icon: '🪨', title: '머리 여섯의 괴물 스킬라', topic: '사내복지기금', demand: 8, tier: 'high' },
  { id: 15, icon: '🐉', title: '히드라의 아홉 머리', topic: '통상임금 확장', demand: 9, tier: 'high' },
  { id: 16, icon: '👁️', title: '외눈박이 거인 키클롭스', topic: '기본급', demand: 10, tier: 'high' },
  { id: 17, icon: '🌋', title: '헤파이스토스의 거대 용암', topic: '임금피크제 폐지', demand: 10, tier: 'high' },
  { id: 18, icon: '👑', title: '이타카의 최종 결전', topic: '성과급', demand: 12, tier: 'high' },
  // v3.3 추가 (교섭 안건은 미정)
  { id: 19, icon: '🏟️', title: '파이아케스의 원반 시합', topic: '', demand: 4, tier: 'mid' },
  { id: 20, icon: '🏝️', title: '칼립소의 붙잡는 섬', topic: '', demand: 5, tier: 'mid' },
  { id: 21, icon: '👻', title: '하데스의 저승 문턱', topic: '', demand: 5, tier: 'mid' },
  { id: 22, icon: '⚡', title: '제우스의 벼락', topic: '', demand: 6, tier: 'mid' },
];

export const AGENDAS: Record<number, Agenda> = Object.fromEntries(list.map((a) => [a.id, a]));

/**
 * 기준 배치(생명력 낮은 순). 실제 게임은 출항할 때 shuffledSetup()으로 구간 안에서 섞은 배치를 쓰고,
 * 이 배치는 테스트·예전 저장 게임·설명 화면 예시용
 */
export const INITIAL_TABLES = [1, 2, 3];
/** 1~3번 해역에서 돌파되면 순서대로 들어오는 대기열 */
export const QUEUE = [4, 5, 6, 19, 7, 8, 20, 9, 21, 10, 11, 12, 13, 22, 14, 15, 16, 17];
/** FINAL_OPEN_ROUND 일차에 4번 해역으로 열리는 최종 결전 */
export const FINAL_AGENDA = 18;

/** 전리품(특수 무기)은 역경과 따로 정하고, 해역에 오르는 순서대로 앞쪽 역경에 하나씩 붙임. 역경 카드에 무기 이름까지 공개 */
export const LOOT_ORDER: SpecialCardId[] = ['promo', 'hold', 'blitz', 'blitz', 'practice'];
export const LOOT: Partial<Record<number, SpecialCardId>> = Object.fromEntries(
  [...INITIAL_TABLES, ...QUEUE].slice(0, LOOT_ORDER.length).map((id, i) => [id, LOOT_ORDER[i]]),
);

/** 역경 배치·생명력·전리품. 돌파 보상(전진 거리) = 처음 생명력 */
export interface Setup {
  tables: number[];
  queue: number[];
  demand: Record<number, number>;
  loot: Partial<Record<number, SpecialCardId>>;
  /** 연습 항해 (하루만, 거리는 실제 게임에 이어지지 않음) */
  practice?: boolean;
}

export const SETUP: Setup = {
  tables: INITIAL_TABLES,
  queue: QUEUE,
  demand: Object.fromEntries(list.map((a) => [a.id, a.demand])),
  loot: LOOT,
};


/** 구간 순서(하 → 중 → 상)는 지키고 같은 구간 안에서만 섞은 배치. 전리품은 처음 나오는 역경부터 LOOT_ORDER 순 */
export function shuffledSetup(rng: () => number = Math.random): Setup {
  const shuffle = (ids: number[]) => {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const base = [...INITIAL_TABLES, ...QUEUE];
  const ids = (['low', 'mid', 'high'] as Tier[]).flatMap((tier) => shuffle(base.filter((id) => AGENDAS[id].tier === tier)));
  return {
    tables: ids.slice(0, INITIAL_TABLES.length),
    queue: ids.slice(INITIAL_TABLES.length),
    demand: SETUP.demand,
    loot: Object.fromEntries(ids.slice(0, LOOT_ORDER.length).map((id, i) => [id, LOOT_ORDER[i]])),
  };
}
