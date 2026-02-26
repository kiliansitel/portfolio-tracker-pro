import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
  CartesianGrid, BarChart, Bar, Line, ComposedChart
} from 'recharts';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { Skeleton } from './ui/skeleton';

interface OHLCV {
  date: string;
  open: number; high: number; low: number; close: number; volume: number;
  ma20: number | undefined;
  ma50: number | undefined;
  ma200: number | undefined;
}

const TF_MAP: Record<string, { range: string; interval: string }> = {
  '1D': { range: '1d',  interval: '5m'  },
  '1W': { range: '5d',  interval: '15m' },
  '1M': { range: '1mo', interval: '1d'  },
  '3M': { range: '3mo', interval: '1d'  },
  '1Y': { range: '1y',  interval: '1wk' },
  '5Y': { range: '5y',  interval: '1mo' },
};

function calcMA(data: OHLCV[], period: number, key: 'ma20'|'ma50'|'ma200'): OHLCV[] {
  return data.map((d, i) => {
    if (i < period - 1) return d;
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, x) => s + x.close, 0) / period;
    return { ...d, [key]: Number(avg.toFixed(2)) };
  });
}

function parseYahooChart(json: any): OHLCV[] {
  try {
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const ts: number[] = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    return ts.map((t, i) => ({
      date: new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      open:   Number((q.open?.[i]  ?? 0).toFixed(2)),
      high:   Number((q.high?.[i]  ?? 0).toFixed(2)),
      low:    Number((q.low?.[i]   ?? 0).toFixed(2)),
      close:  Number((q.close?.[i] ?? 0).toFixed(2)),
      volume: Math.round(q.volume?.[i] ?? 0),
      ma20: undefined,
      ma50: undefined,
      ma200: undefined,
    })).filter(d => d.close > 0);
  } catch { return []; }
}

const DEFAULT_SYMBOLS = [
  { sym: 'SPY', label: 'S&P 500 (SPY)' },
  { sym: 'QQQ', label: 'Nasdaq (QQQ)' },
  { sym: 'DIA', label: 'Dow Jones (DIA)' },
  { sym: 'BTC-USD', label: 'Bitcoin' },
  { sym: 'ETH-USD', label: 'Ethereum' },
];

interface Props {
  initialSymbol?: string;
  compact?: boolean;
}

export function CandlestickChart({ initialSymbol, compact }: Props) {
  const [symbol, setSymbol] = useState(initialSymbol || 'SPY');
  const [tf, setTf] = useState('1M');
  const [chartType, setChartType] = useState<'area'|'candle'>('area');
  const [data, setData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMA20, setShowMA20] = useState(false);
  const [showMA50, setShowMA50] = useState(false);
  const [showMA200, setShowMA200] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTimer, setSearchTimer] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const { range, interval } = TF_MAP[tf];
    api.markets.chart(symbol, `${range}&interval=${encodeURIComponent(interval)}`)
      .then((json: any) => {
        if (!alive) return;
        let d = parseYahooChart(json);
        if (showMA20 || showMA200 || showMA50) {
          if (showMA20) d = calcMA(d, 20, 'ma20');
          if (showMA50) d = calcMA(d, 50, 'ma50');
          if (showMA200) d = calcMA(d, 200, 'ma200');
        }
        setData(d);
      })
      .catch(() => setData([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [symbol, tf]);

  // Recalculate MAs when toggles change
  useEffect(() => {
    if (!data.length) return;
    let d = data.map(r => ({ ...r, ma20: undefined, ma50: undefined, ma200: undefined }));
    if (showMA20) d = calcMA(d, 20, 'ma20');
    if (showMA50) d = calcMA(d, 50, 'ma50');
    if (showMA200) d = calcMA(d, 200, 'ma200');
    setData(d);
  }, [showMA20, showMA50, showMA200]);

  const handleSearch = useCallback((q: string) => {
    setSearchQ(q);
    clearTimeout(searchTimer);
    if (!q) { setSearchResults([]); setSearchOpen(false); return; }
    setSearchTimer(setTimeout(async () => {
      try {
        const res = await api.markets.search(q);
        setSearchResults((res || []).slice(0, 8));
        setSearchOpen(true);
      } catch { setSearchOpen(false); }
    }, 250));
  }, [searchTimer]);

  const first = data[0]?.close ?? 0;
  const last  = data[data.length - 1]?.close ?? 0;
  const isUp  = last >= first;
  const strokeColor = isUp ? '#10b981' : '#ef4444';
  const priceChange = last - first;
  const pctChange   = first > 0 ? (priceChange / first) * 100 : 0;

  const chartData = data;

  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5 shadow-lg">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="flex flex-col gap-1">
          {/* Symbol + price */}
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <select value={symbol} onChange={e => setSymbol(e.target.value)}
              className="bg-transparent text-white font-semibold text-lg focus:outline-none cursor-pointer">
              {DEFAULT_SYMBOLS.map(o => <option key={o.sym} value={o.sym} className="bg-[#1a1d29]">{o.label}</option>)}
              {!DEFAULT_SYMBOLS.find(o => o.sym === symbol) && (
                <option value={symbol} className="bg-[#1a1d29]">{symbol}</option>
              )}
            </select>
            {!loading && last > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-white font-bold">${last.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className={`text-sm font-semibold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isUp ? '+' : ''}{priceChange.toFixed(2)} ({isUp ? '+' : ''}{pctChange.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
          {/* MA toggles */}
          <div className="flex items-center gap-2 ml-6">
            {[
              { key: 'ma20', label: 'MA20', color: '#3b82f6', show: showMA20, toggle: () => setShowMA20(v => !v) },
              { key: 'ma50', label: 'MA50', color: '#f59e0b', show: showMA50, toggle: () => setShowMA50(v => !v) },
              { key: 'ma200', label: 'MA200', color: '#ef4444', show: showMA200, toggle: () => setShowMA200(v => !v) },
            ].map(ma => (
              <button key={ma.key} onClick={ma.toggle}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors border ${ma.show ? 'border-transparent text-white' : 'bg-transparent border-white/10 text-gray-600 hover:text-gray-400'}`}
                style={ma.show ? { background: `${ma.color}30`, borderColor: `${ma.color}60`, color: ma.color } : {}}>
                {ma.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end">
          {/* Ticker search */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-500" />
              <input value={searchQ} onChange={e => handleSearch(e.target.value)}
                placeholder="Search ticker…"
                className="bg-transparent text-white text-sm placeholder-gray-600 focus:outline-none w-28" />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-[#0d0f14] border border-white/10 rounded-xl overflow-hidden shadow-xl z-20">
                {searchResults.map(r => (
                  <button key={r.symbol} onClick={() => { setSymbol(r.symbol); setSearchQ(''); setSearchOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left">
                    <span className="text-white font-mono text-sm font-semibold">{r.symbol}</span>
                    <span className="text-gray-500 text-xs truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chart type + timeframe */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Area/Candle toggle */}
            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
              <button onClick={() => setChartType('area')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${chartType === 'area' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Area</button>
              <button onClick={() => setChartType('candle')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${chartType === 'candle' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Candle</button>
            </div>
            {Object.keys(TF_MAP).map(t => (
              <button key={t} onClick={() => setTf(t)}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-all min-h-[40px] min-w-[40px] ${
                  t === tf ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Price chart */}
      <div className={`${compact ? 'h-48' : 'h-64'} mb-4`}>
        {loading ? (
          <Skeleton className="h-full rounded-xl bg-white/5" />
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">No chart data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} domain={['auto', 'auto']}
                tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'K' : v.toFixed(0)}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d29', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                formatter={(v: number, name: string) => {
                  if (name === 'close') return [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Close'];
                  if (name.startsWith('ma')) return [`$${v?.toFixed(2) ?? ''}`, name.toUpperCase()];
                  return [v, name];
                }}
              />
              {chartType === 'area' && (
                <Area type="monotone" dataKey="close" stroke={strokeColor} strokeWidth={2} fill="url(#chartGrad)" dot={false} />
              )}
              {chartType === 'candle' && (
                <Line type="monotone" dataKey="close" stroke={strokeColor} strokeWidth={2} dot={false} />
              )}
              {showMA20 && <Line type="monotone" dataKey="ma20" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
              {showMA50 && <Line type="monotone" dataKey="ma50" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
              {showMA200 && <Line type="monotone" dataKey="ma200" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Volume */}
      {!loading && chartData.length > 0 && !compact && (
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <YAxis hide />
              <Bar dataKey="volume" fill="#8b5cf6" opacity={0.35} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
