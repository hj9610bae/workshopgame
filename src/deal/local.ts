/*
 * 현장 진행(board.html) 상태 저장소.
 * 서버 없이 이 브라우저의 localStorage 에만 저장해요. 새로고침해도 이어서 진행할 수 있고,
 * 같은 PC 에서 연 '진행자 창'과는 storage 이벤트로 자동 동기화돼요.
 */
import type { TeamId } from './data';
import type { EngineState, Step } from './engine';
import type { Submission } from './types';
import { storage } from '../ui';

/** 교섭판('deal-board-v1')·오디세이아 v1(역경 18개)과 역경 구성이 달라 예전 저장 게임은 불러오지 않음 */
const KEY = 'odyssey-board-v2';
const CONSOLE_KEY = 'deal-board-console';
const HISTORY_LIMIT = 40;

/** 진행자에게만 보이는 기록 (팀별 결과 메시지, 스카우터 결과) */
export interface LogEntry {
  round: number;
  team: TeamId;
  text: string;
}

export interface LocalGame {
  names: Partial<Record<TeamId, string>>;
  /** 게임 시작 전이면 null */
  engine: EngineState | null;
  /** 이번 라운드에 보조자가 입력한 제출 */
  subs: Partial<Record<TeamId, Submission>>;
  log: LogEntry[];
  /** 최종 결과에서 안건별 요구 수치 공개 화면을 보여 주는 중 (진행자 창과 같이 바뀜) */
  agendasShown?: boolean;
  /** 되돌리기용 이전 상태 (가장 최근이 마지막) */
  history: Omit<LocalGame, 'history'>[];
}

export const emptyGame = (names: LocalGame['names'] = {}): LocalGame => ({ names, engine: null, subs: {}, log: [], history: [] });

export function loadGame(): LocalGame {
  try {
    const raw = JSON.parse(storage.get(KEY) ?? 'null');
    if (raw && typeof raw === 'object') return { ...emptyGame(), ...raw };
  } catch {
    /* 저장된 값이 깨졌으면 새로 시작 */
  }
  return emptyGame();
}

export const saveGame = (game: LocalGame): void => storage.set(KEY, JSON.stringify(game));

/** 다른 창(진행자 창)에서 상태가 바뀌면 호출 */
export function onGameChange(handler: () => void): void {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) handler();
  });
}

/** 되돌릴 수 있도록 현재 상태를 기록해 두고 새 상태를 만듦 */
export function commit(game: LocalGame, next: Partial<Omit<LocalGame, 'history'>>): LocalGame {
  const { history, ...current } = game;
  return { ...current, ...next, history: [...history, current].slice(-HISTORY_LIMIT) };
}

export function undo(game: LocalGame): LocalGame | null {
  const prev = game.history.at(-1);
  return prev ? { ...prev, history: game.history.slice(0, -1) } : null;
}

/** 엔진 결과의 팀별 메시지를 진행자 기록으로 옮김 */
export function logNotes(step: Step): LogEntry[] {
  const round = step.state.pub.round;
  return Object.entries(step.notes).flatMap(([team, notes]) =>
    (notes ?? []).map((n) => ({ round, team: team as TeamId, text: n.text })),
  );
}

/* 진행자 창이 열려 있는지: 진행자 창이 1초마다 시각을 남김 */

export const beatConsole = (): void => storage.set(CONSOLE_KEY, String(Date.now()));
export const closeConsole = (): void => storage.set(CONSOLE_KEY, null);
export const consoleAlive = (): boolean => Date.now() - Number(storage.get(CONSOLE_KEY) ?? 0) < 3000;
