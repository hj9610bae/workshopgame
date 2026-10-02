import { isConfigured } from './firebase';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 사용자 입력(닉네임 등)을 HTML에 넣을 때는 반드시 esc() 를 거쳐요. */
export const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const lastHtml = new WeakMap<Element, string>();

/** 내용이 바뀌었을 때만 다시 그려서 버튼 누르는 중에 화면이 깜빡이지 않게 해요. */
export function render(el: HTMLElement, html: string): void {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
}

/** data-action="이름" 이 붙은 요소를 누르면 handler(이름, 요소) 호출 */
export function onAction(el: HTMLElement, handler: (action: string, target: HTMLElement) => unknown): void {
  el.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || !el.contains(target) || target.hasAttribute('disabled')) return;
    try {
      await handler(target.dataset.action!, target);
    } catch (err) {
      toast(errorMessage(err));
    }
  });
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function showFatal(el: HTMLElement, err: unknown): void {
  console.error(err);
  const hint = isConfigured ? '' : '<p class="muted">처음 세팅 중이라면 README.md 의 Firebase 설정 단계를 확인하세요.</p>';
  render(el, `<section class="card center"><h2>문제가 생겼어요</h2><p>${esc(errorMessage(err))}</p>${hint}
    <button onclick="location.reload()">다시 시도</button></section>`);
}

export function toast(message: string): void {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2500);
}

/** localStorage 는 사파리 개인정보 보호 모드 등에서 실패할 수 있어 감싸서 사용 */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* 저장 실패해도 게임은 계속 */
    }
  },
};

/** 게임 중 폰 화면이 꺼지지 않도록 유지 (지원하는 브라우저만) */
export function keepScreenOn(): void {
  let lock: WakeLockSentinel | null = null;
  const request = async () => {
    try {
      if (document.visibilityState === 'visible' && !lock) {
        lock = await navigator.wakeLock?.request('screen');
        lock?.addEventListener('release', () => (lock = null));
      }
    } catch {
      /* 미지원 또는 거부 */
    }
  };
  document.addEventListener('visibilitychange', request);
  void request();
}
