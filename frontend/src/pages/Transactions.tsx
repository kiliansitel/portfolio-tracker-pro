import { ClipboardList, Trash2, Plus, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { fmt, dateLabel } from '../lib/format';
import { Modal, ActionBtn } from '../components/Modal';

const TYPE_COLORS: Record<string, string> = {
  buy: 'text-emerald-400 bg-emerald-400/10',
  sell: 'text-red-400 bg-red-400/10',
  deposit: 'text-blue-400 bg-blue-400/10',
  withdrawal: 'text-orange-400 bg-orange-400/10',
  dividend: 'text-emerald-300 bg-emerald-300/10',
  fee: 'text-gray-400 bg-gray-400/10',
};

export function Transactions() {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showDelete, setShowDelete] = useState<number | null>(null);


  const load = async () => {
    const list = await api.portfolio.all().catch(() => []);
    setPortfolios(list || []);
    if (!selectedId && list?.length) setSelectedId(list[0].id);
    setLoading(false);
  };

  const loadTx = async (pid: number) => {
    setLoading(true);
    try {
      const data = await api.portfolio.transactions(pid);
      setTransactions(Array.isArray(data) ? data : []);
    } catch { setTransactions([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedId) loadTx(selectedId); }, [selectedId]);

  const doDelete = async () => {
    await api.portfolio.deleteTransaction(showDelete!).catch(console.error);
    setShowDelete(null);
    if (selectedId) loadTx(selectedId);
    toast.success('Transaction deleted');
  };

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.type === filter);
  const TABS = ['all', 'buy', 'sell', 'dividend', 'deposit', 'withdrawal'];
  const types = ['all', ...Array.from(new Set(transactions.map((t: any) => String(t.type))))];
  const tabsToShow = [...new Set([...TABS, ...types])];
  const countFor = (t: string) => t === 'all' ? transactions.length : transactions.filter((tx: any) => tx.type === t).length;

  // Dividend calendar: group dividends by month
  const dividends = transactions.filter((t: any) => t.type === 'dividend');
  const dividendsByMonth = dividends.reduce((acc: Record<string, any[]>, tx: any) => {
    const date = tx.date || tx.created_at;
    const month = date ? date.slice(0, 7) : 'Unknown';
    if (!acc[month]) acc[month] = [];
    acc[month].push(tx);
    return acc;
  }, {});
  const dividendMonths = Object.keys(dividendsByMonth).sort().reverse();
  const totalDividends = dividends.reduce((s: number, tx: any) => {
    const val = tx.quantity && tx.price ? tx.quantity * tx.price : (tx.amount || 0);
    return s + val;
  }, 0);

  return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-white">Transaction History</h2>
          <span className="text-gray-500 text-sm">({filtered.length} transactions)</span>
        </div>
        <button
          onClick={() => navigate('/wallet')}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>

      {/* Portfolio Tabs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {portfolios.map(p => (
          <button key={p.id} onClick={() => setSelectedId(p.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedId === p.id ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}>
            {p.name}
          </button>
        ))}
      </div>

      {/* Type Filters */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto no-scrollbar">
        {tabsToShow.filter(t => countFor(t) > 0 || TABS.includes(t)).map(t => {
          const count = countFor(t);
          const active = filter === t;
          return (
            <button key={t} onClick={() => setFilter(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all whitespace-nowrap flex-shrink-0 ${
                active ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}>
              {t}
              {count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-blue-500/30 text-blue-300' : 'bg-white/5 text-gray-600'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Dividend Calendar */}
      {dividends.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-semibold">Dividend Calendar</h3>
            <span className="ml-auto text-emerald-400 font-bold">{fmt(totalDividends)} total</span>
          </div>
          <div className="space-y-3">
            {dividendMonths.slice(0, 12).map(month => {
              const txs = dividendsByMonth[month];
              const monthTotal = txs.reduce((s: number, tx: any) => {
                return s + (tx.quantity && tx.price ? tx.quantity * tx.price : (tx.amount || 0));
              }, 0);
              const label = new Date(month + '-01').toLocaleDateString('default', { month: 'short', year: 'numeric' });
              return (
                <div key={month} className="flex items-center gap-3">
                  <div className="w-20 text-gray-400 text-xs font-medium">{label}</div>
                  <div className="flex-1 flex flex-wrap gap-2">
                    {txs.map((tx: any, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-emerald-400/10 text-emerald-300 text-xs rounded-full">
                        {tx.symbol || '—'} {tx.amount ? fmt(tx.amount) : tx.quantity && tx.price ? fmt(tx.quantity * tx.price) : ''}
                      </span>
                    ))}
                  </div>
                  <div className="text-emerald-400 text-sm font-bold shrink-0">{fmt(monthTotal)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-white/5 border-b border-white/5">
          <div className="col-span-2 text-gray-400 text-xs font-medium uppercase">Date</div>
          <div className="col-span-2 text-gray-400 text-xs font-medium uppercase">Type</div>
          <div className="col-span-2 text-gray-400 text-xs font-medium uppercase">Symbol</div>
          <div className="col-span-1 text-gray-400 text-xs font-medium uppercase">Qty</div>
          <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Price</div>
          <div className="col-span-2 text-gray-400 text-xs font-medium uppercase text-right">Total</div>
          <div className="col-span-1" />
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardList className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No transactions found</p>
          </div>
        ) : (
          filtered.slice().reverse().map((tx: any) => {
            const color = TYPE_COLORS[tx.type] || 'text-gray-400 bg-gray-400/10';
            const total = tx.quantity && tx.price ? tx.quantity * tx.price : tx.amount || 0;
            return (
              <div key={tx.id} className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 hover:bg-white/5 transition-colors items-center">
                <div className="col-span-2 text-gray-400 text-sm">{dateLabel(tx.date || tx.created_at)}</div>
                <div className="col-span-2">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${color}`}>{tx.type}</span>
                </div>
                <div className="col-span-2 text-white font-medium">{tx.symbol || '—'}</div>
                <div className="col-span-1 text-gray-400 text-sm">{tx.quantity || '—'}</div>
                <div className="col-span-2 text-right text-gray-400 text-sm">
                  {tx.price ? `$${Number(tx.price).toFixed(2)}` : tx.amount ? fmt(tx.amount) : '—'}
                </div>
                <div className="col-span-2 text-right font-bold text-white">{total > 0 ? fmt(total) : '—'}</div>
                <div className="col-span-1 text-right">
                  <button onClick={() => setShowDelete(tx.id)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal open={showDelete !== null} onClose={() => setShowDelete(null)} title="Delete Transaction" size="sm">
        <div className="space-y-4">
          <p className="text-gray-400">Delete this transaction? This cannot be undone.</p>
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowDelete(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doDelete} variant="danger" className="flex-1">Delete</ActionBtn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
