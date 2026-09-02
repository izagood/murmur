// 사용자 설정 보관 지점 — sessionStore 와 같은 모양의 단일 표면. 저장 매체(localStorage)를
// 이 파일 밖으로 드러내지 않아서, 나중에 Tauri store 로 갈아끼울 때 여기만 고치면 된다.

/**
 * 초안 저장은 기기 로컬에 둔다. design.md 가 "설정은 기기의 속성만 담는다"고 제한한 것은
 * 설정(descriptor)이지 사용자가 쓴 문장 전체가 아니다. 초안은 사용자의 입력 자체이므로
 * 다른 매체(설정와 동일한 localStorage)를 쓰는 것이 타당하다.
 *
 * 중요한 보안 의도: 세션 토큰은 키체인, 알림 토글은 기기 로컬이다. 초안은 그 사이다 —
 * 토큰만큼 비밀은 아니지만 계정이 로그아웃된 뒤에도 문장 전체가 디스크에 남으면 #92( argv
 * 노출)와 PAT 키체인 결정이 세운 기준과 어긋난다. 그래서 **로그아웃 시 초안을 전량 삭제**한다.
 */
export interface NotificationPrefs {
  enabled: boolean;
  mention: boolean;
  threadReply: boolean;
  dm: boolean;
  /** 알림 본문에 메시지 내용을 실을지. 끄면 제목(누가·어디서)만 남는다. */
  showPreview: boolean;
}

export interface Prefs {
  notifications: NotificationPrefs;
}

const KEY = 'murmur.prefs';
const DRAFTS_KEY = 'murmur.drafts';

export const DEFAULT_PREFS: Prefs = {
  notifications: { enabled: true, mention: true, threadReply: true, dm: true, showPreview: true },
};

export const prefsStorage = {
  load(): Prefs {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULT_PREFS;
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      // 저장본을 그대로 쓰지 않고 기본값과 병합한다 — 없는 키를 undefined 로 두면
      // 나중에 추가된 설정이 기존 사용자에게 꺼진 채로 시작한다.
      return { notifications: { ...DEFAULT_PREFS.notifications, ...(parsed.notifications ?? {}) } };
    } catch {
      return DEFAULT_PREFS;
    }
  },
  save(p: Prefs): void {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 저장 불가 환경 허용 */ }
  },
};

export const draftsStorage = {
  load(): Record<string, string> {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  },
  save(drafts: Record<string, string>): void {
    try {
      if (Object.keys(drafts).length === 0) {
        localStorage.removeItem(DRAFTS_KEY);
      } else {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      }
    } catch { /* 저장 불가 환경 허용 */ }
  },
  clear(): void {
    try { localStorage.removeItem(DRAFTS_KEY); } catch { /* noop */ }
  },
};
