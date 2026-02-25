import { Search, Plus, TrendingUp, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

function fmtPrice(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

interface EnrichedPosition {
  id: number;
  symbol: string;
  name: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  currentValue: number;
  totalPL: number;
  totalPLPct: number;
  dayChange: number;
  dayChangePct: number;
  type: string;
}

export function Positions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDividendsExpanded, setIsDividendsExpanded] = useState(true);
  const [isStocksExpanded, setIsStocksExpanded] = useState(true);
  const [positions, setPositions] = useState<EnrichedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPositions = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const portfolios = await api.portfolio.all();
      if (!portfolios || !portfolios[0]?.id) return;
      const portfolioId = portfolios[0].id;

      const rawPositions = await api.portfolio.positions(portfolioId);
      if (!Array.isArray(rawPositions) || rawPositions.length === 0) {
        setPositions([]);
        return;
      }

      // Get only open positions
      const openPositions = rawPositions.filter((p: any) => p.status === 'open' || !p.status);

      // Fetch current prices for all unique symbols
      const symbols = [...new Set(openPositions.map((p: any) => p.symbol as string))];
      const priceMap: Record<string, any> = {};
      await Promise.all(symbols.map(async (sym) => {
        try {
          const data = await api.markets.price(sym);
          if (data) priceMap[sym] = data;
        } catch { /* skip */ }
      }));

      const enriched: EnrichedPosition[] = openPositions.map((p: any) => {
        const qty = p.quantity || 0;
        const entryPrice = p.entry_price || 0;
        const priceData = priceMap[p.symbol];
        const currentPrice = priceData?.price || 0;
        const costBasis = qty * entryPrice;
        const currentValue = qty * currentPrice;
        const totalPL = currentPrice > 0 ? currentValue - costBasis : 0;
        const totalPLPct = costBasis > 0 ? (totalPL / costBasis) * 100 : 0;
        const dayChange = currentPrice > 0 ? (priceData?.change || 0) * qty : 0;
        const dayChangePct = priceData?.changePercent || 0;

        return {
          id: p.id,
          symbol: p.symbol,
          name: p.name || p.symbol,
          quantity: qty,
          entryPrice,
          currentPrice,
          currentValue,
          totalPL,
          totalPLPct,
          dayChange,
          dayChangePct,
          type: p.type || 'stock',
        };
      });

      setPositions(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadPositions(); }, []);

  const filtered = positions.filter((p) =>
    p.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);
  const totalPL = positions.reduce((s, p) => s + p.totalPL, 0);
  const todayPL = positions.reduce((s, p) => s + p.dayChange, 0);
  const totalInvested = positions.reduce((s, p) => s + p.quantity * p.entryPrice, 0);
  const totalPLPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const displayPositions = filtered.length > 0 || searchQuery ? filtered : positions;

  return (
    <div className="p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
          <h2 className="text-2xl font-bold text-white">My Positions</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search positions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-[#1a1d29] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-64 text-sm"
            />
          </div>
          <button
            onClick={() => loadPositions(true)}
            disabled={refreshing}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all text-sm">
            <Plus className="w-4 h-4" />
            Add Position
          </button>
          <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors text-sm">
            Sort ▼
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
          <div className="text-gray-400 text-sm mb-2">Total Value</div>
          <div className="text-3xl font-bold text-white">
            {loading ? '—' : totalValue > 0 ? fmtPrice(totalValue) : '$0.00'}
          </div>
        </div>

        <div className={`bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border ${todayPL >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
          <div className="text-gray-400 text-sm mb-2">Today's P/L</div>
          <div className={`text-3xl font-bold ${todayPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {loading ? '—' : (todayPL >= 0 ? '+' : '') + fmtPrice(Math.abs(todayPL))}
          </div>
        </div>

        <div className={`bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border ${totalPL >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
          <div className="text-gray-400 text-sm mb-2">Total P/L</div>
          <div className={`text-3xl font-bold ${totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {loading ? '—' : (totalPL >= 0 ? '+' : '') + fmtPrice(Math.abs(totalPL))}
          </div>
          {!loading && positions.length > 0 && (
            <div className={`text-sm font-semibold mt-1 ${totalPLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(1)}%
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
          <div className="text-gray-400 text-sm mb-2">Total Invested</div>
          <div className="text-3xl font-bold text-white">
            {loading ? '—' : totalInvested > 0 ? fmtPrice(totalInvested) : '$0.00'}
          </div>
        </div>
      </div>

      {/* Dividends Section */}
      <div className="mb-6">
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-hidden">
          <button
            onClick={() => setIsDividendsExpanded(!isDividendsExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              {isDividendsExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              <TrendingUp className="w-5 h-5 text-blue-400" />
              <span className="text-white font-semibold">Dividends</span>
            </div>
            <div className="flex items-center gap-8">
              <div><div className="text-gray-400 text-xs">Income</div><div className="text-emerald-400 font-bold">—</div></div>
              <div><div className="text-gray-400 text-xs">Yield</div><div className="text-white font-bold">—</div></div>
              <div><div className="text-gray-400 text-xs">Next Payment</div><div className="text-white font-bold">—</div></div>
              <button className="px-4 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white text-sm font-medium shadow-lg shadow-blue-500/20">
                + Calendar
              </button>
            </div>
          </button>
        </div>
      </div>

      {/* Positions Table */}
      <div>
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-hidden">
          <button
            onClick={() => setIsStocksExpanded(!isStocksExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors border-b border-white/5"
          >
            <div className="flex items-center gap-3">
              {isStocksExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              <span className="text-white font-semibold">
                Positions ({positions.length}) {totalValue > 0 ? `— ${fmtPrice(totalValue)}` : ''}
              </span>
            </div>
          </button>

          {isStocksExpanded && (
            <div>
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-white/5 border-b border-white/5">
                <div className="col-span-2 text-gray-400 text-xs font-medium uppercase">Symbol</div>
                <div className="col-span-1 text-gray-400 text-xs font-medium uppercase text-right">Shares</div>
                <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Entry Price</div>
                <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Current Price</div>
                <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Total Value</div>
                <div className="col-span-1 text-gray-400 text-xs font-medium uppercase text-right">Total P/L</div>
                <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Today P/L</div>
              </div>

              {loading && (
                <div className="px-6 py-8 text-center text-gray-500 text-sm">Loading positions...</div>
              )}

              {!loading && displayPositions.map((position) => {
                const isPlPos = position.totalPL >= 0;
                const isDayPos = position.dayChange >= 0;

                return (
                  <div
                    key={position.id}
                    className="grid grid-cols-12 gap-4 px-6 py-5 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    {/* Symbol & Name */}
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">{position.symbol[0]}</span>
                      </div>
                      <div>
                        <div className="text-white font-bold">{position.symbol}</div>
                        <div className="text-gray-400 text-sm">{position.name}</div>
                        {position.dayChangePct !== 0 && (
                          <div className={`text-xs font-medium ${position.dayChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {position.dayChangePct >= 0 ? '+' : ''}{position.dayChangePct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Shares */}
                    <div className="col-span-1 flex items-center justify-end">
                      <div className="text-white font-medium text-sm">{position.quantity}</div>
                    </div>

                    {/* Entry Price */}
                    <div className="col-span-2 flex items-center justify-end">
                      <div className="text-gray-400 text-sm">${position.entryPrice.toFixed(2)}</div>
                    </div>

                    {/* Current Price */}
                    <div className="col-span-2 flex items-center justify-end">
                      {position.currentPrice > 0 ? (
                        <div className="text-white font-bold text-sm">${position.currentPrice.toFixed(2)}</div>
                      ) : (
                        <div className="text-gray-600 text-sm">—</div>
                      )}
                    </div>

                    {/* Total Value */}
                    <div className="col-span-2 flex items-center justify-end">
                      {position.currentValue > 0 ? (
                        <div className="text-white font-bold">{fmtPrice(position.currentValue)}</div>
                      ) : (
                        <div className="text-gray-600">—</div>
                      )}
                    </div>

                    {/* Total P/L */}
                    <div className="col-span-1 flex items-center justify-end">
                      {position.currentPrice > 0 ? (
                        <div>
                          <div className={`font-bold text-sm ${isPlPos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPlPos ? '+' : ''}{fmtPrice(Math.abs(position.totalPL))}
                          </div>
                          <div className={`text-xs ${isPlPos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPlPos ? '+' : ''}{position.totalPLPct.toFixed(1)}%
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-600 text-sm">—</div>
                      )}
                    </div>

                    {/* Today P/L */}
                    <div className="col-span-2 flex items-center justify-end">
                      {position.currentPrice > 0 ? (
                        <div>
                          <div className={`font-bold text-sm ${isDayPos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isDayPos ? '+' : ''}{fmtPrice(Math.abs(position.dayChange))}
                          </div>
                          <div className={`text-xs ${isDayPos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isDayPos ? '+' : ''}{position.dayChangePct.toFixed(2)}%
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-600 text-sm">—</div>
                      )}
                    </div>
                  </div>
                );
              })}

              {!loading && positions.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <TrendingUp className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <div className="text-gray-400 font-medium">No open positions</div>
                  <div className="text-gray-600 text-sm mt-1">Add your first position to get started</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
