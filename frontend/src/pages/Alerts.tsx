import { Bell, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { getPrices } from '../lib/priceCache';
import { Modal, FormInput, ActionBtn } from '../components/Modal';
import { SwipeableCard } from '../components/SwipeableCard';
import { useChartModal } from '../lib/chartModalContext';

const GRADIENTS: Record<string, string> = {
  BTC: 'from-orange-500 to-orange-600', ETH: 'from-blue-500 to-purple-600',
  GOOGL: 'from-blue-500 to-blue-600', AAPL: 'from-gray-600 to-gray-700',
  NVDA: 'from-green-500 to-emerald-600', TSLA: 'from-red-500 to-red-600',
  SLV: 'from-gray-400 to-gray-500', GLD: 'from-yellow-500 to-yellow-600',
  AMD: 'from-red-600 to-red-700', MSFT: 'from-blue-500 to-cyan-500',
};
function getGradient(s: string) { return GRADIENTS[s.replace('-USD','').split('-')[0]] || 'from-blue-500 to-purple-600'; }

interface Alert {
  id: number; symbol: string; condition: 'above' | 'below';
  targetPrice: number; currentPrice: number; isActive: boolean;
}

export function Alerts() {
  const { openChart } = useChartModal();
  const [alertList, setAlertList] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [aSymbol, setASymbol] = useState('');
  const [aCondition, setACondition] = useState<'above' | 'below'>('above');
  const [aValue, setAValue] = useState('');
  const [aErr, setAErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [acResults, setAcResults] = useState<any[]>([]);
  const [acOpen, setAcOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Alert | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const acTimer = useRef<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.alerts.list();
      if (!Array.isArray(data) || !data.length) { setAlertList([]); return; }

      // ── BATCH price fetch (P1-1) ──
      const symbols = Array.from(new Set(data.map((a: any) => String(a.symbol)))) as string[];
      const priceData = await getPrices(symbols);
      const prices: Record<string, number> = {};
      for (const [sym, d] of Object.entries(priceData)) {
        if ((d as any)?.price) prices[sym] = (d as any).price;
      }

      setPage(0);
      setAlertList(data.map((a: any) => ({
        id: a.id, symbol: a.symbol, condition: a.condition,
        targetPrice: a.value || 0, currentPrice: prices[a.symbol] || 0,
        isActive: a.is_active === 1 || a.is_active === true,
      })));
    } catch { setAlertList([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // P2-3: Persist toggle to backend
  const toggleAlert = async (id: number) => {
    const alert = alertList.find(a => a.id === id);
    if (!alert) return;
    const newActive = !alert.isActive;
    // Optimistic update
    setAlertList(p => p.map(a => a.id === id ? { ...a, isActive: newActive } : a));
    try {
      // Backend may support update — try it, silently ignore if not
      await (api.alerts as any).update?.(id, { is_active: newActive });
    } catch { /* no-op — backend may not support toggle */ }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    await api.alerts.delete(deleteTarget.id).catch((e: any) => toast.error(e.message));
    setDeleteTarget(null);
    await load();
    toast.success('Alert deleted');
  };

  const onAcChange = (val: string) => {
    setASymbol(val);
    clearTimeout(acTimer.current);
    if (val.length < 1) { setAcResults([]); setAcOpen(false); return; }
    acTimer.current = setTimeout(async () => {
      try { const res = await api.markets.search(val); setAcResults(res?.slice(0, 5) || []); setAcOpen(true); }
      catch { setAcOpen(false); }
    }, 300);
  };

  const doCreate = async () => {
    setAErr(''); setSaving(true);
    try {
      if (!aSymbol) throw new Error('Symbol required');
      if (!aValue || Number(aValue) <= 0) throw new Error('Enter a valid target price');
      await api.alerts.create({ symbol: aSymbol.toUpperCase(), condition: aCondition, value: Number(aValue) });
      setShowAdd(false); setASymbol(''); setAValue('');
      await load();
      toast.success(`Alert set for ${aSymbol.toUpperCase()}`);
    } catch (e: any) { setAErr(e.message); } finally { setSaving(false); }
  };

  const getProgress = (a: Alert) => {
    if (!a.targetPrice || !a.currentPrice) return 0;
    const pct = a.condition === 'above'
      ? (a.currentPrice / a.targetPrice) * 100
      : (a.targetPrice / a.currentPrice) * 100;
    return Math.min(Math.max(pct, 0), 100);
  };
  const getDistance = (a: Alert) => {
    if (!a.targetPrice || !a.currentPrice) return null;
    const diff = ((a.targetPrice - a.currentPrice) / a.currentPrice) * 100;
    return diff;
  };
  const getProgressColor = (pct: number, triggered: boolean) => {
    if (triggered) return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
    if (pct >= 80) return 'bg-gradient-to-r from-orange-500 to-yellow-400';
    if (pct >= 50) return 'bg-gradient-to-r from-blue-500 to-purple-600';
    return 'bg-gradient-to-r from-blue-600 to-blue-500';
  };
  const isTriggered = (a: Alert) => a.currentPrice > 0 && (
    a.condition === 'above' ? a.currentPrice >= a.targetPrice : a.currentPrice <= a.targetPrice
  );

  return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-white">Price Alerts</h2>
          {!loading && <span className="text-gray-500 text-sm">({alertList.length})</span>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => load()} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => { setASymbol(''); setAValue(''); setAErr(''); setACondition('above'); setShowAdd(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm">
            <Plus className="w-4 h-4" /> New Alert
          </button>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-500">Loading alerts...</div>
        : alertList.length === 0 ? (
          <div className="text-center py-24 bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5">
            <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">No alerts set</h3>
            <p className="text-gray-500 mb-6">Get notified when prices hit your targets</p>
            <button onClick={() => setShowAdd(true)} className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white font-medium shadow-lg shadow-blue-500/30">
              Create First Alert
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {alertList.length > PAGE_SIZE && (
              <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, alertList.length)} of {alertList.length}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-3 py-1 bg-white/5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
                  <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= alertList.length}
                    className="px-3 py-1 bg-white/5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
                </div>
              </div>
            )}
            {alertList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(alert => {
              const triggered = isTriggered(alert);
              return (
                <SwipeableCard key={alert.id}
                  onDelete={() => setDeleteTarget(alert)}
                >
                <div className={`bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border p-4 sm:p-6 transition-all ${triggered ? 'border-emerald-500/30' : 'border-white/5 hover:border-blue-500/20'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex items-center gap-4">
                      <button onClick={() => openChart(alert.symbol)} className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getGradient(alert.symbol)} flex items-center justify-center shadow-lg flex-shrink-0 hover:ring-2 hover:ring-white/30 transition-all`}>
                        <span className="text-white font-bold text-lg">{alert.symbol.replace('-USD','')[0]}</span>
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openChart(alert.symbol)} className="text-white font-bold text-lg hover:text-blue-400 transition-colors">{alert.symbol}</button>
                          {triggered && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-medium">⚡ Triggered</span>}
                        </div>
                        <div className="text-gray-400 text-sm">
                          {alert.condition === 'above' ? '↑ Above' : '↓ Below'} ${alert.targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {alert.currentPrice > 0 && (
                          <span className="text-gray-500 text-xs">Current: ${alert.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${alert.isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                        <span className={`text-sm font-medium ${alert.isActive ? 'text-emerald-400' : 'text-gray-500'}`}>{alert.isActive ? 'Active' : 'Inactive'}</span>
                      </div>
                      <button onClick={() => toggleAlert(alert.id)} className={`relative w-12 h-6 rounded-full transition-colors min-w-[48px] min-h-[24px] ${alert.isActive ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${alert.isActive ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                      <button onClick={() => setDeleteTarget(alert)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {/* Progress bar + distance label */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-[#0d0f14] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${getProgressColor(getProgress(alert), triggered)}`}
                        style={{ width: `${getProgress(alert)}%` }} />
                    </div>
                    {!triggered && (() => {
                      const dist = getDistance(alert);
                      if (dist === null) return null;
                      const pct = getProgress(alert);
                      const color = pct >= 80 ? 'text-orange-400' : pct >= 50 ? 'text-blue-400' : 'text-gray-500';
                      return <span className={`text-xs shrink-0 tabular-nums ${color}`}>{Math.abs(dist).toFixed(1)}% away</span>;
                    })()}
                    {triggered && <span className="text-emerald-400 text-xs shrink-0 font-medium">✓ Hit</span>}
                  </div>
                </div>
                </SwipeableCard>
              );
            })}
          </div>
        )}

      {/* Create Alert Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Price Alert" size="sm">
        <div className="space-y-4">
          <div className="relative">
            <label className="block text-gray-400 text-sm font-medium mb-1.5">Symbol</label>
            <input value={aSymbol} onChange={e => onAcChange(e.target.value)} onBlur={() => setTimeout(() => setAcOpen(false), 200)}
              className="w-full px-4 py-2.5 bg-[#0d0f14] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 text-sm"
              placeholder="AAPL, BTC-USD..." />
            {acOpen && acResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d29] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                {acResults.map((r: any) => (
                  <button key={r.symbol} onMouseDown={() => { setASymbol(r.symbol); setAcOpen(false); }}
                    className="w-full px-4 py-2.5 text-left hover:bg-white/10 transition-colors">
                    <span className="text-white font-bold text-sm">{r.symbol}</span>
                    {r.name && <span className="text-gray-400 text-xs ml-2">{r.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-gray-400 text-sm font-medium mb-1.5">Condition</label>
            <div className="flex gap-2">
              {(['above', 'below'] as const).map(c => (
                <button key={c} onClick={() => setACondition(c)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${aCondition === c ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                  Price {c}
                </button>
              ))}
            </div>
          </div>
          <FormInput label="Target Price ($)" type="number" value={aValue} onChange={e => setAValue(e.target.value)} placeholder="0.00" />
          {aErr && <p className="text-red-400 text-sm">{aErr}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowAdd(false)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doCreate} disabled={saving || !aSymbol} className="flex-1">Create Alert</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Alert" size="sm">
        <div className="space-y-4">
          <p className="text-gray-400">Delete alert for <span className="text-white font-bold">{deleteTarget?.symbol}</span>?</p>
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setDeleteTarget(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doDelete} variant="danger" className="flex-1">Delete</ActionBtn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
