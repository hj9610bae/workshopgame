// 실제 Firebase 에 접속해서 database.rules.json 이 의도대로 동작하는지 확인합니다.
// 사용법: npm run check:rules  (테스트용 방을 만들고 끝나면 지웁니다)
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, goOffline, ref, remove, runTransaction, set, update } from 'firebase/database';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/firebase-config.ts', import.meta.url), 'utf8');
const config = Object.fromEntries([...src.matchAll(/(\w+): '([^']*)'/g)].map((m) => [m[1], m[2]]));

let failed = 0;
const pass = (label) => console.log(`  ✅ ${label}`);
const fail = (label, detail) => {
  failed++;
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
};
async function allowed(label, promise) {
  try {
    await promise;
    pass(label);
  } catch (e) {
    fail(label, e.code ?? e.message);
  }
}
async function denied(label, promise) {
  try {
    await promise;
    fail(`${label} (허용되면 안 됨)`);
  } catch {
    pass(`${label} → 거부`);
  }
}

async function user(name) {
  const app = initializeApp(config, name);
  const cred = await signInAnonymously(getAuth(app));
  return { uid: cred.user.uid, db: getDatabase(app) };
}

const code = `T${Math.floor(Math.random() * 1000)}`;
const host = await user('host');
const a = await user('repA');
const b = await user('repB');
const R = (u, path = '') => ref(u.db, path ? `rooms/${code}/${path}` : `rooms/${code}`);

console.log(`방 ${code}`);
console.log('[방 만들기]');
await allowed(
  '사회자 방 생성 (트랜잭션)',
  runTransaction(R(host), (cur) => (cur === null ? { hostId: host.uid, createdAt: Date.now(), pub: { stage: 'lobby' } } : undefined)),
);
await denied(
  '다른 사람이 같은 코드로 방 만들기',
  runTransaction(R(b), (cur) => (cur === null ? { hostId: b.uid } : undefined)).then((r) => {
    if (!r.committed) throw new Error('not committed');
  }),
);

console.log('[팀 대표 선택]');
await allowed('A 대표가 A팀 선택', set(R(a, 'teams/A/repUid'), a.uid));
await denied('B 대표가 이미 찬 A팀 선택', set(R(b, 'teams/A/repUid'), b.uid));
await allowed('B 대표가 B팀 선택', set(R(b, 'teams/B/repUid'), b.uid));
await allowed('A 대표가 접속 상태 표시', set(R(a, 'teams/A/online'), true));
await denied('B 대표가 A팀 접속 상태 변경', set(R(b, 'teams/A/online'), false));
await denied('B 대표가 A팀 대표 해제', set(R(b, 'teams/A/repUid'), null));

console.log('[비공개 정보]');
await allowed(
  '사회자가 비밀 상태·팀 카드 저장',
  update(R(host), {
    secret: { remaining: [2, 3, 3, 0] },
    'private/A/hand': { blitz: 1 },
    'private/B/hand': { hold: 1 },
    pub: { stage: 'submit', deadline: Date.now() + 60_000, round: 1 },
  }),
);
await allowed('대표가 공개 상태 읽기', get(R(a, 'pub')));
await allowed('대표가 팀 목록 읽기', get(R(a, 'teams')));
await allowed('A 대표가 자기 팀 카드 읽기', get(R(a, 'private/A')));
await denied('A 대표가 B팀 카드 읽기', get(R(a, 'private/B')));
await denied('대표가 남은 요구 수치(secret) 읽기', get(R(a, 'secret')));
await denied('대표가 방 전체 읽기', get(R(a)));

console.log('[제출]');
await allowed('A 대표 제출', set(R(a, 'submissions/A'), { table: 1, card: 'basic', cutIn: 0 }));
await denied('A 대표가 B팀 이름으로 제출', set(R(a, 'submissions/B'), { table: 1, card: 'basic', cutIn: 0 }));
await denied('B 대표가 A팀 제출 내용 읽기', get(R(b, 'submissions/A')));
await allowed('사회자가 제출 내용 읽기', get(R(host, 'submissions')));
await allowed('A 대표 스카우터 요청', set(R(a, 'requests/A/req1'), { table: 2 }));
await denied('같은 요청 덮어쓰기', set(R(a, 'requests/A/req1'), { table: 3 }));

console.log('[조작 방지]');
await denied('대표가 점수 조작', set(R(a, 'pub/teams/A/score'), 99));
await denied('대표가 카드 조작', set(R(a, 'private/A/hand/blitz'), 9));
await denied('대표가 남은 수치 조작', set(R(a, 'secret/remaining/0'), 0));

console.log('[마감]');
await update(R(host), { 'pub/deadline': Date.now() - 10_000 });
await denied('마감 후 제출', set(R(a, 'submissions/A'), { table: 2, card: 'basic', cutIn: 0 }));
await update(R(host), { 'pub/stage': 'reveal' });
await denied('제출 시간 외 스카우터 요청', set(R(a, 'requests/A/req2'), { table: 2 }));

console.log('[팀 변경]');
await allowed('A 대표가 스스로 팀 해제', set(R(a, 'teams/A/repUid'), null));
await allowed('사회자가 B팀 대표 해제', set(R(host, 'teams/B'), null));

await remove(R(host));
pass('테스트 방 삭제');
for (const u of [host, a, b]) goOffline(u.db);
console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
