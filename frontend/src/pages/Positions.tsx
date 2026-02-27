import { Search, Plus, TrendingUp, ChevronDown, ChevronRight, RefreshCw, Edit2, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { getPrices } from '../lib/priceCache';
import { fmt as fmtPrice } from '../lib/format';
import { Modal, FormInput, FormSelect, ActionBtn } from '../components/Modal';
import { Skeleton } from '../components/ui/skeleton';
import { useLivePrices, usePriceFlash } from '../lib/useLivePrices';
import { MarketStateBadge } from '../components/MarketStateBadge';
import { useChartModal } from '../lib/chartModalContext';
import { SwipeableCard } from '../components/SwipeableCard';

function PriceText({ price }: { price: number }) {
  const flash = usePriceFlash(price);
  return <span className={`text-white font-bold text-sm ${flash}`}>${price.toFixed(2)}</span>;
}

const POSITION_TYPES = [
  { value: 'stock', label: 'Stock' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'etf', label: 'ETF' },
  { value: 'option', label: 'Option' },
  { value: 'bond', label: 'Bond' },
  { value: 'other', label: 'Other' },
];

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' }, { value: 'CHF', label: 'CHF' },
  { value: 'JPY', label: 'JPY (¥)' }, { value: 'CAD', label: 'CAD' },
  { value: 'AUD', label: 'AUD' }, { value: 'BTC', label: 'BTC' },
];

interface EnrichedPosition {
  id: number; symbol: string; name: string; quantity: number; entryPrice: number;
  currentPrice: number; currentValue: number; totalPL: number; totalPLPct: number | null;
  dayChange: number; dayChangePct: number; type: string; status: string;
  currency: string; notes?: string;
}

export function Positions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDividendsExpanded, setIsDividendsExpanded] = useState(true);
  const [isStocksExpanded, setIsStocksExpanded] = useState(true);
  const [positions, setPositions] = useState<EnrichedPosition[]>([]);
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // CRUD modals
  const [showAdd, setShowAdd] = useState(false);
  const { openChart } = useChartModal();
  const [editPos, setEditPos] = useState<EnrichedPosition | null>(null);
  const [closePos, setClosePos] = useState<EnrichedPosition | null>(null);
  const [deletePos, setDeletePos] = useState<EnrichedPosition | null>(null);

  // Form
  const [fSymbol, setFSymbol] = useState('');
  const [fQty, setFQty] = useState('');
  const [fPrice, setFPrice] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0]);
  const [fType, setFType] = useState('stock');
  const [fCurrency, setFCurrency] = useState('USD');
  const [fNotes, setFNotes] = useState('');
  const [fStrike, setFStrike] = useState('');
  const [fExpiry, setFExpiry] = useState('');
  const [fMultiplier, setFMultiplier] = useState('100');
  const [fClosePrice, setFClosePrice] = useState('');
  const [fCloseQty, setFCloseQty] = useState('');
  const [fFees, setFFees] = useState('0');
  const [fErr, setFErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Autocomplete
  const [acResults, setAcResults] = useState<any[]>([]);
  const [acOpen, setAcOpen] = useState(false);
  const acTimer = useRef<any>(null);

  const [dividends, setDividends] = useState<{ income: number; yield: number; nextPayment: string | null } | null>(null);

  const loadPositions = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const portfolios = await api.portfolio.all();
      if (!portfolios?.length) return;
      const pid = portfolios[0].id;
      setPortfolioId(pid);

      const rawPositions = await api.portfolio.positions(pid).catch(() => []);
      const openPos = (rawPositions || []).filter((p: any) => p.status === 'open' || !p.status);

      // ── BATCH price fetch (P1-1) ──
      const symbols = Array.from(new Set(openPos.map((p: any) => String(p.symbol)))) as string[];
      const priceMap = await getPrices(symbols);

      // Dividends
      try {
        const divData = await api.dividends(pid);
        const summary = divData?.summary || divData || {};
        const income = summary.totalAnnualIncome || divData?.annual_income || 0;
        const yld = summary.averageYield || divData?.yield || 0;
        if (income > 0 || yld > 0) {
          setDividends({
            income,
            yield: yld * 100,  // backend returns decimal (0.0075 → 0.75%)
            nextPayment: summary.nextExDate || divData?.next_payment || null,
          });
        }
      } catch { /* dividends optional */ }

      setPositions(openPos.map((p: any) => {
        const pd = (priceMap[p.symbol] as any) || {};
        const qty = p.quantity || 0;
        const ep = p.entry_price ?? null; // null means unknown/free entry
        const cp = pd.price || 0;
        const cv = qty * cp;
        const cost = ep != null && ep > 0 ? qty * ep : 0;
        const pl = cp > 0 && cost > 0 ? cv - cost : 0;
        const plPct = cost > 0 ? (pl / cost) * 100 : null; // null = N/A (zero/unknown entry price)
        const dc = cp > 0 ? (pd.change || 0) * qty : 0;
        return {
          id: p.id, symbol: p.symbol, name: p.name || p.symbol,
          quantity: qty, entryPrice: ep ?? 0, currentPrice: cp,
          currentValue: cv, totalPL: pl, totalPLPct: plPct,
          dayChange: dc, dayChangePct: pd.changePercent || 0,
          type: p.type || 'stock', status: p.status || 'open',
          currency: p.currency || 'USD', notes: p.notes,
          marketState: pd.marketState || null,
        };
      }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadPositions(); }, []);

  // Live price overlay — updates positions with real-time prices
  const { prices: livePrices, isLive: pricesLive } = useLivePrices(positions.map(p => p.symbol));
  const enrichedPositions = positions.map(p => {
    const lp = livePrices[p.symbol];
    if (!lp || !lp.price) return p;
    const currentPrice = lp.price;
    const currentValue = currentPrice * p.quantity;
    const totalPL = currentValue - p.entryPrice * p.quantity;
    const totalPLPct = p.entryPrice > 0 ? (totalPL / (p.entryPrice * p.quantity)) * 100 : null;
    const dayChange = (lp.change ?? p.dayChange);
    const dayChangePct = (lp.changePercent ?? p.dayChangePct);
    return { ...p, currentPrice, currentValue, totalPL, totalPLPct, dayChange, dayChangePct, marketState: (lp as any).marketState };
  });

  const filtered = enrichedPositions.filter(p =>
    p.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const POS_PAGE_SIZE = 20;
  const [posPage, setPosPage] = useState(0);
  const displayedPositions = searchQuery ? filtered : filtered.slice(posPage * POS_PAGE_SIZE, (posPage + 1) * POS_PAGE_SIZE);

  const totalValue = enrichedPositions.reduce((s, p) => s + p.currentValue, 0);
  const totalPL = enrichedPositions.reduce((s, p) => s + p.totalPL, 0);
  const todayPL = enrichedPositions.reduce((s, p) => s + p.dayChange, 0);
  const totalInvested = enrichedPositions.reduce((s, p) => s + p.quantity * p.entryPrice, 0);
  const totalPLPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  // Symbol autocomplete
  const onSymbolChange = (val: string) => {
    setFSymbol(val);
    clearTimeout(acTimer.current);
    if (val.length < 1) { setAcResults([]); setAcOpen(false); return; }
    acTimer.current = setTimeout(async () => {
      try {
        const res = await api.markets.search(val);
        setAcResults(res?.slice(0, 6) || []);
        setAcOpen(true);
      } catch { setAcOpen(false); }
    }, 300);
  };

  const pickSymbol = (item: any) => {
    setFSymbol(item.symbol || item.ticker || item);
    setAcOpen(false); setAcResults([]);
    if (item.type) setFType(item.type.toLowerCase() === 'cryptocurrency' ? 'crypto' : 'stock');
  };

  const openAdd = () => {
    setFSymbol(''); setFQty(''); setFPrice(''); setFDate(new Date().toISOString().split('T')[0]);
    setFType('stock'); setFCurrency('USD'); setFNotes(''); setFErr('');
    setShowAdd(true);
  };

  const openEdit = (p: EnrichedPosition) => {
    setFSymbol(p.symbol); setFQty(String(p.quantity)); setFPrice(String(p.entryPrice));
    setFType(p.type); setFCurrency(p.currency); setFNotes(p.notes || ''); setFErr('');
    setEditPos(p);
  };

  const doAdd = async () => {
    setFErr(''); setSaving(true);
    try {
      if (!fSymbol) throw new Error('Symbol required');
      if (!fQty || Number(fQty) <= 0) throw new Error('Quantity required');
      if (!portfolioId) throw new Error('No portfolio');
      await api.portfolio.createPosition(portfolioId, {
        symbol: fSymbol.toUpperCase(), quantity: Number(fQty),
        entry_price: Number(fPrice) || 0, entry_date: fDate || undefined,
        type: fType, currency: fCurrency, notes: fNotes || undefined,
        ...(fType === 'option' ? { strike_price: Number(fStrike) || undefined, expiry_date: fExpiry || undefined, multiplier: Number(fMultiplier) || 100 } : {}),
      });
      setShowAdd(false);
      await loadPositions(true);
      toast.success(`${fSymbol.toUpperCase()} added`);
    } catch (e: any) { setFErr(e.message); } finally { setSaving(false); }
  };

  const doEdit = async () => {
    setFErr(''); setSaving(true);
    try {
      await api.portfolio.updatePosition(editPos!.id, {
        quantity: Number(fQty), entry_price: Number(fPrice) || 0,
        type: fType, currency: fCurrency, notes: fNotes || undefined,
      });
      setEditPos(null);
      await loadPositions(true);
      toast.success('Position updated');
    } catch (e: any) { setFErr(e.message); } finally { setSaving(false); }
  };

  const doClose = async () => {
    setFErr(''); setSaving(true);
    try {
      if (!fClosePrice || Number(fClosePrice) <= 0) throw new Error('Close price required');
      const closeQty = fCloseQty ? Number(fCloseQty) : undefined;
      if (closeQty && (closeQty <= 0 || closeQty > closePos!.quantity)) throw new Error(`Quantity must be between 0 and ${closePos!.quantity}`);
      await api.portfolio.closePosition(portfolioId!, closePos!.id, {
        close_price: Number(fClosePrice),
        quantity: closeQty,
        fees: Number(fFees) || 0,
        date: fDate,
      });
      setClosePos(null);
      await loadPositions(true);
      toast.success(`${closePos!.symbol} position closed`);
    } catch (e: any) { setFErr(e.message); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    setSaving(true);
    try {
      await api.portfolio.deletePosition(deletePos!.id);
      setDeletePos(null);
      await loadPositions(true);
      toast.success('Position deleted');
    } catch (e: any) { setFErr(e.message); } finally { setSaving(false); }
  };

  const SymbolInput = () => (
    <div className="relative">
      <label className="block text-gray-400 text-sm font-medium mb-1.5">Symbol</label>
      <input
        className="w-full px-4 py-2.5 bg-[#0d0f14] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors text-sm"
        value={fSymbol} onChange={e => onSymbolChange(e.target.value)} onBlur={() => setTimeout(() => setAcOpen(false), 200)}
        placeholder="AAPL, BTC-USD..."
      />
      {acOpen && acResults.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[#1a1d29] border border-white/10 rounded-xl overflow-hidden shadow-xl">
          {acResults.map((r: any) => (
            <button key={r.symbol || r.ticker} onMouseDown={() => pickSymbol(r)}
              className="w-full px-4 py-2.5 text-left hover:bg-white/10 transition-colors">
              <span className="text-white font-bold text-sm">{r.symbol || r.ticker}</span>
              {r.name && <span className="text-gray-400 text-xs ml-2">{r.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
          <h2 className="text-2xl font-bold text-white">My Positions</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-[#1a1d29] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-full sm:w-56 text-sm min-h-[44px]" />
          </div>
          <button onClick={() => loadPositions(true)} disabled={refreshing} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px]">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm min-h-[44px]">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Position</span><span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Summary — 2×2 grid on mobile, 1×4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5">
          <div className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">Total Value</div>
          <div className="text-xl sm:text-3xl font-bold text-white">{loading ? '—' : fmtPrice(totalValue)}</div>
        </div>
        <div className={`bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border ${todayPL >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
          <div className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">Today's P/L</div>
          <div className={`text-xl sm:text-3xl font-bold ${todayPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{loading ? '—' : (todayPL >= 0 ? '+' : '') + fmtPrice(Math.abs(todayPL))}</div>
        </div>
        <div className={`bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border ${totalPL >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
          <div className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">Total P/L</div>
          <div className={`text-xl sm:text-3xl font-bold ${totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{loading ? '—' : (totalPL >= 0 ? '+' : '') + fmtPrice(Math.abs(totalPL))}</div>
          {!loading && totalInvested > 0 && <div className={`text-xs sm:text-sm mt-0.5 ${totalPLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(1)}%</div>}
        </div>
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5">
          <div className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">Total Invested</div>
          <div className="text-xl sm:text-3xl font-bold text-white">{loading ? '—' : fmtPrice(totalInvested)}</div>
        </div>
      </div>

      {/* Dividends */}
      <div className="mb-6">
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-hidden">
          <button onClick={() => setIsDividendsExpanded(!isDividendsExpanded)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              {isDividendsExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              <TrendingUp className="w-5 h-5 text-blue-400" />
              <span className="text-white font-semibold">Dividends</span>
            </div>
            <div className="flex items-center gap-4 sm:gap-8">
              <div><div className="text-gray-400 text-xs">Annual Income</div><div className="text-emerald-400 font-bold text-sm sm:text-base">{dividends ? fmtPrice(dividends.income) : '—'}</div></div>
              <div><div className="text-gray-400 text-xs">Yield</div><div className="text-white font-bold text-sm sm:text-base">{dividends ? `${dividends.yield.toFixed(2)}%` : '—'}</div></div>
              <div><div className="text-gray-400 text-xs">Next Pay</div><div className="text-white font-bold text-sm sm:text-base">{dividends?.nextPayment || '—'}</div></div>
            </div>
          </button>
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-x-auto">
        <button onClick={() => setIsStocksExpanded(!isStocksExpanded)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors border-b border-white/5">
          <div className="flex items-center gap-3">
            {isStocksExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
            <span className="text-white font-semibold">Positions ({positions.length}) {totalValue > 0 ? `— ${fmtPrice(totalValue)}` : ''}</span>
          </div>
        </button>

        {isStocksExpanded && (
          <>
            {/* Table header — hidden on mobile */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-white/5 border-b border-white/5">
              <div className="col-span-2 text-gray-400 text-xs font-medium uppercase">Symbol</div>
              <div className="col-span-1 text-gray-400 text-xs font-medium uppercase text-right">Shares</div>
              <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Entry</div>
              <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Current</div>
              <div className="col-span-1 text-gray-400 text-xs font-medium uppercase text-right">Value</div>
              <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">P/L</div>
              <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Actions</div>
            </div>

            {loading && (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl bg-white/5" />
                ))}
              </div>
            )}

            {!loading && !searchQuery && filtered.length > POS_PAGE_SIZE && (
              <div className="px-6 py-3 flex items-center justify-between text-sm text-gray-500 border-b border-white/5">
                <span>Showing {posPage * POS_PAGE_SIZE + 1}–{Math.min((posPage + 1) * POS_PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPosPage(p => Math.max(0, p - 1))} disabled={posPage === 0}
                    className="px-3 py-1 bg-white/5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
                  <button onClick={() => setPosPage(p => p + 1)} disabled={(posPage + 1) * POS_PAGE_SIZE >= filtered.length}
                    className="px-3 py-1 bg-white/5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
                </div>
              </div>
            )}
            {!loading && displayedPositions.map(position => {
              const isPlPos = position.totalPL >= 0;
              const isDayPos = position.dayChange >= 0;
              return (
                <div key={position.id}>
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 hover:bg-white/5 transition-colors items-center">
                  <div className="col-span-2 flex items-center gap-3 cursor-pointer" onClick={() => openChart(position.symbol)}>
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xs">{position.symbol[0]}</span>
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm hover:text-blue-400 transition-colors">{position.symbol}</div>
                      <div className="text-gray-500 text-xs">{position.type}</div>
                    </div>
                  </div>
                  <div className="col-span-1 text-right"><div className="text-white text-sm">{position.quantity}</div></div>
                  <div className="col-span-2 text-right"><div className="text-gray-400 text-sm">${position.entryPrice.toFixed(2)}</div></div>
                  <div className="col-span-2 text-right">
                    {position.currentPrice > 0 ? (
                      <div>
                        <div className="flex items-center gap-1 justify-end">
                          {(position as any).marketState && (position as any).marketState !== 'REGULAR' && <MarketStateBadge marketState={(position as any).marketState} />}
                          <PriceText price={position.currentPrice} />
                        </div>
                        <div className={`text-xs ${isDayPos ? 'text-emerald-400' : 'text-red-400'}`}>{isDayPos ? '+' : ''}{position.dayChangePct.toFixed(2)}%</div>
                      </div>
                    ) : <div className="text-gray-600 text-sm">—</div>}
                  </div>
                  <div className="col-span-1 text-right">
                    {position.currentValue > 0 ? <div className="text-white font-bold text-sm">{fmtPrice(position.currentValue)}</div> : <div className="text-gray-600 text-sm">—</div>}
                  </div>
                  <div className="col-span-2 text-right">
                    {position.currentPrice > 0 ? (
                      <div>
                        <div className={`font-bold text-sm ${isPlPos ? 'text-emerald-400' : 'text-red-400'}`}>{isPlPos ? '+' : ''}{fmtPrice(Math.abs(position.totalPL))}</div>
                        {position.totalPLPct !== null
                          ? <div className={`text-xs ${isPlPos ? 'text-emerald-400' : 'text-red-400'}`}>{isPlPos ? '+' : ''}{position.totalPLPct.toFixed(1)}%</div>
                          : <div className="text-xs text-gray-500">N/A</div>}
                      </div>
                    ) : <div className="text-gray-600 text-sm">—</div>}
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(position)} className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setFClosePrice(String(position.currentPrice || '')); setFCloseQty(''); setFFees('0'); setFDate(new Date().toISOString().split('T')[0]); setFErr(''); setClosePos(position); }}
                      className="p-1.5 text-gray-500 hover:text-orange-400 hover:bg-orange-400/10 rounded-lg transition-colors text-xs font-medium" title="Close position">Close</button>
                    <button onClick={() => { setFErr(''); setDeletePos(position); }} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {/* Mobile card — swipe left to reveal Edit + Delete */}
                <SwipeableCard
                  onEdit={() => openEdit(position)}
                  onDelete={() => { setFErr(''); setDeletePos(position); }}
                >
                <div className="sm:hidden px-4 py-4 border-b border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => openChart(position.symbol)}>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">{position.symbol[0]}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-white font-bold">{position.symbol}</div>
                          {(position as any).marketState && (position as any).marketState !== 'REGULAR' && (
                            <MarketStateBadge marketState={(position as any).marketState} />
                          )}
                        </div>
                        <div className="text-gray-500 text-xs">{position.type} · {position.quantity} shares</div>
                      </div>
                    </div>
                    <div className="text-right">
                      {position.currentValue > 0
                        ? <div className="text-white font-bold">{fmtPrice(position.currentValue)}</div>
                        : <div className="text-gray-600">—</div>}
                      {position.currentPrice > 0 && (
                        <div className={`text-xs font-semibold ${isPlPos ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isPlPos ? '+' : ''}{fmtPrice(Math.abs(position.totalPL))}
                          {position.totalPLPct !== null ? ` (${isPlPos ? '+' : ''}${position.totalPLPct.toFixed(1)}%)` : ' (N/A)'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>Entry: ${position.entryPrice.toFixed(2)}</span>
                      {position.currentPrice > 0 && (
                        <span className={isDayPos ? 'text-emerald-400' : 'text-red-400'}>
                          Now: ${position.currentPrice.toFixed(2)} ({isDayPos ? '+' : ''}{position.dayChangePct.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(position)} className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => { setFClosePrice(String(position.currentPrice || '')); setFCloseQty(''); setFFees('0'); setFDate(new Date().toISOString().split('T')[0]); setFErr(''); setClosePos(position); }}
                        className="px-2 py-1 text-gray-500 hover:text-orange-400 hover:bg-orange-400/10 rounded-lg text-xs font-medium min-h-[36px]">Close</button>
                      <button onClick={() => { setFErr(''); setDeletePos(position); }} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
                </SwipeableCard>
                </div>
              );
            })}

            {!loading && positions.length === 0 && (
              <div className="px-6 py-12 text-center">
                <TrendingUp className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <div className="text-gray-400 font-medium mb-2">No open positions</div>
                <button onClick={openAdd} className="text-blue-400 text-sm hover:underline">Add your first position</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Position" size="md">
        <div className="space-y-4">
          <SymbolInput />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput label="Quantity" type="number" value={fQty} onChange={e => setFQty(e.target.value)} placeholder="10" />
            <FormInput label="Entry Price ($)" type="number" value={fPrice} onChange={e => setFPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormSelect label="Type" value={fType} onChange={e => setFType(e.target.value)} options={POSITION_TYPES} />
            <FormSelect label="Currency" value={fCurrency} onChange={e => setFCurrency(e.target.value)} options={CURRENCIES} />
          </div>
          <FormInput label="Entry Date" type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
          {fType === 'option' && (
            <div className="space-y-3 p-3 bg-[#0d0f14] rounded-xl border border-purple-500/20">
              <div className="text-purple-400 text-xs font-semibold uppercase">Option Details</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormInput label="Strike Price ($)" type="number" value={fStrike} onChange={e => setFStrike(e.target.value)} placeholder="150.00" />
                <FormInput label="Expiry Date" type="date" value={fExpiry} onChange={e => setFExpiry(e.target.value)} />
              </div>
              <FormInput label="Multiplier" type="number" value={fMultiplier} onChange={e => setFMultiplier(e.target.value)} placeholder="100" />
            </div>
          )}
          <FormInput label="Notes (optional)" value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="e.g. Long-term hold" />
          {fErr && <p className="text-red-400 text-sm">{fErr}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowAdd(false)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doAdd} disabled={saving} className="flex-1">Add Position</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editPos} onClose={() => setEditPos(null)} title={`Edit ${editPos?.symbol}`} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput label="Quantity" type="number" value={fQty} onChange={e => setFQty(e.target.value)} />
            <FormInput label="Entry Price ($)" type="number" value={fPrice} onChange={e => setFPrice(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormSelect label="Type" value={fType} onChange={e => setFType(e.target.value)} options={POSITION_TYPES} />
            <FormSelect label="Currency" value={fCurrency} onChange={e => setFCurrency(e.target.value)} options={CURRENCIES} />
          </div>
          <FormInput label="Notes (optional)" value={fNotes} onChange={e => setFNotes(e.target.value)} />
          {fErr && <p className="text-red-400 text-sm">{fErr}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setEditPos(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doEdit} disabled={saving} className="flex-1">Save</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Close Modal */}
      <Modal open={!!closePos} onClose={() => setClosePos(null)} title={`Close ${closePos?.symbol}`} size="md">
        <div className="space-y-4">
          {closePos && (() => {
            const cp = Number(fClosePrice) || 0;
            const qty = Number(fCloseQty) || closePos.quantity;
            const fees = Number(fFees) || 0;
            const entryVal = closePos.entryPrice * qty;
            const exitVal = cp * qty - fees;
            const realizedPL = exitVal - entryVal;
            const realizedPct = entryVal > 0 ? (realizedPL / entryVal) * 100 : 0;
            return (
              <div className="bg-white/3 rounded-xl p-3 border border-white/5 text-sm">
                <div className="flex justify-between text-gray-400"><span>Position:</span><span className="text-white">{closePos.symbol} · {closePos.quantity} shares @ ${closePos.entryPrice.toFixed(2)}</span></div>
                {cp > 0 && <div className={`flex justify-between mt-1 font-bold ${realizedPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span>Realized P&L:</span>
                  <span>{realizedPL >= 0 ? '+' : ''}{fmtPrice(realizedPL)} ({realizedPct >= 0 ? '+' : ''}{realizedPct.toFixed(1)}%)</span>
                </div>}
              </div>
            );
          })()}
          <FormInput label="Close Price ($)" type="number" value={fClosePrice} onChange={e => setFClosePrice(e.target.value)} placeholder={String(closePos?.currentPrice || 'Market price')} />
          <FormInput label={`Quantity (max ${closePos?.quantity})`} type="number" value={fCloseQty} onChange={e => setFCloseQty(e.target.value)} placeholder={String(closePos?.quantity || 'All')} />
          <FormInput label="Fees/Commission ($)" type="number" value={fFees} onChange={e => setFFees(e.target.value)} placeholder="0" />
          <FormInput label="Close Date" type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
          {fErr && <p className="text-red-400 text-sm">{fErr}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setClosePos(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doClose} disabled={saving || !fClosePrice} variant="danger" className="flex-1">
              {fCloseQty && Number(fCloseQty) < (closePos?.quantity || 0) ? 'Partial Close' : 'Close Position'}
            </ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deletePos} onClose={() => setDeletePos(null)} title="Delete Position" size="sm">
        <div className="space-y-4">
          <p className="text-gray-400">Permanently delete <span className="text-white font-bold">{deletePos?.symbol}</span>? This cannot be undone.</p>
          {fErr && <p className="text-red-400 text-sm">{fErr}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setDeletePos(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doDelete} variant="danger" disabled={saving} className="flex-1">Delete</ActionBtn>
          </div>
        </div>
      </Modal>
    </div>

    </>
  );
}
