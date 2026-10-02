import { initializeApp } from 'firebase/app';
import { browserSessionPersistence, getAuth, initializeAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig } from './firebase-config';

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);

let services: { auth: Auth; db: Database } | null = null;

function init() {
  if (!services) {
    if (!isConfigured) {
      throw new Error('Firebase 설정이 비어 있어요. README의 "Firebase 설정"을 따라 src/firebase-config.ts 를 채워주세요.');
    }
    const app = initializeApp(firebaseConfig);
    // 개발 중에는 탭마다 다른 참가자로 접속할 수 있도록 로그인 상태를 탭(세션) 단위로 유지
    const auth = import.meta.env.DEV ? initializeAuth(app, { persistence: browserSessionPersistence }) : getAuth(app);
    services = { auth, db: getDatabase(app) };
  }
  return services;
}

export const db = (): Database => init().db;

/** 익명 로그인 후 uid 반환. 같은 기기에서 새로고침해도 uid가 유지되어 재접속이 가능해요. */
export async function signIn(): Promise<string> {
  const { auth } = init();
  await auth.authStateReady();
  return (auth.currentUser ?? (await signInAnonymously(auth)).user).uid;
}
