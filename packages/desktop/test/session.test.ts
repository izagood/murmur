import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sessionStore, type StoredSessions, type StoredCommunity } from '../src/lib/session';

/** Tauri IPC 스텁. 키체인은 IPC 뒤에 있으므로 여기서 그 경계를 흉내낸다. */
function keychain(): { vault: Map<string, string>; invoke: ReturnType<typeof vi.fn> } {
  const vault = new Map<string, string>();
  const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'secret_get') return vault.get(String(args?.key)) ?? null;
    if (cmd === 'secret_set') { vault.set(String(args?.key), String(args?.value)); return null; }
    if (cmd === 'secret_delete') { vault.delete(String(args?.key)); return null; }
    throw new Error(`unknown command ${cmd}`);
  });
  (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke };
  return { vault, invoke };
}

beforeEach(() => {
  localStorage.clear();
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});
afterEach(() => {
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

const community: StoredCommunity = { accountId: 'acct_123', baseUrl: 'http://x:3400', token: 'murs_secret', handle: 'testuser' };
const sessions: StoredSessions = { active: 'acct_123', communities: [community] };

describe('세션 보관 — 키체인이 있을 때', () => {
  it('keeps the token out of localStorage', async () => {
    const { vault } = keychain();

    await sessionStore.save(sessions);

    expect(JSON.stringify(vault ? [...vault.values()] : [])).toContain('murs_secret');
    expect(localStorage.getItem('murmur.sessions')).toBeNull();
    expect(localStorage.getItem('murmur.session')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('murs_secret');
  });

  it('round-trips through the keychain', async () => {
    keychain();
    await sessionStore.save(sessions);

    expect(await sessionStore.load()).toEqual(sessions);
  });

  it('clears the keychain entry', async () => {
    const { vault } = keychain();
    await sessionStore.save(sessions);

    await sessionStore.clear();

    expect(await sessionStore.load()).toBeNull();
    expect([...vault.values()]).toEqual([]);
  });

  it('migrates an existing localStorage session into the keychain and removes the plaintext', async () => {
    localStorage.setItem('murmur.session', JSON.stringify({ baseUrl: 'http://x:3400', token: 'murs_secret' }));
    const { vault } = keychain();

    const loaded = await sessionStore.load();

    expect(loaded).toEqual({
      active: null,
      communities: [{ accountId: '', baseUrl: 'http://x:3400', token: 'murs_secret', handle: '' }],
    });
    expect([...vault.values()].join()).toContain('murs_secret');
    expect(localStorage.getItem('murmur.session')).toBeNull();
  });

  it('falls back to localStorage when the keychain read fails', async () => {
    localStorage.setItem('murmur.sessions', JSON.stringify(sessions));
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: vi.fn(async () => { throw new Error('keychain locked'); }),
    };

    expect(await sessionStore.load()).toEqual(sessions);
  });

  it('does not throw when saving fails', async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: vi.fn(async () => { throw new Error('keychain locked'); }),
    };

    await expect(sessionStore.save(sessions)).resolves.toBeUndefined();
  });
});

describe('세션 보관 — 키체인이 없을 때(브라우저 개발)', () => {
  it('uses localStorage so dev in a browser still works', async () => {
    await sessionStore.save(sessions);

    expect(await sessionStore.load()).toEqual(sessions);
    expect(localStorage.getItem('murmur.sessions')).toBeTruthy();
  });

  it('returns null with nothing stored', async () => {
    expect(await sessionStore.load()).toBeNull();
  });

  it('ignores a corrupt entry instead of throwing', async () => {
    localStorage.setItem('murmur.sessions', '{not json');

    expect(await sessionStore.load()).toBeNull();
  });

  it('clears localStorage', async () => {
    await sessionStore.save(sessions);

    await sessionStore.clear();

    expect(await sessionStore.load()).toBeNull();
  });
});

describe('다중 커뮤니티 (#164)', () => {
  it('같은 계정 id로 저장하면 항목을 늘리지 않고 갱신한다', async () => {
    keychain();
    await sessionStore.save({
      active: 'acct_123',
      communities: [{ accountId: 'acct_123', baseUrl: 'http://a:3400', token: 'token_a', handle: 'user_a' }],
    });

    await sessionStore.save({
      active: 'acct_123',
      communities: [{ accountId: 'acct_123', baseUrl: 'http://b:3400', token: 'token_b', handle: 'user_b' }],
    });

    const loaded = await sessionStore.load();
    expect(loaded?.communities.length).toBe(1);
    expect(loaded?.communities?.[0]?.token).toBe('token_b');
  });

  it('서로 다른 계정 id는 항목을 둘로 만든다', async () => {
    keychain();
    await sessionStore.save({
      active: 'acct_123',
      communities: [{ accountId: 'acct_123', baseUrl: 'http://a:3400', token: 'token_a', handle: 'user_a' }],
    });

    await sessionStore.save({
      active: 'acct_456',
      communities: [
        { accountId: 'acct_123', baseUrl: 'http://a:3400', token: 'token_a', handle: 'user_a' },
        { accountId: 'acct_456', baseUrl: 'http://b:3400', token: 'token_b', handle: 'user_b' },
      ],
    });

    const loaded = await sessionStore.load();
    expect(loaded?.communities.length).toBe(2);
  });

  it('active를 바꾸면 유지된다', async () => {
    keychain();
    await sessionStore.save({
      active: 'acct_123',
      communities: [
        { accountId: 'acct_123', baseUrl: 'http://a:3400', token: 'token_a', handle: 'user_a' },
        { accountId: 'acct_456', baseUrl: 'http://b:3400', token: 'token_b', handle: 'user_b' },
      ],
    });

    await sessionStore.save({
      active: 'acct_456',
      communities: [
        { accountId: 'acct_123', baseUrl: 'http://a:3400', token: 'token_a', handle: 'user_a' },
        { accountId: 'acct_456', baseUrl: 'http://b:3400', token: 'token_b', handle: 'user_b' },
      ],
    });

    const loaded = await sessionStore.load();
    expect(loaded?.active).toBe('acct_456');
  });
});