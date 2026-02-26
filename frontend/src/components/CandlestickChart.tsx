import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { api } from '../lib/api';
import { Skeleton } from './ui/skeleton';

interface OHLCV { date: string; open: number; high: number; low: number; close: number; volume: number; }

// Yahoo Finance range → query params
const TF_MAP: Record<string, { range: string; interval: string; label: string }> = {
  '1D': { range: '1d',  interval: '5m',  label: '1D' },
  '1W': { range: '5d',  interval: '15m', label: '1W' },
  '1M': { range: '1mo', interval: '1d',  label: '1M' },
  '3M': { range: '3mo', interval: '1d',  label: '3M' },
  '6M': { range: '6mo', interval: '1d',  label: '6M' },
  '1Y': { range: '1y',  interval: '1wk', label: '1Y' },
};

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
    })).filter(d => d.close > 0);
  } catch { return []; }
}

const SYMBOL_OPTIONS = [
  { sym: 'SPY', label: 'S&P 500 (SPY)' },
  { sym: 'QQQ', label: 'Nasdaq (QQQ)' },
  { sym: 'DIA', label: 'Dow Jones (DIA)' },
  { sym: 'BTC-USD', label: 'Bitcoin' },
  { sym: 'ETH-USD', label: 'Ethereum' },
];

export function CandlestickChart() {
  const [symbol, setSymbol] = useState('SPY');
  const [tf, setTf] = useState('1M');
  const [data, setData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const { range, interval } = TF_MAP[tf];
    api.markets.chart(symbol, range + '&interval=' + interval)
      .then((json: any) => {
        if (!alive) return;
        setData(parseYahooChart(json));
      })
      .catch(() => setData([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [symbol, tf]);

  const first = data[0]?.close ?? 0;
  const last  = data[data.length - 1]?.close ?? 0;
  const isUp  = last >= first;
  const strokeColor = isUp ? '#10b981' : '#ef4444';

  const priceChange = last - first;
  const pctChange   = first > 0 ? (priceChange / first) * 100 : 0;

  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <select
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="bg-transparent text-white font-semibold text-lg focus:outline-none cursor-pointer"
            >
              {SYMBOL_OPTIONS.map(o => <option key={o.sym} value={o.sym} className="bg-[#1a1d29]">{o.label}</option>)}
            </select>
          </div>
          {!loading && last > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-white font-bold">${last.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`text-sm font-semibold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {isUp ? '+' : ''}{priceChange.toFixed(2)} ({isUp ? '+' : ''}{pctChange.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {Object.keys(TF_MAP).map(t => (
            <button key={t} onClick={() => setTf(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                t === tf
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Price chart */}
      <div className="h-64 mb-4">
        {loading ? (
          <Skeleton className="h-full rounded-xl bg-white/5" />
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">No chart data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} tickLine={false} axisLine={false}
                domain={['auto', 'auto']}
                tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'K' : v.toFixed(0)}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d29', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                formatter={(v: number) => [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Close']}
              />
              <Area type="monotone" dataKey="close" stroke={strokeColor} strokeWidth={2} fill="url(#chartGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Volume bars */}
      {!loading && data.length > 0 && (
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barCategoryGap="20%">
              <YAxis hide />
              <Bar dataKey="volume" fill="#8b5cf6" opacity={0.35} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
