import { get, onDisconnect, onValue, ref, runTransaction, set, type DatabaseReference } from 'firebase/database';
import { db } from './firebase';

// 헷갈리는 문자(0/O, 1/I/L) 제외
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export const roomRef = (code: string, path = ''): DatabaseReference =>
  ref(db(), path ? `rooms/${code}/${path}` : `rooms/${code}`);

export const normalizeCode = (s: string): string => s.trim().toUpperCase();

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** 새 방을 만들고 코드 반환. initial 은 방의 처음 데이터 */
export async function createRoom(hostId: string, initial: Record<string, unknown>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    try {
      const result = await runTransaction(roomRef(code), (current) =>
        current === null ? { hostId, createdAt: Date.now(), ...initial } : undefined,
      );
      if (result.committed) return code;
    } catch {
      // 다른 사람의 방이라 읽기가 거부됨 → 다른 코드로 재시도
    }
  }
  throw new Error('방 코드를 만들지 못했어요. 다시 시도해주세요.');
}

export async function getHostId(code: string): Promise<string | null> {
  return (await get(roomRef(code, 'hostId'))).val();
}

export function watch<T>(code: string, path: string, onChange: (value: T | null) => void): () => void {
  return onValue(roomRef(code, path), (snap) => onChange(snap.val()));
}

/** 접속 상태 표시: 연결이 끊기면 서버가 자동으로 false 로 바꿔요. */
export function trackOnline(onlineRef: DatabaseReference): () => void {
  return onValue(ref(db(), '.info/connected'), async (snap) => {
    if (snap.val() !== true) return;
    try {
      await onDisconnect(onlineRef).set(false);
      await set(onlineRef, true);
    } catch {
      // 대표에서 해제된 경우 등
    }
  });
}

let serverOffset = 0;
let watchingOffset = false;

/** 서버 기준 현재 시각(ms). 타이머·판정은 모두 이 값을 기준으로 해요. */
export function serverNow(): number {
  if (!watchingOffset) {
    watchingOffset = true;
    onValue(ref(db(), '.info/serverTimeOffset'), (snap) => (serverOffset = snap.val() ?? 0));
  }
  return Date.now() + serverOffset;
}

/** Firebase 는 undefined 값을 저장할 수 없어서 제거 */
export const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
