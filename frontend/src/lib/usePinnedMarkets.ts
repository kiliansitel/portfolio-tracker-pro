/**
 * usePinnedMarkets — manages pinned market symbols (persisted in server + localStorage)
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

const STORAGE_KEY = 'pinnedMarkets';
const DEFAULT_MARKETS = ['^GSPC', '^IXIC', '^DJI', 'BTC-USD', 'ETH-USD'];

export function usePinnedMarkets() {
  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Sync from server on mount
  useEffect(() => {
    api.me().then((me: any) => {
      if (me?.settings?.pinnedMarkets) {
        setPinned(me.settings.pinnedMarkets);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(me.settings.pinnedMarkets));
      }
    }).catch(() => {});
  }, []);

  const toggle = useCallback(async (symbol: string) => {
    setPinned(prev => {
      const next = prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // Sync to server
      api.me().then((me: any) => {
        const settings = { ...(me?.settings || {}), pinnedMarkets: next };
        return api.updateSettings({ settings });
      }).catch(() => {});
      return next;
    });
  }, []);

  // All market symbols to show (default + pinned extras)
  const allSymbols = [...new Set([...DEFAULT_MARKETS, ...pinned])];

  return { pinned, toggle, allSymbols, DEFAULT_MARKETS };
}
