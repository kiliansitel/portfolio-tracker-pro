import { PieChart, Plus, Edit2, Trash2, Copy, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { getPrices } from '../lib/priceCache';
import { fmt } from '../lib/format';
import { Modal, FormInput, FormSelect, ActionBtn } from '../components/Modal';

/** Detect asset type from position, falling back to symbol-pattern detection for crypto. */
function getAssetType(p: any): string {
  const stored = (p.type || '').toLowerCase();
  if (stored === 'crypto') return 'crypto';
  if (stored && stored !== 'stock') return stored; // etf, option, etc.
  // Fallback: crypto symbols typically end with -USD / -USDT / -BTC / -ETH
  const sym = (p.symbol || '').toUpperCase();
  if (/-USD$|-USDT$|-BTC$|-ETH$/.test(sym)) return 'crypto';
  return 'stock';
}

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
];

export function Portfolio() {
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<any | null>(null);
  const [showCash, setShowCash] = useState<any | null>(null);
  const [showDelete, setShowDelete] = useState<any | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCash, setFormCash] = useState('');
  const [formCashCurrency, setFormCashCurrency] = useState('USD');
  const [formCashDelta, setFormCashDelta] = useState('');
  const [formCashAction, setFormCashAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.portfolio.all();
      setPortfolios(list || []);
      if (!selectedId && list?.length) setSelectedId(list[0].id);
    } finally { setLoading(false); }
  };

  const loadPositions = async (pid: number) => {
    const pos = await api.portfolio.positions(pid).catch(() => []);
    const open = (pos || []).filter((p: any) => p.status === 'open' || !p.status);
    setPositions(open);
    const symbols = Array.from(new Set(open.map((p: any) => String(p.symbol)))) as string[];
    const priceData = await getPrices(symbols);
    const pm: Record<string, number> = {};
    for (const [sym, d] of Object.entries(priceData)) {
      if ((d as any)?.price) pm[sym] = (d as any).price;
    }
    setPriceMap(pm);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedId) loadPositions(selectedId); }, [selectedId]);

  const selected = portfolios.find(p => p.id === selectedId);
  const posValue = positions.reduce((s, p) => s + (p.quantity || 0) * (priceMap[p.symbol] || 0), 0);
  const invested = positions.reduce((s, p) => s + (p.quantity || 0) * (p.entry_price || 0), 0);
  const cashUsd = selected?.cash || 0;
  const totalValue = posValue + cashUsd;
  const totalPL = posValue - invested;
  const plPct = invested > 0 ? (totalPL / invested) * 100 : 0;

  // Group positions by type for exposure — uses smart classification (fixes crypto-as-stock bug)
  const exposure = positions.reduce((acc: Record<string, number>, p: any) => {
    const type = getAssetType(p);
    acc[type] = (acc[type] || 0) + (p.quantity || 0) * (priceMap[p.symbol] || 0);
    return acc;
  }, {});

  const doCreate = async () => {
    setErr(''); setSaving(true);
    try {
      await api.portfolio.create(formName.trim(), Number(formCash) || 0);
      setShowCreate(false); setFormName(''); setFormCash('');
      await load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const doEdit = async () => {
    setErr(''); setSaving(true);
    try {
      await api.portfolio.update(showEdit.id, { name: formName.trim(), cash_currency: formCashCurrency });
      setShowEdit(null);
      await load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const doCash = async () => {
    setErr(''); setSaving(true);
    try {
      const delta = Number(formCashDelta);
      if (isNaN(delta) || delta <= 0) throw new Error('Enter a valid amount');
      const current = showCash.cash || 0;
      const newCash = formCashAction === 'deposit' ? current + delta : Math.max(0, current - delta);
      await api.portfolio.update(showCash.id, { cash: newCash });
      setShowCash(null); setFormCashDelta('');
      await load(); loadPositions(showCash.id);
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const [dupTarget, setDupTarget] = useState<any | null>(null);
  const doDuplicate = async () => {
    if (!dupTarget) return;
    await api.portfolio.duplicate(dupTarget.id).catch(console.error);
    setDupTarget(null);
    toast.success(`"${dupTarget.name}" duplicated`);
    await load();
  };

  const doDelete = async () => {
    setSaving(true);
    try {
      await api.portfolio.delete(showDelete.id);
      setShowDelete(null);
      if (selectedId === showDelete.id) setSelectedId(null);
      await load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <PieChart className="w-6 h-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-white">Portfolio</h2>
        </div>
        <button
          onClick={() => { setFormName(''); setFormCash(''); setErr(''); setShowCreate(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm"
        >
          <Plus className="w-4 h-4" /> New Portfolio
        </button>
      </div>

      {/* Portfolio Tabs */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {portfolios.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedId === p.id
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {p.name}
            {selectedId === p.id && (
              <div className="flex items-center gap-1 ml-1">
                <Edit2 className="w-3 h-3 opacity-60 hover:opacity-100 cursor-pointer" onClick={e => { e.stopPropagation(); setFormName(p.name); setFormCashCurrency(p.cash_currency || 'USD'); setErr(''); setShowEdit(p); }} />
                <Copy className="w-3 h-3 opacity-60 hover:opacity-100 cursor-pointer" onClick={e => { e.stopPropagation(); setDupTarget(p); }} />
                {portfolios.length > 1 && <Trash2 className="w-3 h-3 opacity-60 hover:opacity-100 cursor-pointer text-red-400" onClick={e => { e.stopPropagation(); setErr(''); setShowDelete(p); }} />}
              </div>
            )}
          </button>
        ))}
      </div>

      {selected ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 mb-8">
            <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5">
              <div className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">Total Value</div>
              <div className="text-xl sm:text-3xl font-bold text-white truncate">{fmt(totalValue)}</div>
            </div>
            <div className={`bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border ${totalPL >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
              <div className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">Total P/L (vs. cost)</div>
              <div className={`text-xl sm:text-3xl font-bold truncate ${totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPL >= 0 ? '+' : '-'}{fmt(Math.abs(totalPL))}
              </div>
              {invested > 0 && <div className={`text-xs sm:text-sm mt-1 ${totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{plPct >= 0 ? '+' : '-'}{Math.abs(plPct).toFixed(1)}%</div>}
            </div>
            <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5">
              <div className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">Open Positions</div>
              <div className="text-xl sm:text-3xl font-bold text-white truncate">{positions.length}</div>
              <div className="text-gray-500 text-xs sm:text-sm mt-1">{fmt(posValue)} value</div>
            </div>
            <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-blue-500/20">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <div className="text-gray-400 text-xs sm:text-sm">Cash</div>
                <button onClick={() => { setFormCashDelta(''); setFormCashAction('deposit'); setErr(''); setShowCash(selected); }}
                  className="p-1 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30 transition-colors">
                  <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
              <div className="text-xl sm:text-3xl font-bold text-blue-400 truncate">{fmt(cashUsd)}</div>
              <div className="text-gray-500 text-xs sm:text-sm mt-1">{selected.cash_currency || 'USD'}</div>
            </div>
          </div>

          {/* Allocation */}
          {Object.keys(exposure).length > 0 && (
            <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-6 mb-8">
              <h3 className="text-white font-semibold mb-4">Asset Allocation</h3>
              <div className="space-y-3">
                {Object.entries(exposure)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([type, val]) => {
                    const pct = totalValue > 0 ? ((val as number) / totalValue) * 100 : 0;
                    const colors: Record<string, string> = { crypto: 'from-orange-500 to-yellow-500', stock: 'from-blue-500 to-purple-600', option: 'from-pink-500 to-rose-600' };
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400 capitalize">{type}</span>
                          <span className="text-white font-medium">{pct.toFixed(1)}% — {fmt(val as number)}</span>
                        </div>
                        <div className="h-2 bg-[#0d0f14] rounded-full overflow-hidden">
                          <div className={`h-full bg-gradient-to-r ${colors[type] || 'from-blue-500 to-purple-600'} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Cash</span>
                    <span className="text-white font-medium">{totalValue > 0 ? ((cashUsd / totalValue) * 100).toFixed(1) : 0}% — {fmt(cashUsd)}</span>
                  </div>
                  <div className="h-2 bg-[#0d0f14] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${totalValue > 0 ? (cashUsd / totalValue) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Holdings */}
          {positions.length > 0 && (
            <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-6">
              <h3 className="text-white font-semibold mb-4">Top Holdings</h3>
              <div className="space-y-3">
                {positions
                  .map((p: any) => ({ ...p, value: (p.quantity || 0) * (priceMap[p.symbol] || 0) }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 8)
                  .map((p: any) => {
                    const pct = totalValue > 0 ? (p.value / totalValue) * 100 : 0;
                    return (
                      <div key={p.id} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-xs">{p.symbol[0]}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-white font-medium">{p.symbol}</span>
                            <span className="text-gray-400">{pct.toFixed(1)}% — {fmt(p.value)}</span>
                          </div>
                          <div className="h-1.5 bg-[#0d0f14] rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20">
          <PieChart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No portfolios yet. Create one to get started.</p>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Portfolio" size="sm">
        <div className="space-y-4">
          <FormInput label="Name" value={formName} onChange={e => setFormName(e.target.value)} placeholder="My Portfolio" />
          <FormInput label="Initial Cash" value={formCash} onChange={e => setFormCash(e.target.value)} type="number" placeholder="0" />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowCreate(false)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doCreate} disabled={saving || !formName.trim()} className="flex-1">Create</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="Edit Portfolio" size="sm">
        <div className="space-y-4">
          <FormInput label="Name" value={formName} onChange={e => setFormName(e.target.value)} />
          <FormSelect label="Cash Currency" value={formCashCurrency} onChange={e => setFormCashCurrency(e.target.value)} options={CURRENCIES} />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowEdit(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doEdit} disabled={saving} className="flex-1">Save</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Cash Modal */}
      <Modal open={!!showCash} onClose={() => setShowCash(null)} title="Manage Cash" size="sm">
        <div className="space-y-4">
          <div className="p-4 bg-[#0d0f14] rounded-xl">
            <div className="text-gray-400 text-sm">Current Balance</div>
            <div className="text-2xl font-bold text-blue-400">{fmt(showCash?.cash || 0)}</div>
          </div>
          <div className="flex gap-2">
            {(['deposit', 'withdraw'] as const).map(a => (
              <button key={a} onClick={() => setFormCashAction(a)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all capitalize ${formCashAction === a ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                {a}
              </button>
            ))}
          </div>
          <FormInput label="Amount" type="number" value={formCashDelta} onChange={e => setFormCashDelta(e.target.value)} placeholder="0.00" />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowCash(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doCash} disabled={saving || !formCashDelta} className="flex-1">
              {formCashAction === 'deposit' ? 'Deposit' : 'Withdraw'}
            </ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Duplicate Confirm Modal */}
      <Modal open={!!dupTarget} onClose={() => setDupTarget(null)} title="Duplicate Portfolio" size="sm">
        <div className="space-y-4">
          <p className="text-gray-400">Duplicate <span className="text-white font-bold">"{dupTarget?.name}"</span>? A copy will be created.</p>
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setDupTarget(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doDuplicate} className="flex-1">Duplicate</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!showDelete} onClose={() => setShowDelete(null)} title="Delete Portfolio" size="sm">
        <div className="space-y-4">
          <p className="text-gray-400">Are you sure you want to delete <span className="text-white font-bold">"{showDelete?.name}"</span>? This cannot be undone.</p>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowDelete(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doDelete} variant="danger" disabled={saving} className="flex-1">Delete</ActionBtn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
