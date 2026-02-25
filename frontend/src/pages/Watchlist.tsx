import { ChevronDown, Plus, ChevronRight, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const LOGO_GRADIENTS: Record<string, string> = {
  BTC: 'from-orange-500 to-orange-600',
  ETH: 'from-blue-500 to-purple-600',
  BNB: 'from-yellow-500 to-yellow-600',
  NVDA: 'from-green-500 to-emerald-600',
  TSLA: 'from-red-500 to-red-600',
  AAPL: 'from-gray-500 to-gray-600',
  INTC: 'from-blue-600 to-blue-700',
  AMD: 'from-red-600 to-red-700',
  MSFT: 'from-blue-500 to-cyan-500',
  AMZN: 'from-orange-400 to-yellow-500',
  GOOGL: 'from-blue-500 to-green-500',
  META: 'from-blue-600 to-indigo-600',
};

function getGradient(symbol: string): string {
  const root = symbol.replace('-USD', '').replace('-EUR', '').split('-')[0];
  return LOGO_GRADIENTS[root] || 'from-blue-500 to-purple-600';
}

interface WatchItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  preMarketPrice?: number;
  preMarketChangePercent?: number;
}

interface Watchlist {
  id: number;
  name: string;
  items: WatchItem[];
}

export function Watchlist() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const fetchPrices = async (symbols: string[]): Promise<Record<string, any>> => {
    const results: Record<string, any> = {};
    // Fetch prices in parallel (max 5 at a time to avoid rate limiting)
    const chunks = [];
    for (let i = 0; i < symbols.length; i += 5) chunks.push(symbols.slice(i, i + 5));
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (sym) => {
        try {
          const data = await api.markets.price(sym);
          if (data) results[sym] = data;
        } catch { /* skip */ }
      }));
    }
    return results;
  };

  const loadWatchlists = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const rawLists = await api.watchlists();
      if (!Array.isArray(rawLists) || rawLists.length === 0) {
        setWatchlists([]);
        return;
      }

      // Get all unique symbols
      const allSymbols = [...new Set(rawLists.flatMap((wl: any) => wl.items?.map((i: any) => i.symbol) || []))];
      const prices = await fetchPrices(allSymbols);

      const enriched: Watchlist[] = rawLists.map((wl: any) => ({
        id: wl.id,
        name: wl.name,
        items: (wl.items || []).map((item: any) => {
          const priceData = prices[item.symbol];
          return {
            symbol: item.symbol,
            name: item.name || item.symbol,
            price: priceData?.price || 0,
            change: priceData?.change || 0,
            changePercent: priceData?.changePercent || 0,
          };
        }),
      }));

      setWatchlists(enriched);
      if (selectedId === null && enriched.length > 0) setSelectedId(enriched[0].id);
      // Default all sections expanded
      const expanded: Record<string, boolean> = {};
      enriched.forEach(wl => { expanded[wl.id] = true; });
      setExpandedSections(prev => Object.keys(prev).length === 0 ? expanded : prev);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadWatchlists(); }, []);

  const selectedList = watchlists.find(wl => wl.id === selectedId) || watchlists[0];
  const allItems = selectedList?.items || [];

  const topGainer = allItems.length > 0
    ? allItems.reduce((best, cur) => cur.changePercent > best.changePercent ? cur : best, allItems[0])
    : null;
  const topLoser = allItems.length > 0
    ? allItems.reduce((best, cur) => cur.changePercent < best.changePercent ? cur : best, allItems[0])
    : null;

  const renderItem = (item: WatchItem) => {
    const isPos = item.changePercent >= 0;
    return (
      <div key={item.symbol} className="group px-6 py-4 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-b-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getGradient(item.symbol)} flex items-center justify-center shadow-lg flex-shrink-0`}>
              <span className="text-white font-bold text-sm">{item.symbol.replace('-USD','')[0]}</span>
            </div>
            <div>
              <div className="text-white font-bold">{item.symbol}</div>
              <div className="text-gray-500 text-sm">{item.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="text-right">
              {item.price > 0 ? (
                <>
                  <div className="text-white font-bold text-lg">
                    ${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`text-sm font-semibold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPos ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </div>
                </>
              ) : (
                <div className="text-gray-600 text-sm">Loading...</div>
              )}
            </div>
            <button className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-md text-white text-sm font-medium transition-colors opacity-0 group-hover:opacity-100">
              Add
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
          <h2 className="text-2xl font-bold text-white">Watchlist</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadWatchlists(true)}
            disabled={refreshing}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all text-sm">
            <Plus className="w-4 h-4" />
            Add Symbol
          </button>
        </div>
      </div>

      {/* Watchlist container */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-hidden mb-6">
        {/* Header bar */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {watchlists.map(wl => (
              <button
                key={wl.id}
                onClick={() => setSelectedId(wl.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedId === wl.id
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {wl.name} ({wl.items.length})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">Sort by:</span>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors text-sm">
              <span className="font-medium">Name</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Items */}
        {selectedList && (
          <div>
            <button
              onClick={() => setExpandedSections(prev => ({ ...prev, [selectedList.id]: !prev[selectedList.id] }))}
              className="w-full px-6 py-3 flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors"
            >
              {expandedSections[selectedList.id] !== false
                ? <ChevronDown className="w-4 h-4 text-gray-400" />
                : <ChevronRight className="w-4 h-4 text-gray-400" />}
              <span className="text-white font-semibold text-sm">
                {selectedList.name} ({selectedList.items.length})
              </span>
            </button>

            {expandedSections[selectedList.id] !== false && (
              <div>
                {loading ? (
                  <div className="px-6 py-8 text-center text-gray-500 text-sm">Loading watchlist...</div>
                ) : selectedList.items.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500 text-sm">No items in this watchlist</div>
                ) : (
                  selectedList.items.map(renderItem)
                )}
              </div>
            )}
          </div>
        )}

        {!loading && watchlists.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500">No watchlists found</div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
          <div className="text-gray-400 text-sm mb-2">Top Gainer</div>
          <div className="text-xl font-bold text-white">{topGainer?.symbol || '—'}</div>
          <div className="text-emerald-400 text-lg font-semibold">
            {topGainer && topGainer.changePercent > 0 ? `+${topGainer.changePercent.toFixed(2)}%` : '—'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
          <div className="text-gray-400 text-sm mb-2">Top Loser</div>
          <div className="text-xl font-bold text-white">{topLoser?.symbol || '—'}</div>
          <div className="text-red-400 text-lg font-semibold">
            {topLoser && topLoser.changePercent < 0 ? `${topLoser.changePercent.toFixed(2)}%` : '—'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
          <div className="text-gray-400 text-sm mb-2">Total Items</div>
          <div className="text-3xl font-bold text-white">{allItems.length}</div>
          <div className="text-gray-400 text-sm">{watchlists.length} watchlist{watchlists.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>
  );
}
