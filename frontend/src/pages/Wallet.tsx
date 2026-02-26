import { Wallet as WalletIcon, Plus, Trash2, ArrowUpRight, ArrowDownLeft, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { fmt, dateLabel } from '../lib/format';
import { Modal, FormInput, FormSelect, ActionBtn } from '../components/Modal';

const TX_TYPES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'deposit', label: 'Cash Deposit' },
  { value: 'withdrawal', label: 'Cash Withdrawal' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'fee', label: 'Fee' },
];

export function Wallet() {
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDelete, setShowDelete] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  

  // Form
  const [txType, setTxType] = useState('deposit');
  const [txSymbol, setTxSymbol] = useState('');
  const [txQty, setTxQty] = useState('');
  const [txPrice, setTxPrice] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txNotes, setTxNotes] = useState('');

  // Cash edit
  const [showEditCash, setShowEditCash] = useState(false);
  const [cashValue, setCashValue] = useState('');
  const [cashCurrency, setCashCurrency] = useState('USD');

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.portfolio.all();
      setPortfolios(list || []);
      if (!selectedId && list?.length) setSelectedId(list[0].id);
    } finally { setLoading(false); }
  };

  const loadTx = async (pid: number) => {
    try {
      const data = await api.portfolio.transactions(pid);
      setTransactions(Array.isArray(data) ? data : []);
    } catch { setTransactions([]); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedId) loadTx(selectedId); }, [selectedId]);

  const selected = portfolios.find(p => p.id === selectedId);

  const openEditCash = () => {
    if (!selected) return;
    const cv = Number(selected.cash ?? 0);
    setCashValue(Number.isFinite(cv) ? cv.toFixed(2) : '0.00');
    setCashCurrency(selected.cash_currency || 'USD');
    setErr('');
    setShowEditCash(true);
  };

  const doUpdateCash = async () => {
    if (!selected) return;
    setErr('');
    setSaving(true);
    try {
      const v = Number(cashValue);
      if (!Number.isFinite(v)) throw new Error('Cash must be a number');
      await api.portfolio.update(selected.id, { cash: v, cash_currency: cashCurrency });
      await load();
      toast.success('Cash balance updated');
      setShowEditCash(false);
    } catch (e: any) {
      setErr(e.message || 'Failed to update cash');
    } finally {
      setSaving(false);
    }
  };

  const doAdd = async () => {
    setErr(''); setSaving(true);
    try {
      if (!selectedId) throw new Error('Select a portfolio');
      if (!txDate) throw new Error('Date required');
      const payload: any = { type: txType, date: txDate, notes: txNotes || undefined };
      if (['buy', 'sell'].includes(txType)) {
        if (!txSymbol) throw new Error('Symbol required');
        if (!txQty || Number(txQty) <= 0) throw new Error('Quantity required');
        if (!txPrice || Number(txPrice) <= 0) throw new Error('Price required');
        payload.symbol = txSymbol.toUpperCase();
        payload.quantity = Number(txQty);
        payload.price = Number(txPrice);
      } else {
        if (!txPrice || Number(txPrice) <= 0) throw new Error('Amount required');
        payload.amount = Number(txPrice);
      }
      await api.portfolio.createTransaction(selectedId, payload);
      setShowAdd(false);
      setTxSymbol(''); setTxQty(''); setTxPrice(''); setTxNotes(''); setTxType('deposit');
      await loadTx(selectedId);
      await load();
      toast.success('Transaction added');
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const doDelete = async (id: number) => {
    await api.portfolio.deleteTransaction(id).catch(e => toast.error(e.message));
    setShowDelete(null);
    if (selectedId) { await loadTx(selectedId); await load(); }
    toast.success('Transaction deleted');
  };

  // Summary
  const deposits = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0);
  const withdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
  const dividends = transactions.filter(t => t.type === 'dividend').reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <WalletIcon className="w-6 h-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-white">Wallet</h2>
        </div>
        <button onClick={() => { setErr(''); setShowAdd(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm">
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>

      {/* Portfolio Tabs */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {portfolios.map(p => (
          <button key={p.id} onClick={() => setSelectedId(p.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedId === p.id ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}>
            {p.name}
          </button>
        ))}
      </div>

      {/* Cash Balance Card */}
      {selected && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-400" />
                <div className="text-gray-400 text-sm">Cash Balance</div>
              </div>
              <button onClick={openEditCash} className="text-xs text-blue-300 hover:text-blue-200 hover:underline">
                Edit
              </button>
            </div>
            <div className="text-3xl font-bold text-blue-400">{fmt(selected.cash || 0)}</div>
            <div className="text-gray-500 text-xs mt-1">{selected.cash_currency || 'USD'}</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-emerald-500/20">
            <div className="text-gray-400 text-sm mb-1">Total Deposits</div>
            <div className="text-2xl font-bold text-emerald-400">{fmt(deposits)}</div>
            <div className="text-gray-600 text-xs mt-1">From recorded transactions</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-red-500/20">
            <div className="text-gray-400 text-sm mb-2">Total Withdrawals</div>
            <div className="text-2xl font-bold text-red-400">{fmt(withdrawals)}</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-emerald-500/20">
            <div className="text-gray-400 text-sm mb-2">Dividends Received</div>
            <div className="text-2xl font-bold text-emerald-300">{fmt(dividends)}</div>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-x-auto">
        <div className="px-6 py-4 border-b border-white/5">
          <h3 className="text-white font-semibold">Transaction History</h3>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <WalletIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No transactions yet</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-white/5 border-b border-white/5">
              {['Date', 'Type', 'Symbol', 'Qty', 'Price / Amount', 'Total', ''].map((h, i) => (
                <div key={i} className={`col-span-${[2,2,2,1,2,2,1][i]} text-gray-400 text-xs font-medium uppercase ${i >= 4 ? 'text-right' : ''}`}>{h}</div>
              ))}
            </div>
            <div>
              {transactions.slice().reverse().map((tx: any) => {
                const typeColors: Record<string, string> = {
                  buy: 'text-blue-400', sell: 'text-purple-400',
                  deposit: 'text-emerald-400',    // green = income/inflow ✅
                  withdrawal: 'text-red-400',       // red = outflow ✅
                  dividend: 'text-emerald-300',    // green-ish = income ✅
                  fee: 'text-gray-400',
                };
                const typeIcons: Record<string, React.ReactNode> = {
                  buy: <ArrowDownLeft className="w-3 h-3" />, sell: <ArrowUpRight className="w-3 h-3" />,
                  deposit: <ArrowDownLeft className="w-3 h-3" />, withdrawal: <ArrowUpRight className="w-3 h-3" />,
                };
                const total = tx.quantity && tx.price ? tx.quantity * tx.price : tx.amount || 0;
                return (
                  <div key={tx.id} className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 hover:bg-white/5 transition-colors items-center">
                    <div className="col-span-2 text-gray-400 text-sm">{dateLabel(tx.date || tx.created_at)}</div>
                    <div className={`col-span-2 flex items-center gap-1.5 text-sm font-semibold capitalize ${typeColors[tx.type] || 'text-gray-400'}`}>
                      {typeIcons[tx.type]}
                      {tx.type}
                    </div>
                    <div className="col-span-2 text-white font-medium">{tx.symbol || '—'}</div>
                    <div className="col-span-1 text-gray-400 text-sm">{tx.quantity || '—'}</div>
                    <div className="col-span-2 text-right text-gray-400 text-sm">
                      {tx.price ? `$${tx.price.toFixed(2)}` : tx.amount ? fmt(tx.amount) : '—'}
                    </div>
                    <div className="col-span-2 text-right font-bold text-white">{total > 0 ? fmt(total) : '—'}</div>
                    <div className="col-span-1 text-right">
                      <button onClick={() => setShowDelete(tx.id)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add Transaction Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Transaction" size="md">
        <div className="space-y-4">
          <FormSelect label="Type" value={txType} onChange={e => setTxType(e.target.value)} options={TX_TYPES} />
          {['buy', 'sell'].includes(txType) && (
            <>
              <FormInput label="Symbol" value={txSymbol} onChange={e => setTxSymbol(e.target.value)} placeholder="AAPL" />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Quantity" type="number" value={txQty} onChange={e => setTxQty(e.target.value)} placeholder="10" />
                <FormInput label="Price per share" type="number" value={txPrice} onChange={e => setTxPrice(e.target.value)} placeholder="150.00" />
              </div>
            </>
          )}
          {!['buy', 'sell'].includes(txType) && (
            <FormInput label="Amount ($)" type="number" value={txPrice} onChange={e => setTxPrice(e.target.value)} placeholder="1000.00" />
          )}
          <FormInput label="Date" type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
          <FormInput label="Notes (optional)" value={txNotes} onChange={e => setTxNotes(e.target.value)} placeholder="..." />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowAdd(false)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doAdd} disabled={saving} className="flex-1">Add Transaction</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Edit Cash */}
      <Modal open={showEditCash} onClose={() => setShowEditCash(false)} title="Edit Cash Balance" size="sm">
        <div className="space-y-4">
          <FormInput label="Cash balance" type="number" value={cashValue} onChange={e => setCashValue(e.target.value)} placeholder="15000" />
          <FormSelect
            label="Currency"
            value={cashCurrency}
            onChange={e => setCashCurrency(e.target.value)}
            options={[
              { value: 'USD', label: 'USD' },
              { value: 'EUR', label: 'EUR' },
              { value: 'CHF', label: 'CHF' },
              { value: 'GBP', label: 'GBP' },
            ]}
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowEditCash(false)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doUpdateCash} disabled={saving} className="flex-1">Save</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={showDelete !== null} onClose={() => setShowDelete(null)} title="Delete Transaction" size="sm">
        <div className="space-y-4">
          <p className="text-gray-400">Are you sure you want to delete this transaction?</p>
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowDelete(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={() => doDelete(showDelete!)} variant="danger" className="flex-1">Delete</ActionBtn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
