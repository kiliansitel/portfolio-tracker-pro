import { Link2, Plus, Trash2, RefreshCw, Wifi, ChevronDown, ChevronUp, ExternalLink, Coins } from 'lucide-react';
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
  { value: 'dot', label: 'Polkadot (DOT)' },
  { value: 'ksm', label: 'Kusama (KSM)' },
];

const CHAIN_COLORS: Record<string, string> = {
  btc: '#F7931A', eth: '#627EEA', sol: '#9945FF', bnb: '#F3BA2F',
  avax: '#E84142', matic: '#8247E5', arb: '#28A0F0', op: '#FF0420',
  ltc: '#345D9D', doge: '#C2A633', xrp: '#23292F', ada: '#0033AD', dot: '#E6007A', ksm: '#000000',
};
const CHAIN_ICONS: Record<string, string> = {
  btc: '₿', eth: '⟠', sol: '◎', bnb: '⬡', avax: '▲', matic: '⬡',
  arb: '◆', op: '●', ltc: 'Ł', doge: 'Ð', xrp: '✕', ada: '₳', dot: '●', ksm: '◉',
};

function validateAddress(addr: string, chain: string): string | null {
  if (!addr) return 'Address is required';
  const a = addr.trim();
  if (['eth','bnb','matic','arb','op'].includes(chain)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return 'Invalid EVM address (must start with 0x, 42 chars)';
  } else if (chain === 'btc') {
    if (!/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(a)) return 'Invalid Bitcoin address';
  } else if (chain === 'sol') {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return 'Invalid Solana address';
  } else if (chain === 'xrp') {
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a)) return 'Invalid XRP address';
  } else if (chain === 'ada') {
    if (!/^addr1[0-9a-z]+$/.test(a) && !/^[0-9a-zA-Z]{58,}$/.test(a)) return 'Invalid Cardano address';
  }
  return null;
}

function getExplorerUrl(chain: string, txHash: string): string {
  const map: Record<string, string> = {
    eth: `https://etherscan.io/tx/${txHash}`,
    btc: `https://blockchain.com/btc/tx/${txHash}`,
    sol: `https://solscan.io/tx/${txHash}`,
    bnb: `https://bscscan.com/tx/${txHash}`,
    matic: `https://polygonscan.com/tx/${txHash}`,
    arb: `https://arbiscan.io/tx/${txHash}`,
    op: `https://optimistic.etherscan.io/tx/${txHash}`,
  };
  return map[chain] || '#';
}

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

function TxTypeChip({ type }: { type: string }) {
  const styles: Record<string, string> = {
    send: 'bg-red-500/10 text-red-400', receive: 'bg-emerald-500/10 text-emerald-400',
    swap: 'bg-blue-500/10 text-blue-400', contract: 'bg-purple-500/10 text-purple-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[type] || 'bg-white/10 text-gray-400'}`}>
      {type}
    </span>
  );
}

function WalletCard({ w, onDelete, onSync, syncing }: { w: any; onDelete: () => void; onSync: () => void; syncing: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [tokens, setTokens] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(0);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);
  const [tokensLoaded, setTokensLoaded] = useState(false);

  const color = CHAIN_COLORS[w.chain] || '#6b7280';
  const icon = CHAIN_ICONS[w.chain] || '?';
  const balance = w.balance !== null ? Number(w.balance).toFixed(w.chain === 'btc' ? 8 : 4) : '0';
  const TX_PAGE = 25;

  const loadTokens = async () => {
    if (tokensLoaded) { setExpanded(true); return; }
    setLoadingTokens(true);
    try {
      const res = await fetch(`/api/wallets/${w.id}/tokens`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pt_gui_token')}` }
      });
      const data = await res.json();
      setTokens(data.tokens || []);
      setTokensLoaded(true);
      setExpanded(true);
    } catch { toast.error('Failed to load tokens'); }
    finally { setLoadingTokens(false); }
  };

  const toggleTokens = () => {
    if (!expanded) loadTokens();
    else setExpanded(false);
  };

  const loadTxs = async (page = 0) => {
    setLoadingTx(true);
    try {
      const res = await fetch(`/api/wallets/${w.id}/transactions?limit=${TX_PAGE}&offset=${page * TX_PAGE}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pt_gui_token')}` }
      });
      const data = await res.json();
      setTxs(data.transactions || []);
      setTxTotal(data.total || 0);
      setTxPage(page);
      setShowTx(true);
    } catch { toast.error('Failed to load transactions'); }
    finally { setLoadingTx(false); }
  };

  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 hover:border-blue-500/20 transition-all">
      {/* Main row */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xl sm:text-2xl flex-shrink-0"
            style={{ background: `${color}20`, color }}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-white font-bold text-sm sm:text-base">{w.label || w.chain?.toUpperCase()}</span>
              <span className="px-1.5 py-0.5 bg-white/5 rounded-full text-gray-400 text-xs">{w.chain?.toUpperCase()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="text-gray-500 font-mono">{trunc(w.address)}</span>
              <span className="text-gray-600 hidden sm:inline">•</span>
              <span className="text-gray-400">{balance} {w.chain?.toUpperCase()}</span>
            </div>
            <div className="text-gray-600 text-xs mt-0.5 flex items-center gap-1">
              <Wifi className="w-3 h-3" /> {timeSince(w.last_synced)}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <div className="text-white font-bold text-base sm:text-lg">{fmt(w.usd_value || 0)}</div>
            </div>
            <button onClick={onSync} disabled={syncing}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onDelete}
              className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Mobile value row */}
        <div className="sm:hidden mt-2 flex items-center justify-between">
          <span className="text-white font-bold text-base">{fmt(w.usd_value || 0)}</span>
          <div className="flex gap-2">
            {w.token_count > 0 && (
              <button onClick={toggleTokens} disabled={loadingTokens}
                className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white text-xs transition-colors min-h-[44px]">
                <Coins className="w-3 h-3" />
                {loadingTokens ? '…' : `${w.token_count} tokens`}
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
            <button onClick={() => loadTxs(0)} disabled={loadingTx}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white text-xs transition-colors min-h-[44px]">
              {loadingTx ? 'Loading…' : 'Txns'}
            </button>
          </div>
        </div>
        {/* Desktop action buttons */}
        <div className="hidden sm:flex items-center gap-2 mt-3">
          {w.token_count > 0 && (
            <button onClick={toggleTokens} disabled={loadingTokens}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white text-xs transition-colors">
              <Coins className="w-3 h-3" />
              {loadingTokens ? 'Loading…' : `${w.token_count} Token${w.token_count !== 1 ? 's' : ''}`}
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          <button onClick={() => loadTxs(0)} disabled={loadingTx}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white text-xs transition-colors">
            {loadingTx ? 'Loading…' : 'Transactions'}
          </button>
          <button onClick={() => { navigator.clipboard.writeText(w.address); toast.success('Address copied'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white text-xs transition-colors">
            Copy Address
          </button>
        </div>
      </div>

      {/* Token list (expandable) */}
      {expanded && tokens.length > 0 && (
        <div className="border-t border-white/5 px-4 sm:px-5 py-3">
          <div className="text-gray-500 text-xs font-medium mb-2">Tokens</div>
          <div className="space-y-2">
            {tokens.map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">
                    {t.symbol?.slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-white text-xs font-medium">{t.symbol}</div>
                    <div className="text-gray-500 text-xs">{Number(t.balance || 0).toFixed(4)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white text-xs font-medium">{fmt(t.usd_value || 0)}</div>
                  {t.price_usd && <div className="text-gray-500 text-xs">${Number(t.price_usd).toFixed(4)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {expanded && tokens.length === 0 && tokensLoaded && (
        <div className="border-t border-white/5 px-5 py-3 text-gray-600 text-xs">No tokens found for this wallet.</div>
      )}

      {/* Transactions modal */}
      <Modal open={showTx} onClose={() => setShowTx(false)} title={`Transactions — ${w.label || w.chain?.toUpperCase()}`} size="lg">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {txs.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No transactions found</div>
          ) : txs.map((tx: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <TxTypeChip type={tx.tx_type || 'transfer'} />
                <div className="min-w-0">
                  <div className="text-white text-sm font-mono truncate">{trunc(tx.tx_hash)}</div>
                  <div className="text-gray-500 text-xs">{tx.block_time ? new Date(tx.block_time * 1000).toLocaleDateString() : '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <div className="text-white text-sm font-medium">
                    {tx.value ? `${Number(tx.value).toFixed(4)} ${w.chain?.toUpperCase()}` : '—'}
                  </div>
                  {tx.usd_value > 0 && <div className="text-gray-400 text-xs">{fmt(tx.usd_value)}</div>}
                </div>
                {tx.tx_hash && (
                  <a href={getExplorerUrl(w.chain, tx.tx_hash)} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Pagination */}
        {txTotal > TX_PAGE && (
          <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-3">
            <span className="text-gray-500 text-sm">{txTotal} total</span>
            <div className="flex gap-2">
              <ActionBtn onClick={() => loadTxs(txPage - 1)} disabled={txPage === 0 || loadingTx} variant="ghost" className="px-3 py-1.5 text-sm">Prev</ActionBtn>
              <span className="text-gray-400 text-sm self-center">Page {txPage + 1} / {Math.ceil(txTotal / TX_PAGE)}</span>
              <ActionBtn onClick={() => loadTxs(txPage + 1)} disabled={(txPage + 1) * TX_PAGE >= txTotal || loadingTx} variant="ghost" className="px-3 py-1.5 text-sm">Next</ActionBtn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
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
  const TX_PAGE = 25;

  const load = async () => {
    setLoading(true);
    try { setWallets(await api.wallets.list() || []); }
    catch { setWallets([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const doAdd = async () => {
    setErr(''); setSaving(true);
    const addrErr = validateAddress(address, chain);
    if (addrErr) { setErr(addrErr); setSaving(false); return; }
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
    try { await api.wallets.sync(id); await load(); toast.success('Synced'); }
    catch (e: any) { toast.error(e.message); }
    finally { setSyncing(p => ({ ...p, [id]: false })); }
  };

  const doSyncAll = async () => {
    setSaving(true);
    try { await api.wallets.syncAll(); await load(); toast.success('All wallets synced'); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const totalUsd = wallets.reduce((s, w) => s + (w.usd_value || 0), 0);

  return (
    <div className="p-4 sm:p-8 pb-40 md:pb-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <Link2 className="w-6 h-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-white">Connections</h2>
          <span className="text-gray-500 text-sm">On-chain wallets</span>
        </div>
        <div className="flex items-center gap-3">
          {wallets.length > 0 && (
            <button onClick={doSyncAll} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50 min-h-[40px]">
              <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} /> Sync All
            </button>
          )}
          <button onClick={() => { setErr(''); setShowAdd(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 text-sm min-h-[40px]">
            <Plus className="w-4 h-4" /> Add Wallet
          </button>
        </div>
      </div>

      {/* Summary */}
      {wallets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5">
            <div className="text-gray-400 text-sm mb-1">Total On-Chain Value</div>
            <div className="text-2xl sm:text-3xl font-bold text-white">{fmt(totalUsd)}</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5">
            <div className="text-gray-400 text-sm mb-1">Wallets</div>
            <div className="text-2xl sm:text-3xl font-bold text-white">{wallets.length}</div>
          </div>
          <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5">
            <div className="text-gray-400 text-sm mb-1">Networks</div>
            <div className="text-2xl sm:text-3xl font-bold text-white">{new Set(wallets.map(w => w.chain)).size}</div>
          </div>
        </div>
      )}

      {/* Wallets List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading wallets…</div>
      ) : wallets.length === 0 ? (
        <div className="text-center py-20 bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Link2 className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No wallets connected</h3>
          <p className="text-gray-500 mb-6">Add a blockchain wallet to track on-chain balances</p>
          <button onClick={() => setShowAdd(true)}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white font-medium shadow-lg shadow-blue-500/30">
            Add Your First Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {wallets.map(w => (
            <WalletCard key={w.id} w={w}
              onDelete={() => setDeleteTarget({ id: w.id, name: w.label || w.chain })}
              onSync={() => doSync(w.id)}
              syncing={!!syncing[w.id]}
            />
          ))}
        </div>
      )}

      {/* Add Wallet Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Wallet" size="md">
        <div className="space-y-4">
          <FormSelect label="Blockchain Network" value={chain} onChange={e => setChain(e.target.value)} options={CHAINS} />
          <FormInput
            label="Wallet Address"
            value={address}
            onChange={e => { setAddress(e.target.value); if (err) setErr(''); }}
            onBlur={() => { const e = validateAddress(address, chain); if (e) setErr(e); }}
            placeholder="0x… or bc1…"
            error={address.length > 8 ? (validateAddress(address, chain) || undefined) : undefined}
          />
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
