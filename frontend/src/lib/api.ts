import { auth } from './auth';

const BASE = '/api';

async function request(method: string, path: string, body?: any) {
  const token = auth.getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    auth.clearSession();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request('POST', '/auth/login', { login: username, password }),
  me: () => request('GET', '/auth/me'),

  // Portfolios — /api/portfolios
  portfolio: {
    all: () => request('GET', '/portfolios'),
    positions: (id: number) => request('GET', `/portfolios/${id}/positions`),
    performance: (id: number) => request('GET', `/portfolios/${id}/performance`),
    exposure: (id: number) => request('GET', `/portfolios/${id}/exposure`),
    dividends: (id: number) => request('GET', `/portfolios/${id}/dividends`),
  },

  // Watchlists — /api/watchlists (plural!)
  watchlists: () => request('GET', '/watchlists'),

  // Alerts — /api/alerts
  alerts: {
    list: () => request('GET', '/alerts'),
    create: (data: any) => request('POST', '/alerts', data),
    delete: (id: number) => request('DELETE', `/alerts/${id}`),
  },

  // Market data — all under /api/ (no /markets/ prefix!)
  markets: {
    // /api/prices — might be empty; use price/:symbol for individual
    prices: () => request('GET', '/prices'),
    // /api/price/:symbol — real-time price for one symbol
    price: (symbol: string) => request('GET', `/price/${encodeURIComponent(symbol)}`),
    // /api/news — returns { query, items: [...] }
    news: () => request('GET', '/news'),
    // /api/chart/:symbol
    chart: (symbol: string, range = '1mo') =>
      request('GET', `/chart/${encodeURIComponent(symbol)}?range=${range}`),
    // /api/tickers/search
    search: (q: string) => request('GET', `/tickers/search?q=${encodeURIComponent(q)}`),
  },

  // AI Oracle — /api/ai
  oracle: {
    chat: (message: string, conversationId?: string) =>
      request('POST', '/ai/chat', { message, conversationId }),
    analyzePortfolio: () => request('POST', '/ai/analyze/portfolio', {}),
    analyzeWatchlist: () => request('POST', '/ai/analyze/watchlist', {}),
  },
};
