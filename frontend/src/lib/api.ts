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
  if (res.status === 401) { auth.clearSession(); window.location.href = '/login'; throw new Error('Unauthorized'); }
  if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

export const api = {
  dividends: (portfolioId: number) => request('GET', `/portfolios/${portfolioId}/dividends`),
  login: (username: string, password: string) => request('POST', '/auth/login', { login: username, password }),
  me: () => request('GET', '/auth/me'),
  updateSettings: (data: { settings?: any; currency?: string }) => request('PUT', '/auth/settings', data),
  changePassword: (currentPassword: string, newPassword: string) => request('PUT', '/auth/password', { currentPassword, newPassword }),
  changeEmail: (email: string) => request('PUT', '/auth/email', { email }),

  portfolio: {
    all: () => request('GET', '/portfolios'),
    create: (name: string, cash?: number) => request('POST', '/portfolios', { name, cash }),
    update: (id: number, data: { name?: string; cash?: number; cash_currency?: string }) => request('PUT', `/portfolios/${id}`, data),
    delete: (id: number) => request('DELETE', `/portfolios/${id}`),
    duplicate: (id: number) => request('POST', `/portfolios/${id}/duplicate`, {}),
    positions: (id: number) => request('GET', `/portfolios/${id}/positions`),
    createPosition: (portfolioId: number, data: any) => request('POST', `/portfolios/${portfolioId}/positions`, data),
    updatePosition: (posId: number, data: any) => request('PUT', `/portfolios/positions/${posId}`, data),
    deletePosition: (posId: number) => request('DELETE', `/portfolios/positions/${posId}`),
    closePosition: (portfolioId: number, posId: number, data: any) => request('POST', `/portfolios/${portfolioId}/positions/${posId}/close`, data),
    performance: (id: number, params?: { days?: number }) => {
      const qs = params?.days ? `?days=${params.days}` : '';
      return request('GET', `/portfolios/${id}/performance${qs}`);
    },
    exposure: (id: number) => request('GET', `/portfolios/${id}/exposure`),
    dividends: (id: number) => request('GET', `/portfolios/${id}/dividends`),
    transactions: (id: number) => request('GET', `/portfolios/${id}/transactions`),
    createTransaction: (portfolioId: number, data: any) => request('POST', `/portfolios/${portfolioId}/transactions`, data),
    deleteTransaction: (txId: number) => request('DELETE', `/transactions/${txId}`),
    snapshot: (id: number) => request('POST', `/portfolios/${id}/snapshot`, {}),
  },

  watchlists: () => request('GET', '/watchlists'),
  createWatchlist: (name: string) => request('POST', '/watchlists', { name }),
  addToWatchlist: (watchlistId: number, symbol: string, notes?: string) =>
    request('POST', `/watchlists/${watchlistId}/items`, { symbol, notes }),
  removeFromWatchlist: (itemId: number) =>
    request('DELETE', `/watchlists/items/${itemId}`),

  alerts: {
    list: () => request('GET', '/alerts'),
    create: (data: { symbol: string; condition: 'above' | 'below'; value: number }) => request('POST', '/alerts', data),
    delete: (id: number) => request('DELETE', `/alerts/${id}`),
  },

  markets: {
    prices: (symbols?: string[]) =>
      symbols?.length
        ? request('GET', `/prices?symbols=${symbols.map(encodeURIComponent).join(',')}`)
        : request('GET', '/prices'),
    price: (symbol: string) => request('GET', `/price/${encodeURIComponent(symbol)}`),
    news: () => request('GET', '/news'),
    chart: (symbol: string, rangeAndInterval = '1mo') => {
      // Accepts "range" or "range&interval=Xd" — build clean URLSearchParams
      const [rangePart, ...rest] = rangeAndInterval.split('&');
      const qs = new URLSearchParams({ range: rangePart });
      rest.forEach(kv => { const [k, v] = kv.split('='); if (k && v) qs.set(k, v); });
      return request('GET', `/chart/${encodeURIComponent(symbol)}?${qs.toString()}`);
    },
    search: (q: string) => request('GET', `/tickers/search?q=${encodeURIComponent(q)}`),
  },

  wallets: {
    list: () => request('GET', '/wallets'),
    add: (data: { address: string; chain: string; label?: string }) => request('POST', '/wallets', data),
    delete: (id: number) => request('DELETE', `/wallets/${id}`),
    sync: (id: number) => request('POST', `/wallets/${id}/sync`, {}),
    syncAll: () => request('POST', '/wallets/sync-all', {}),
    summary: () => request('GET', '/wallets/summary'),
  },

  oracle: {
    chat: (message: string, conversationId?: string) => request('POST', '/ai/chat', { message, conversationId }),
    analyzePortfolio: () => request('POST', '/ai/analyze/portfolio', {}),
    analyzeWatchlist: () => request('POST', '/ai/analyze/watchlist', {}),
  },

  ai: {
    providers: () => request('GET', '/ai/providers'),
    conversations: () => request('GET', '/ai/conversations'),
    conversation: (id: number) => request('GET', `/ai/conversations/${id}`),
    deleteConversation: (id: number) => request('DELETE', `/ai/conversations/${id}`),
  },

  register: (username: string, password: string, email?: string) =>
    request('POST', '/auth/register', { username, password, ...(email ? { email } : {}) }),

  push: {
    subscribe: (sub: any) => request('POST', '/push/subscribe', sub),
    unsubscribe: (body?: any) => request('POST', '/push/unsubscribe', body || {}),
    test: () => request('POST', '/push/test', {}),
  },

  updates: {
    status: () => request('GET', '/updates/status'),
  },

  info: () => request('GET', '/info'),

  exchangeRates: () => request('GET', '/exchange-rates'),

  options: {
    chain: (symbol: string) => request('GET', `/options/${symbol}`),
    byExpiry: (symbol: string, expiry: string) => request('GET', `/options/${symbol}/${expiry}`),
  },

  tickers: {
    search: (q: string) => request('GET', `/tickers/search?q=${encodeURIComponent(q)}`),
    popular: () => request('GET', '/tickers/popular'),
  },

  backup: {
    download: () => fetch(`${BASE}/backup`, { headers: { Authorization: `Bearer ${auth.getToken()}` } }),
  },
};
