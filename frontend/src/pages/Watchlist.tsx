import { ChevronDown, Plus, ChevronRight, RefreshCw, Search, Trash2, Bell, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Modal, FormInput, FormSelect, ActionBtn } from '../components/Modal';

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

interface WatchItem { id: number; symbol: string; name: string; price: number; change: number; changePercent: number; }
interface Watchlist { id: number; name: string; items: WatchItem[]; }

export function Watchlist() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Add symbol modal
  const [showAdd, setShowAdd] = useState(false);
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

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchPrices = async (symbols: string[]): Promise<Record<string, any>> => {
    const results: Record<string, any> = {};
    const chunks: string[][] = [];
    for (let i = 0; i < symbols.length; i += 5) chunks.push(symbols.slice(i, i + 5));
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (sym) => {
        try { const d = await api.markets.price(sym); if (d) results[sym] = d; } catch { /**/ }
      }));
    }
    return results;
  };

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
          const pd = prices[item.symbol] || {};
          return { id: item.id, symbol: item.symbol, name: item.name || item.symbol, price: pd.price || 0, change: pd.change || 0, changePercent: pd.changePercent || 0 };
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
      showToast(`${addSymbol.toUpperCase()} added to watchlist`);
    } catch (e: any) { setAddErr(e.message); } finally { setSaving(false); }
  };

  const doRemove = async (item: WatchItem) => {
    if (!confirm(`Remove ${item.symbol}?`)) return;
    await api.removeFromWatchlist(item.id).catch(e => showToast(e.message));
    await loadWatchlists(true);
    showToast(`${item.symbol} removed`);
  };

  const doCreateList = async () => {
    if (!newListName.trim()) return;
    setSaving(true);
    try {
      const newList = await api.createWatchlist(newListName.trim());
      setShowCreateList(false); setNewListName('');
      await loadWatchlists();
      if (newList?.id) setSelectedId(newList.id);
      showToast('Watchlist created');
    } catch (e: any) { showToast(e.message); } finally { setSaving(false); }
  };

  const doCreateAlert = async () => {
    setAlertErr('');
    if (!alertValue || Number(alertValue) <= 0) { setAlertErr('Enter a valid price'); return; }
    setSaving(true);
    try {
      await api.alerts.create({ symbol: alertItem!.symbol, condition: alertCondition, value: Number(alertValue) });
      setAlertItem(null); setAlertValue('');
      showToast(`Alert set for ${alertItem!.symbol}`);
    } catch (e: any) { setAlertErr(e.message); } finally { setSaving(false); }
  };

  const selectedList = watchlists.find(wl => wl.id === selectedId) || watchlists[0];
  const allItems = selectedList?.items || [];
  const topGainer = allItems.length ? allItems.reduce((b, c) => c.changePercent > b.changePercent ? c : b, allItems[0]) : null;
  const topLoser = allItems.length ? allItems.reduce((b, c) => c.changePercent < b.changePercent ? c : b, allItems[0]) : null;

  return (
    <div className="p-8 max-w-[1440px] mx-auto">
      {toast && <div className="fixed bottom-6 right-6 z-50 px-6 py-3 rounded-xl shadow-xl font-medium text-sm text-white bg-blue-500">{toast}</div>}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
          <h2 className="text-2xl font-bold text-white">Watchlist</h2>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => loadWatchlists(true)} disabled={refreshing} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setShowCreateList(true); setNewListName(''); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
            + New List
          </button>
          <button onClick={() => { setAddSymbol(''); setAddNotes(''); setAddErr(''); setShowAdd(true); }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm">
            <Plus className="w-4 h-4" /> Add Symbol
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
              loading ? <div className="px-6 py-8 text-center text-gray-500 text-sm">Loading...</div>
              : selectedList.items.length === 0
                ? <div className="px-6 py-10 text-center text-gray-500 text-sm">No items. <button onClick={() => setShowAdd(true)} className="text-blue-400 hover:underline">Add a symbol</button></div>
                : selectedList.items.map(item => {
                    const isPos = item.changePercent >= 0;
                    return (
                      <div key={item.id} className="group px-6 py-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0">
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
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              {item.price > 0 ? (
                                <>
                                  <div className="text-white font-bold">${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                  <div className={`text-sm font-semibold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>{isPos ? '+' : ''}{item.changePercent.toFixed(2)}%</div>
                                </>
                              ) : <div className="text-gray-600 text-sm">—</div>}
                            </div>
                            <div className="flex items-center gap-1 opacity-100 transition-opacity">
                              <button onClick={() => { setAlertItem(item); setAlertCondition('above'); setAlertValue(item.price ? item.price.toFixed(2) : ''); setAlertErr(''); }}
                                className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors" title="Set alert">
                                <Bell className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => doRemove(item)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Remove">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
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
    </div>
  );
}
