const TOKEN_KEY = 'pt_gui_token';
const USER_KEY = 'pt_gui_user';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1];
    return JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  setSession: (token: string, user: unknown) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    const payload = decodeJwtPayload(token);
    if (payload?.exp && typeof payload.exp === 'number') {
      if (Date.now() / 1000 > payload.exp) {
        // Token already expired — clear session proactively
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        return false;
      }
    }
    return true;
  },
  /** Returns seconds until expiry, or null if no exp claim */
  expiresInSeconds: (): number | null => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    if (payload?.exp && typeof payload.exp === 'number') {
      return Math.floor(payload.exp - Date.now() / 1000);
    }
    return null;
  },
};
