/**
 * G-86: "log in → fast-forward past the access-token expiry → perform an
 * action → the action succeeds without the user seeing a logout."
 *
 * This is the exact scenario described in UPDATE-02.md G.2 that used to break
 * trust in the app. It must never regress silently again.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('session refresh-and-retry (G-82/G-83)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('retries the original request once after a silent refresh on 401, and the caller never sees the 401', async () => {
    const { api, tokenStore } = await import('./api.js');

    tokenStore.set('expired.token.value');

    let call = 0;
    global.fetch = vi.fn((url, opts) => {
      call += 1;
      if (String(url).endsWith('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: 'fresh.token.value' }),
        });
      }
      if (String(url).includes('/contacts/') && String(url).endsWith('/status')) {
        // First attempt (with the expired token) 401s; retried attempt (with
        // the fresh token from refresh) succeeds.
        const usedFreshToken = opts.headers.Authorization === 'Bearer fresh.token.value';
        if (usedFreshToken) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
        }
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ detail: 'Invalid or expired token.' }) });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    let logoutFired = false;
    window.addEventListener('reach:logout', () => { logoutFired = true; });

    const result = await api.updateStatus('contact-123', 'coming');

    expect(result).toEqual({ ok: true });
    expect(logoutFired).toBe(false);
    expect(tokenStore.get()).toBe('fresh.token.value');
    // 1 failed attempt + 1 refresh call + 1 retried attempt = 3 fetches
    expect(call).toBe(3);
  });

  it('logs the user out cleanly (with the reach:logout event) when the refresh itself fails', async () => {
    const { api, tokenStore } = await import('./api.js');

    tokenStore.set('expired.token.value');

    global.fetch = vi.fn((url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ detail: 'Invalid refresh token' }) });
      }
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ detail: 'Invalid or expired token.' }) });
    });

    let logoutFired = false;
    window.addEventListener('reach:logout', () => { logoutFired = true; });

    await expect(api.getMe()).rejects.toThrow();
    expect(logoutFired).toBe(true);
    expect(tokenStore.get()).toBeNull();
  });
});
