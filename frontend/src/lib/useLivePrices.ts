/**
 * useLivePrices — real-time price hook
 * Tries SSE first, falls back to 30s polling via priceCache.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getPrices } from './priceCache';
import { auth } from './auth';

export type PriceRecord = Record<string, {
  price: number;
  change: number;
  changePercent: number;
  name?: string;
  marketState?: string;
}>;

const SSE_ENDPOINTS = ['/api/prices/stream', '/api/markets/stream'];

export function useLivePrices(symbols: string[]): { prices: PriceRecord; isLive: boolean } {
  const [prices, setPrices] = useState<PriceRecord>({});
  const [isLive, setIsLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<any>(null);
  const symbolsKey = symbols.sort().join(',');

  const fetchOnce = useCallback(async (syms: string[]) => {
    if (!syms.length) return;
    try {
      const data = await getPrices(syms);
      if (data) setPrices(prev => ({ ...prev, ...data }));
    } catch {}
  }, []);

  useEffect(() => {
    const syms = symbols.filter(Boolean);
    if (!syms.length) return;

    // Initial fetch regardless
    fetchOnce(syms);

    // Try SSE
    let sseConnected = false;
    const token = auth.getToken();

    const trySSE = (endpoint: string) => {
      try {
        const url = `${endpoint}?symbols=${syms.map(encodeURIComponent).join(',')}&token=${token || ''}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.onopen = () => { sseConnected = true; setIsLive(true); };
        es.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            // Backend sends: { SYMBOL: { price, change, ... }, ... } OR { type: 'prices', data: {...} }
            if (d && typeof d === 'object') {
              if (d.type === 'prices' && d.data) {
                setPrices(prev => ({ ...prev, ...d.data }));
              } else if (d.type === 'price' && d.symbol) {
                setPrices(prev => ({ ...prev, [d.symbol]: d }));
              } else {
                // Direct map format: { AAPL: {...}, BTC-USD: {...} }
                const isDirectMap = Object.values(d).every((v: any) => v && typeof v.price === 'number');
                if (isDirectMap) setPrices(prev => ({ ...prev, ...d }));
              }
            }
          } catch {}
        };
        es.onerror = () => {
          es.close();
          esRef.current = null;
          if (!sseConnected) {
            // Try next endpoint or fall back to polling
            startPolling(syms);
          } else {
            setIsLive(false);
            startPolling(syms);
          }
        };
      } catch {
        startPolling(syms);
      }
    };

    const startPolling = (syms: string[]) => {
      setIsLive(false);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => fetchOnce(syms), 15000);
    };

    // Try first SSE endpoint
    trySSE(SSE_ENDPOINTS[0]);

    return () => {
      esRef.current?.close();
      esRef.current = null;
      clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return { prices, isLive };
}

/**
 * usePriceFlash — returns a CSS class that flashes green/red when price changes
 */
export function usePriceFlash(price: number | undefined): string {
  const [flashClass, setFlashClass] = useState('');
  const prevRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (price === undefined || prevRef.current === undefined) {
      prevRef.current = price;
      return;
    }
    if (price !== prevRef.current) {
      const cls = price > prevRef.current ? 'price-flash-up' : 'price-flash-down';
      setFlashClass(cls);
      const t = setTimeout(() => setFlashClass(''), 600);
      prevRef.current = price;
      return () => clearTimeout(t);
    }
    prevRef.current = price;
  }, [price]);

  return flashClass;
}
