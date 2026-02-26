import { ChevronDown, Plus, ChevronRight, RefreshCw, Trash2, Bell } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api';
import { getPrices } from '../lib/priceCache';
import { Modal, FormInput, ActionBtn } from '../components/Modal';
import { Skeleton } from '../components/ui/skeleton';
import { ChartModal } from '../components/ChartModal';
import { MarketStateBadge } from '../components/MarketStateBadge';
import { useLivePrices, usePriceFlash } from '../lib/useLivePrices';
import { SwipeableCard } from '../components/SwipeableCard';

function PriceCell({ price, changePercent, marketState }: { price: number; changePercent: number; marketState?: string }) {
  const flashClass = usePriceFlash(price);
  const isPos = changePercent >= 0;
  return (
    <div className={`text-right transition-colors rounded ${flashClass}`}>
      <div className="flex items-center gap-1 justify-end">
        <MarketStateBadge marketState={marketState} />
        <span className="text-white font-bold">${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div className={`text-sm font-semibold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>{isPos ? '+' : ''}{changePercent.toFixed(2)}%</div>
    </div>
  );
}

/** Sparkline from synthetic 8-point data derived from day change */
function MiniSparkline({ price, changePercent }: { price: number; changePercent: number }) {
  const isPos = changePercent >= 0;
  const color = isPos ? '#10b981' : '#ef4444';
  // Generate 8 points: starts at yesterday's close, ends at today's close
  const startPrice = price / (1 + changePercent / 100);
  const data = Array.from({ length: 8 }, (_, i) => ({
    v: Number((startPrice + (price - startPrice) * (i / 7) + (Math.sin(i * 0.8) * Math.abs(changePercent) * startPrice * 0.001)).toFixed(4)),
  }));
  return (
    <div className="w-28 h-10 flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`sg-${isPos ? 'g' : 'r'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sg-${isPos ? 'g' : 'r'})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const LOGO_GRADIENTS: Record<string, string> = {
  BTC: 'from-orange-500 to-orange-600', ETH: 'from-blue-500 to-purple-600',
  BNB: 'from-yellow-500 to-yellow-600', NVDA: 'from-green-500 to-emerald-600',
  TSLA: 'from-red-500 to-red-600', AAPL: 'from-gray-500 to-gray-600',
  INTC: 'from-blue-600 to-blue-700', AMD: 'from-red-600 to-red-700',
  MSFT: 'from-blue-500 to-cyan-500', AMZN: 'from-orange-400 to-yellow-500',
};
function getGradient(symbol: string): string {
  const r = symbol.replace('-USD', '').split('-')[0];
  return LOGO_GRADIENTS[r] || 'from-blue-500 to-purple-600';
}

interface WatchItem { id: number; symbol: string; name: string; price: number; change: number; changePercent: number; marketState?: string; }
interface Watchlist { id: number; name: string; items: WatchItem[]; }

export function Watchlist() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Add symbol modal
  const [showAdd, setShowAdd] = useState(false);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [addSymbol, setAddSymbol] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [acResults, setAcResults] = useState<any[]>([]);
  const [acOpen, setAcOpen] = useState(false);
  const acTimer = useRef<any>(null);
  const [addErr, setAddErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Create watchlist modal
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Alert modal
  const [alertItem, setAlertItem] = useState<WatchItem | null>(null);
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertValue, setAlertValue] = useState('');
  const [alertErr, setAlertErr] = useState('');

  const [removeItem, setRemoveItem] = useState<WatchItem | null>(null);
  const [editItem, setEditItem] = useState<WatchItem | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editTargetDir, setEditTargetDir] = useState<'above' | 'below'>('above');
  const [editSaving, setEditSaving] = useState(false);

  // ── BATCH price fetch (P1-1) ──
  const fetchPrices = getPrices;

  const loadWatchlists = async (showRef = false) => {
    if (showRef) setRefreshing(true);
    try {
      const rawLists = await api.watchlists();
      if (!Array.isArray(rawLists) || !rawLists.length) { setWatchlists([]); return; }
      const allSymbols = Array.from(new Set(rawLists.flatMap((wl: any) => (wl.items || []).map((i: any) => String(i.symbol))))) as string[];
      const prices = await fetchPrices(allSymbols as string[]);
      const enriched: Watchlist[] = rawLists.map((wl: any) => ({
        id: wl.id, name: wl.name,
        items: (wl.items || []).map((item: any) => {
          const pd = (prices[item.symbol] as any) || {};
          return { id: item.id, symbol: item.symbol, name: item.name || item.symbol, price: pd.price || 0, change: pd.change || 0, changePercent: pd.changePercent || 0, marketState: (pd as any).marketState };
        }),
      }));
      setWatchlists(enriched);
      if (selectedId === null && enriched.length) setSelectedId(enriched[0].id);
      setExpandedSections(prev => {
        const next = { ...prev };
        enriched.forEach(wl => { if (!(wl.id in next)) next[wl.id] = true; });
        return next;
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadWatchlists(); }, []);

  // Autocomplete
  const onAcChange = (val: string) => {
    setAddSymbol(val);
    clearTimeout(acTimer.current);
    if (val.length < 1) { setAcResults([]); setAcOpen(false); return; }
    acTimer.current = setTimeout(async () => {
      try { const res = await api.markets.search(val); setAcResults(res?.slice(0, 6) || []); setAcOpen(true); }
      catch { setAcOpen(false); }
    }, 300);
  };
  const pickAc = (item: any) => { setAddSymbol(item.symbol || item.ticker || item); setAcOpen(false); setAcResults([]); };

  const doAdd = async () => {
    setAddErr(''); setSaving(true);
    try {
      if (!addSymbol) throw new Error('Symbol required');
      if (!selectedId) throw new Error('Select a watchlist');
      await api.addToWatchlist(selectedId, addSymbol.toUpperCase(), addNotes || undefined);
      setShowAdd(false); setAddSymbol(''); setAddNotes('');
      await loadWatchlists(true);
      toast.success(`${addSymbol.toUpperCase()} added to watchlist`);
    } catch (e: any) { setAddErr(e.message); } finally { setSaving(false); }
  };

  const doRemove = async () => {
    if (!removeItem) return;
    await api.removeFromWatchlist(removeItem.id).catch((e: any) => toast.error(e.message));
    setRemoveItem(null);
    await loadWatchlists(true);
    toast.success(`${removeItem.symbol} removed`);
  };

  const openEditItem = (item: WatchItem) => {
    setEditItem(item);
    setEditNote('');
    setEditTarget('');
    setEditTargetDir('above');
  };

  const doSaveEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    try {
      // Set a price alert if target is provided
      if (editTarget && Number(editTarget) > 0) {
        await api.alerts.create({
          symbol: editItem.symbol,
          condition: editTargetDir === 'above' ? 'above' : 'below',
          value: Number(editTarget),
        });
        toast.success(`Alert set: ${editItem.symbol} ${editTargetDir} $${editTarget}`);
      } else {
        toast.success('Saved');
      }
      setEditItem(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setEditSaving(false); }
  };

  const doCreateList = async () => {
    if (!newListName.trim()) return;
    setSaving(true);
    try {
      const newList = await api.createWatchlist(newListName.trim());
      setShowCreateList(false); setNewListName('');
      await loadWatchlists();
      if (newList?.id) setSelectedId(newList.id);
      toast.success('Watchlist created');
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const doCreateAlert = async () => {
    setAlertErr('');
    if (!alertValue || Number(alertValue) <= 0) { setAlertErr('Enter a valid price'); return; }
    setSaving(true);
    try {
      await api.alerts.create({ symbol: alertItem!.symbol, condition: alertCondition, value: Number(alertValue) });
      setAlertItem(null); setAlertValue('');
      toast.success(`Alert set for ${alertItem!.symbol}`);
    } catch (e: any) { setAlertErr(e.message); } finally { setSaving(false); }
  };

  const selectedList = watchlists.find(wl => wl.id === selectedId) || watchlists[0];
  const rawItems = selectedList?.items || [];
  // Live price overlay — merges real-time prices on top of cached data
  const { prices: livePrices, isLive: pricesLive } = useLivePrices(rawItems.map(i => i.symbol));
  const allItems: WatchItem[] = rawItems.map(item => {
    const lp = livePrices[item.symbol];
    if (!lp) return item;
    return { ...item, price: lp.price || item.price, change: lp.change ?? item.change, changePercent: lp.changePercent ?? item.changePercent, marketState: (lp as any).marketState };
  });
  const topGainer = allItems.length ? allItems.reduce((b, c) => c.changePercent > b.changePercent ? c : b, allItems[0]) : null;
  const topLoser = allItems.length ? allItems.reduce((b, c) => c.changePercent < b.changePercent ? c : b, allItems[0]) : null;

  return (
    <>
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
          <h2 className="text-2xl font-bold text-white">Watchlist</h2>
          {pricesLive && <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-emerald-400 text-xs">Live</span></span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadWatchlists(true)} disabled={refreshing} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px]">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setShowCreateList(true); setNewListName(''); }} className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white text-sm transition-colors min-h-[44px]">
            + New List
          </button>
          <button onClick={() => { setAddSymbol(''); setAddNotes(''); setAddErr(''); setShowAdd(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm min-h-[44px]">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Watchlist Container */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-hidden mb-6">
        {/* List tabs */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2 flex-wrap">
          {watchlists.map(wl => (
            <button key={wl.id} onClick={() => setSelectedId(wl.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedId === wl.id ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}>
              {wl.name} <span className="opacity-60">({wl.items.length})</span>
            </button>
          ))}
        </div>

        {selectedList && (
          <>
            <button onClick={() => setExpandedSections(p => ({ ...p, [selectedList.id]: !p[selectedList.id] }))}
              className="w-full px-6 py-3 flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors">
              {expandedSections[selectedList.id] !== false ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              <span className="text-white font-semibold text-sm">{selectedList.name} ({selectedList.items.length})</span>
            </button>
            {expandedSections[selectedList.id] !== false && (
              loading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-white/5" />)}
                </div>
              )
              : selectedList.items.length === 0
                ? <div className="px-6 py-10 text-center text-gray-500 text-sm">No items. <button onClick={() => setShowAdd(true)} className="text-blue-400 hover:underline">Add a symbol</button></div>
                : allItems.map(item => {
                    return (
                      <SwipeableCard key={item.id}
                        onEdit={() => openEditItem(item)}
                        onDelete={() => setRemoveItem(item)}
                      >
                      <div className="group px-6 py-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => setChartSymbol(item.symbol)}>
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getGradient(item.symbol)} flex items-center justify-center shadow-lg flex-shrink-0`}>
                              <span className="text-white font-bold text-sm">{item.symbol.replace('-USD','')[0]}</span>
                            </div>
                            <div>
                              <div className="text-white font-bold">{item.symbol}</div>
                              <div className="text-gray-500 text-sm">{item.name}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3">
                              {item.price > 0 && <MiniSparkline price={item.price} changePercent={item.changePercent} />}
                              <div>
                                {item.price > 0
                                  ? <PriceCell price={item.price} changePercent={item.changePercent} marketState={item.marketState} />
                                  : <div className="text-gray-600 text-sm text-right">—</div>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setAlertItem(item); setAlertCondition('above'); setAlertValue(item.price ? item.price.toFixed(2) : ''); setAlertErr(''); }}
                                className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center" title="Set alert">
                                <Bell className="w-4 h-4" />
                              </button>
                              <button onClick={() => setRemoveItem(item)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center" title="Remove">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      </SwipeableCard>
                    );
                  })
            )}
          </>
        )}
        {!loading && watchlists.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500">No watchlists. <button onClick={() => setShowCreateList(true)} className="text-blue-400 hover:underline">Create one</button></div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
          <div className="text-gray-400 text-sm mb-2">Top Gainer</div>
          <div className="text-xl font-bold text-white">{topGainer?.symbol || '—'}</div>
          <div className="text-emerald-400 text-lg font-semibold">{topGainer && topGainer.changePercent > 0 ? `+${topGainer.changePercent.toFixed(2)}%` : '—'}</div>
        </div>
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
          <div className="text-gray-400 text-sm mb-2">Lowest Performer</div>
          <div className="text-xl font-bold text-white">{topLoser?.symbol || '—'}</div>
          <div className="text-red-400 text-lg font-semibold">{topLoser ? `${topLoser.changePercent >= 0 ? '+' : ''}${topLoser.changePercent.toFixed(2)}%` : '—'}</div>
        </div>
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
          <div className="text-gray-400 text-sm mb-2">Total Items</div>
          <div className="text-3xl font-bold text-white">{allItems.length}</div>
          <div className="text-gray-500 text-sm">{watchlists.length} list{watchlists.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Add Symbol Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add to Watchlist" size="sm">
        <div className="space-y-4">
          {watchlists.length > 1 && (
            <div>
              <label className="block text-gray-400 text-sm font-medium mb-1.5">Watchlist</label>
              <select value={selectedId || ''} onChange={e => setSelectedId(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-[#0d0f14] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/50">
                {watchlists.map(wl => <option key={wl.id} value={wl.id}>{wl.name}</option>)}
              </select>
            </div>
          )}
          <div className="relative">
            <label className="block text-gray-400 text-sm font-medium mb-1.5">Symbol</label>
            <input value={addSymbol} onChange={e => onAcChange(e.target.value)} onBlur={() => setTimeout(() => setAcOpen(false), 200)}
              className="w-full px-4 py-2.5 bg-[#0d0f14] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 text-sm"
              placeholder="AAPL, BTC-USD..." />
            {acOpen && acResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d29] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                {acResults.map((r: any) => (
                  <button key={r.symbol || r.ticker} onMouseDown={() => pickAc(r)}
                    className="w-full px-4 py-2.5 text-left hover:bg-white/10 transition-colors">
                    <span className="text-white font-bold text-sm">{r.symbol || r.ticker}</span>
                    {r.name && <span className="text-gray-400 text-xs ml-2">{r.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <FormInput label="Notes (optional)" value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="e.g. Watching for breakout" />
          {addErr && <p className="text-red-400 text-sm">{addErr}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowAdd(false)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doAdd} disabled={saving || !addSymbol} className="flex-1">Add</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Create List Modal */}
      <Modal open={showCreateList} onClose={() => setShowCreateList(false)} title="New Watchlist" size="sm">
        <div className="space-y-4">
          <FormInput label="Name" value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="My Growth Picks" />
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowCreateList(false)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doCreateList} disabled={saving || !newListName.trim()} className="flex-1">Create</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Alert Modal */}
      <Modal open={!!alertItem} onClose={() => setAlertItem(null)} title={`Set Alert — ${alertItem?.symbol}`} size="sm">
        <div className="space-y-4">
          {alertItem?.price > 0 && (
            <div className="p-3 bg-[#0d0f14] rounded-xl text-sm">
              <span className="text-gray-400">Current price: </span>
              <span className="text-white font-bold">${alertItem.price.toFixed(2)}</span>
            </div>
          )}
          <div className="flex gap-2">
            {(['above', 'below'] as const).map(c => (
              <button key={c} onClick={() => setAlertCondition(c)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${alertCondition === c ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                {c}
              </button>
            ))}
          </div>
          <FormInput label="Target Price ($)" type="number" value={alertValue} onChange={e => setAlertValue(e.target.value)} placeholder="0.00" />
          {alertErr && <p className="text-red-400 text-sm">{alertErr}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setAlertItem(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doCreateAlert} disabled={saving} className="flex-1">Set Alert</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Remove Confirm Modal */}
      <Modal open={!!removeItem} onClose={() => setRemoveItem(null)} title="Remove from Watchlist" size="sm">
        <div className="space-y-4">
          <p className="text-gray-400">Remove <span className="text-white font-bold">{removeItem?.symbol}</span> from this watchlist?</p>
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setRemoveItem(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doRemove} variant="danger" className="flex-1">Remove</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Edit item modal — set price alert target */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`${editItem?.symbol} — Set Alert`} size="sm">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Set a price alert for <span className="text-white font-bold">{editItem?.symbol}</span>. Current: <span className="text-white">${(editItem?.price || 0).toFixed(2)}</span></p>
          <div className="flex gap-2">
            <button onClick={() => setEditTargetDir('above')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${editTargetDir === 'above' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-gray-400 border border-white/10'}`}>▲ Above</button>
            <button onClick={() => setEditTargetDir('below')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${editTargetDir === 'below' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-gray-400 border border-white/10'}`}>▼ Below</button>
          </div>
          <FormInput label="Target Price ($)" value={editTarget} onChange={e => setEditTarget(e.target.value)} placeholder="e.g. 200.00" type="number" />
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setEditItem(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doSaveEdit} disabled={editSaving || !editTarget} className="flex-1">Set Alert</ActionBtn>
          </div>
        </div>
      </Modal>
    </div>

    {chartSymbol && <ChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />}
    </>
  );
}
