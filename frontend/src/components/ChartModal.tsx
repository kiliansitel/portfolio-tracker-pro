import { useState, useEffect } from 'react';
import { X, Pin, PinOff } from 'lucide-react';
import { CandlestickChart } from './CandlestickChart';
import { api } from '../lib/api';
import { fmt } from '../lib/format';
import { usePinnedMarkets } from '../lib/usePinnedMarkets';

interface OptionsData {
  expiries: string[];
  calls: OptionRow[];
  puts: OptionRow[];
  currentPrice: number;
}

interface OptionRow {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
}

function OptionsChain({ symbol }: { symbol: string }) {
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [calls, setCalls] = useState<OptionRow[]>([]);
  const [puts, setPuts] = useState<OptionRow[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    api.options.chain(symbol)
      .then((d: any) => {
        const exp = d?.expiries || d?.expirationDates || [];
        setExpiries(exp);
        if (exp.length) setSelectedExpiry(exp[0]);
        setCurrentPrice(d?.currentPrice || 0);
        if (!exp.length) setError('No options data available');
      })
      .catch(() => setError('Options not available for this symbol'))
      .finally(() => setLoading(false));
  }, [symbol]);

  useEffect(() => {
    if (!selectedExpiry) return;
    api.options.byExpiry(symbol, selectedExpiry)
      .then((d: any) => {
        const filterStrikes = (rows: OptionRow[]) =>
          rows.filter(r => currentPrice === 0 || (r.strike >= currentPrice * 0.85 && r.strike <= currentPrice * 1.15));
        setCalls(filterStrikes(d?.calls || []));
        setPuts(filterStrikes(d?.puts || []));
      })
      .catch(() => { setCalls([]); setPuts([]); });
  }, [selectedExpiry, symbol]);

  if (loading) return <div className="text-gray-500 text-sm text-center py-8">Loading options chain…</div>;
  if (error) return <div className="text-gray-500 text-sm text-center py-8">{error}</div>;

  const colHdr = 'text-xs text-gray-500 font-medium py-2 px-3 text-right';
  const col = (v: any, itm: boolean, side: 'call'|'put') =>
    `text-xs py-2 px-3 text-right ${itm ? (side === 'call' ? 'bg-emerald-900/20' : 'bg-red-900/20') : ''}`;

  return (
    <div>
      {/* Expiry tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {expiries.slice(0, 8).map(e => (
          <button key={e} onClick={() => setSelectedExpiry(e)}
            className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${selectedExpiry === e ? 'bg-blue-500/20 border border-blue-500/30 text-blue-400' : 'bg-white/5 border border-white/10 text-gray-500 hover:text-white'}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {/* Calls */}
        <div>
          <div className="text-emerald-400 font-semibold text-sm mb-2">Calls</div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-white/10">
                {['Strike','Last','Bid','Ask','Vol','OI','IV'].map(h => <th key={h} className={colHdr}>{h}</th>)}
              </tr></thead>
              <tbody>
                {calls.map((r, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                    <td className={`${col(r.strike, r.inTheMoney, 'call')} text-white font-medium`}>${r.strike}</td>
                    <td className={col(r.lastPrice, r.inTheMoney, 'call')}>{fmt(r.lastPrice)}</td>
                    <td className={col(r.bid, r.inTheMoney, 'call')}>{fmt(r.bid)}</td>
                    <td className={col(r.ask, r.inTheMoney, 'call')}>{fmt(r.ask)}</td>
                    <td className={col(r.volume, r.inTheMoney, 'call')}>{r.volume?.toLocaleString() || '-'}</td>
                    <td className={col(r.openInterest, r.inTheMoney, 'call')}>{r.openInterest?.toLocaleString() || '-'}</td>
                    <td className={col(r.impliedVolatility, r.inTheMoney, 'call')}>{r.impliedVolatility ? `${(r.impliedVolatility * 100).toFixed(1)}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Puts */}
        <div>
          <div className="text-red-400 font-semibold text-sm mb-2">Puts</div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-white/10">
                {['Strike','Last','Bid','Ask','Vol','OI','IV'].map(h => <th key={h} className={colHdr}>{h}</th>)}
              </tr></thead>
              <tbody>
                {puts.map((r, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                    <td className={`${col(r.strike, r.inTheMoney, 'put')} text-white font-medium`}>${r.strike}</td>
                    <td className={col(r.lastPrice, r.inTheMoney, 'put')}>{fmt(r.lastPrice)}</td>
                    <td className={col(r.bid, r.inTheMoney, 'put')}>{fmt(r.bid)}</td>
                    <td className={col(r.ask, r.inTheMoney, 'put')}>{fmt(r.ask)}</td>
                    <td className={col(r.volume, r.inTheMoney, 'put')}>{r.volume?.toLocaleString() || '-'}</td>
                    <td className={col(r.openInterest, r.inTheMoney, 'put')}>{r.openInterest?.toLocaleString() || '-'}</td>
                    <td className={col(r.impliedVolatility, r.inTheMoney, 'put')}>{r.impliedVolatility ? `${(r.impliedVolatility * 100).toFixed(1)}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChartModalProps {
  symbol: string;
  name?: string;
  onClose: () => void;
}

export function ChartModal({ symbol, name, onClose }: ChartModalProps) {
  const [tab, setTab] = useState<'chart'|'options'>('chart');
  const [price, setPrice] = useState<any>(null);
  const { pinned, toggle } = usePinnedMarkets();
  const isPinned = pinned.includes(symbol);

  useEffect(() => {
    api.markets.price(symbol).then(setPrice).catch(() => {});
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [symbol]);

  const change = price?.change ?? price?.d ?? 0;
  const changePct = price?.changePercent ?? price?.dp ?? 0;
  const currentPrice = price?.price ?? price?.c ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#0d0f14] sm:rounded-2xl border-0 sm:border border-white/10 w-full sm:max-w-5xl h-full sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-white font-bold text-xl">{symbol}</div>
              {name && <div className="text-gray-500 text-sm">{name}</div>}
            </div>
            {currentPrice > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-lg">{fmt(currentPrice)}</span>
                <span className={`text-sm font-medium ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)} ({change >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
                </span>
              </div>
            )}
            {price?.marketState && price.marketState !== 'REGULAR' && (
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${price.marketState === 'PRE' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                {price.marketState === 'PRE' ? 'PM' : 'AH'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
              <button onClick={() => setTab('chart')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${tab === 'chart' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                📈 Chart
              </button>
              <button onClick={() => setTab('options')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${tab === 'options' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                ⛓️ Options
              </button>
            </div>
            <button onClick={() => toggle(symbol)} title={isPinned ? 'Unpin from Markets' : 'Pin to Markets'}
              className={`p-2 rounded-lg transition-colors ${isPinned ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-gray-500 hover:text-yellow-400 hover:bg-white/5'}`}>
              {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'chart' ? (
            <CandlestickChart initialSymbol={symbol} compact={false} />
          ) : (
            <OptionsChain symbol={symbol} />
          )}
        </div>
      </div>
    </div>
  );
}
