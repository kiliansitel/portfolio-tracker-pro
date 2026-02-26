import { Link2, Plus, Trash2, RefreshCw, Wifi } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { fmt } from '../lib/format';
import { Modal, FormInput, FormSelect, ActionBtn } from '../components/Modal';

const CHAINS = [
  { value: 'eth', label: 'Ethereum (ETH)' },
  { value: 'btc', label: 'Bitcoin (BTC)' },
  { value: 'sol', label: 'Solana (SOL)' },
  { value: 'bnb', label: 'BNB Smart Chain' },
  { value: 'avax', label: 'Avalanche (AVAX)' },
  { value: 'matic', label: 'Polygon (MATIC)' },
  { value: 'arb', label: 'Arbitrum (ARB)' },
  { value: 'op', label: 'Optimism (OP)' },
  { value: 'ltc', label: 'Litecoin (LTC)' },
  { value: 'doge', label: 'Dogecoin (DOGE)' },
  { value: 'xrp', label: 'XRP' },
  { value: 'ada', label: 'Cardano (ADA)' },
];

const CHAIN_COLORS: Record<string, string> = {
  btc: '#F7931A', eth: '#627EEA', sol: '#9945FF', bnb: '#F3BA2F',
  avax: '#E84142', matic: '#8247E5', arb: '#28A0F0', op: '#FF0420',
  ltc: '#345D9D', doge: '#C2A633', xrp: '#23292F', ada: '#0033AD',
};
const CHAIN_ICONS: Record<string, string> = {
  btc: '₿', eth: '⟠', sol: '◎', bnb: '⬡', avax: '▲', matic: '⬡',
  arb: '◆', op: '●', ltc: 'Ł', doge: 'Ð', xrp: '✕', ada: '₳',
};

function timeSince(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function trunc(addr: string) {
  if (!addr || addr.length <= 16) return addr;
  return addr.slice(0, 8) + '...' + addr.slice(-6);
}


export function Connections() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<number, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [chain, setChain] = useState('eth');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try { setWallets(await api.wallets.list() || []); }
    catch { setWallets([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const doAdd = async () => {
    setErr(''); setSaving(true);
    try {
      await api.wallets.add({ address: address.trim(), chain, label: label.trim() || undefined });
      setShowAdd(false); setAddress(''); setLabel(''); setChain('eth');
      await load();
      toast.success('Wallet added');
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    await api.wallets.delete(deleteTarget.id).catch((e: any) => toast.error(e.message));
    setDeleteTarget(null);
    await load();
    toast.success('Wallet removed');
  };

  const doSync = async (id: number) => {
    setSyncing(p => ({ ...p, [id]: true }));
    try {
      await api.wallets.sync(id);
      await load();
      toast.success('Synced');
    } catch (e: any) { toast.error(e.message); }
    finally { setSyncing(p => ({ ...p, [id]: false })); }
  };

  const doSyncAll = async () => {
    setSaving(true);
    try { await api.wallets.syncAll(); await load(); toast.success('All wallets synced'); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const totalUsd = wallets.reduce((s, w) => s + (w.usd_value || 0), 0);

  return (
    <div className="p-8 max-w-[1440px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link2 className="w-6 h-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-white">Connections</h2>
          <span className="text-gray-500 text-sm">On-chain wallets</span>
        </div>
        <div className="flex items-center gap-3">
          {wallets.length > 0 && (
            <button onClick={doSyncAll} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} /> Sync All
            </button>
          )}
          <button onClick={() => { setErr(''); setShowAdd(true); }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm">
            <Plus className="w-4 h-4" /> Add Wallet
          </button>
        </div>
      </div>

      {/* Summary */}
      {wallets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
            <div className="text-gray-400 text-sm mb-2">Total On-Chain Value</div>
            <div className="text-3xl font-bold text-white">{fmt(totalUsd)}</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
            <div className="text-gray-400 text-sm mb-2">Connected Wallets</div>
            <div className="text-3xl font-bold text-white">{wallets.length}</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5">
            <div className="text-gray-400 text-sm mb-2">Networks</div>
            <div className="text-3xl font-bold text-white">{new Set(wallets.map(w => w.chain)).size}</div>
          </div>
        </div>
      )}

      {/* Wallets List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading wallets...</div>
      ) : wallets.length === 0 ? (
        <div className="text-center py-24 bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Link2 className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No wallets connected</h3>
          <p className="text-gray-500 mb-6">Add a blockchain wallet to track on-chain balances</p>
          <button onClick={() => setShowAdd(true)} className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white font-medium shadow-lg shadow-blue-500/30">
            Add Your First Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {wallets.map(w => {
            const color = CHAIN_COLORS[w.chain] || '#6b7280';
            const icon = CHAIN_ICONS[w.chain] || '?';
            const balance = w.balance !== null ? Number(w.balance).toFixed(w.chain === 'btc' ? 8 : 4) : '0';
            return (
              <div key={w.id} className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-5 hover:border-blue-500/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0" style={{ background: `${color}20`, color }}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-bold">{w.label || w.chain?.toUpperCase()}</span>
                      <span className="px-2 py-0.5 bg-white/5 rounded-full text-gray-400 text-xs">{w.chain?.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500 font-mono">{trunc(w.address)}</span>
                      <span className="text-gray-600">•</span>
                      <span className="text-gray-400">{balance} {w.chain?.toUpperCase()}</span>
                      {w.token_count > 0 && <span className="text-gray-600">+ {w.token_count} {w.token_count === 1 ? 'token' : 'tokens'}</span>}
                    </div>
                    <div className="text-gray-600 text-xs mt-1 flex items-center gap-1">
                      <Wifi className="w-3 h-3" /> Synced {timeSince(w.last_synced)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-white font-bold text-lg">{fmt(w.usd_value || 0)}</div>
                    </div>
                    <button onClick={() => doSync(w.id)} disabled={syncing[w.id]}
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50">
                      <RefreshCw className={`w-4 h-4 ${syncing[w.id] ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setDeleteTarget({ id: w.id, name: w.label || w.chain })}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Wallet Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Wallet" size="md">
        <div className="space-y-4">
          <FormSelect label="Blockchain Network" value={chain} onChange={e => setChain(e.target.value)} options={CHAINS} />
          <FormInput label="Wallet Address" value={address} onChange={e => setAddress(e.target.value)} placeholder="0x... or bc1..." />
          <FormInput label="Label (optional)" value={label} onChange={e => setLabel(e.target.value)} placeholder="My cold wallet" />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <p className="text-gray-600 text-xs">Read-only tracking — no private keys required.</p>
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setShowAdd(false)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doAdd} disabled={saving || !address.trim()} className="flex-1">Add Wallet</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove Wallet" size="sm">
        <div className="space-y-4">
          <p className="text-gray-400">Remove wallet <span className="text-white font-bold">"{deleteTarget?.name}"</span>? This cannot be undone.</p>
          <div className="flex gap-3 pt-2">
            <ActionBtn onClick={() => setDeleteTarget(null)} variant="ghost" className="flex-1">Cancel</ActionBtn>
            <ActionBtn onClick={doDelete} variant="danger" className="flex-1">Remove</ActionBtn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
