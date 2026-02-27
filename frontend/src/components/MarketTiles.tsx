/**
 * MarketTiles — pinnable market overview grid (S&P, Nasdaq, Dow, BTC, ETH + user-pinned)
 * Click any tile → opens chart modal
 * Futures (ES=F, NQ=F, YM=F) shown inline for indices when market is closed
 */
import { useEffect, useState, useCallback } from 'react';
import { getPrices } from '../lib/priceCache';
import { useLivePrices } from '../lib/useLivePrices';
import { usePinnedMarkets } from '../lib/usePinnedMarkets';
import { useChartModal } from '../lib/chartModalContext';
import { MarketStateBadge } from './MarketStateBadge';

const NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^DJI': 'Dow Jones', '^VIX': 'VIX',
  'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum',
  'ES=F': 'S&P Futures', 'NQ=F': 'Nasdaq Futures', 'YM=F': 'Dow Futures',
};

const FUTURES_MAP: Record<string, string> = {
  '^GSPC': 'ES=F', '^IXIC': 'NQ=F', '^DJI': 'YM=F',
};

function SymbolBadge({ symbol }: { symbol: string }) {
  const clean = symbol.replace('^', '').replace('-USD', '');
  const colors: Record<string, string> = {
    'GSPC': 'bg-red-500', 'IXIC': 'bg-blue-500', 'DJI': 'bg-sky-500',
    'VIX': 'bg-orange-500', 'BTC': 'bg-amber-500', 'ETH': 'bg-indigo-500',
  };
  const bg = colors[clean] || 'bg-gray-600';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-white font-bold text-xs ${bg}`}>
      {clean.slice(0, 2)}
    </span>
  );
}

function fmt2(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(2);
}

export function MarketTiles() {
  const { allSymbols, pinned, DEFAULT_MARKETS } = usePinnedMarkets();
  const { openChart } = useChartModal();

  // Include futures in the live price request
  const futuresSymbols = ['ES=F', 'NQ=F', 'YM=F'];
  const allWithFutures = [...new Set([...allSymbols, ...futuresSymbols])];
  const { prices: livePrices, isLive } = useLivePrices(allWithFutures);
  const [snapshot, setSnapshot] = useState<Record<string, any>>({});

  useEffect(() => {
    getPrices(allWithFutures).then(setSnapshot).catch(() => {});
  }, [allSymbols.join(',')]);

  const getPrice = useCallback((sym: string) => {
    return livePrices[sym] || snapshot[sym] || null;
  }, [livePrices, snapshot]);

  // Don't render futures as their own tiles
  const displaySymbols = allSymbols.filter(s => !futuresSymbols.includes(s));

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-500 to-red-600" />
        <h3 className="text-white font-semibold text-lg">Markets</h3>
        {isLive && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs">Live</span>
          </span>
        )}
        <span className="text-gray-500 text-xs ml-auto">Click tile to chart · Pin in chart modal</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {displaySymbols.map(sym => {
          const q = getPrice(sym);
          const price = q?.price ?? 0;
          const change = q?.change ?? 0;
          const changePct = q?.changePercent ?? 0;
          const isPos = changePct >= 0;
          const isPinned = pinned.includes(sym) && !DEFAULT_MARKETS.includes(sym);
          const marketState = q?.marketState;
          const isExtended = marketState && marketState !== 'REGULAR' && marketState !== 'CLOSED';
          // Futures for this symbol
          const futSym = FUTURES_MAP[sym];
          const futQ = futSym ? getPrice(futSym) : null;

          return (
            <button
              key={sym}
              onClick={() => openChart(sym, NAMES[sym] || sym)}
              className="relative text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-3 transition-all group"
            >
              {isPinned && (
                <span className="absolute top-2 right-2 text-yellow-400 text-xs">📌</span>
              )}
              <div className="flex items-center gap-2 mb-2">
                <SymbolBadge symbol={sym} />
                <div className="min-w-0">
                  <div className="text-white text-xs font-semibold truncate">
                    {NAMES[sym] || sym.replace('^', '').replace('-USD', '')}
                  </div>
                  <div className="text-gray-500 text-xs truncate">{sym}</div>
                </div>
              </div>
              <div className="text-white font-bold text-sm">
                {price > 0 ? (sym === 'BTC-USD' && price > 1000 ? `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${fmt2(price)}`) : '—'}
              </div>
              <div className={`text-xs font-medium ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                {price > 0 ? `${isPos ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
              </div>
              {/* Extended hours badge */}
              {isExtended && (
                <div className="mt-1">
                  <MarketStateBadge marketState={marketState!} />
                </div>
              )}
              {/* Futures indicator when market is closed */}
              {futQ && marketState && marketState !== 'REGULAR' && (
                <div className="mt-1 text-xs text-gray-400">
                  Fut: <span className={futQ.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {futQ.changePercent >= 0 ? '+' : ''}{futQ.changePercent.toFixed(2)}%
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
