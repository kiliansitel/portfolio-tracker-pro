import {
  Settings as SettingsIcon, User, Lock, Globe, Bell, Download, Trash2, Eye, EyeOff, Check,
  Upload, Sparkles, SunMoon, MessageCircle, Info, RefreshCw
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import { setUserCurrency, setExchangeRates } from '../lib/currency';
import { FormInput, FormSelect, ActionBtn } from '../components/Modal';

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'EUR', label: 'EUR — Euro (€)' },
  { value: 'GBP', label: 'GBP — British Pound (£)' },
  { value: 'CHF', label: 'CHF — Swiss Franc (CHF)' },
  { value: 'JPY', label: 'JPY — Japanese Yen (¥)' },
  { value: 'CAD', label: 'CAD — Canadian Dollar (C$)' },
  { value: 'AUD', label: 'AUD — Australian Dollar (A$)' },
];

const WEEK_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function Section({ title, icon: Icon, children, id }: { title: string; icon: any; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div>
        <div className="text-white text-sm font-medium">{label}</div>
        {sub && <div className="text-gray-500 text-xs mt-0.5">{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${checked ? 'bg-gradient-to-r from-blue-500 to-purple-600' : 'bg-gray-700'}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [saving, setSaving] = useState(false);

  // Basic prefs
  const [currency, setCurrency] = useState('USD');
  const [theme, setTheme] = useState<'dark'|'light'|'auto'>('dark');

  // Scheduled reports
  const [autoReports, setAutoReports] = useState<any>({});

  // Telegram
  const [telegramChatId, setTelegramChatId] = useState('');

  // Updates
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateChannel, setUpdateChannel] = useState('beta');
  const [autoUpdate, setAutoUpdate] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Email form
  const [newEmail, setNewEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');

  // Import / restore
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ok = true) => {
    ok ? toast.success(msg) : toast.error(msg);
  };

  useEffect(() => {
    if (!user) return;
    setCurrency(user.currency || user.settings?.currency || 'USD');
    setAutoReports(user.settings?.autoReports || {});
    setNewEmail(user.email || '');
    setTelegramChatId(user.settings?.telegramChatId || user.settings?.telegram_chat_id || '');

    // Load update info
    api.updates.status().then((d: any) => {
      setUpdateInfo(d);
      setUpdateChannel(d?.settings?.channel || d?.channel || 'beta');
      setAutoUpdate(d?.settings?.autoUpdate ?? false);
    }).catch(() => {});

    const storedTheme = localStorage.getItem('theme') || user.settings?.theme || 'dark';
    setTheme((['dark','light','auto'].includes(storedTheme) ? storedTheme : 'dark') as any);
  }, [user]);

  // Apply theme immediately
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveLight = theme === 'light' || (theme === 'auto' && !prefersDark);
    if (effectiveLight) root.classList.add('light-theme');
    else root.classList.remove('light-theme');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const saveSettingsPatch = async (patch: any) => {
    try {
      await api.updateSettings({ settings: { ...user?.settings, ...patch } });
      showToast('Settings saved');
    } catch (e: any) {
      showToast(e.message, false);
    }
  };

  const saveCurrency = async () => {
    setSaving(true);
    try {
      await api.updateSettings({ currency });
      setUserCurrency(currency);
      // Refresh exchange rates
      const rates = await api.exchangeRates().catch(() => null);
      if (rates) setExchangeRates(typeof rates === 'object' ? rates : {});
      showToast(`Currency set to ${currency}`);
    } catch (e: any) { showToast(e.message, false); } finally { setSaving(false); }
  };

  const saveAutoReports = async (next: any) => {
    setAutoReports(next);
    await saveSettingsPatch({ autoReports: next });
  };

  const changePassword = async () => {
    setPwErr('');
    if (!currentPw || !newPw || !confirmPw) { setPwErr('All fields required'); return; }
    if (newPw !== confirmPw) { setPwErr('Passwords do not match'); return; }
    if (newPw.length < 8) { setPwErr('Minimum 8 characters'); return; }
    if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setPwErr('Needs uppercase, lowercase, and number'); return;
    }
    setSaving(true);
    try {
      await api.changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      showToast('Password changed successfully');
    } catch (e: any) { setPwErr(e.message); } finally { setSaving(false); }
  };

  const changeEmail = async () => {
    setEmailErr('');
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setEmailErr('Valid email required'); return; }
    setSaving(true);
    try {
      await api.changeEmail(newEmail);
      showToast('Email updated');
    } catch (e: any) { setEmailErr(e.message); } finally { setSaving(false); }
  };

  const downloadBackup = async () => {
    try {
      const res = await api.backup.download();
      if (!res.ok) throw new Error('Backup failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup downloaded');
    } catch (e: any) { showToast(e.message, false); }
  };

  const restoreBackup = async (file: File) => {
    if (!confirm('This will replace ALL your data. Continue?')) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = auth.getToken();
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Backup restored');
      window.location.reload();
    } catch (e: any) {
      showToast(e.message || 'Restore failed', false);
    } finally {
      setSaving(false);
    }
  };

  const exportPositionsCsv = async () => {
    try {
      const ps = await api.portfolio.all();
      if (!ps?.length) return toast.info('No portfolio');
      const p0 = ps[0];
      const positions = await api.portfolio.positions(p0.id);
      const rows = (positions || []).map((p: any) => ({
        symbol: p.symbol, quantity: p.quantity, entryPrice: p.entryPrice, type: p.type, currency: p.currency || 'USD'
      }));
      const header = Object.keys(rows[0] || { symbol: '', quantity: '', entryPrice: '' }).join(',');
      const csv = [header, ...rows.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'positions.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Exported positions CSV');
    } catch (e: any) { toast.error(e.message); }
  };

  const exportWatchlistCsv = async () => {
    try {
      const wls = await api.watchlists();
      const items = (wls || []).flatMap((wl: any) => (wl.items || []).map((it: any) => ({ watchlist: wl.name, symbol: it.symbol, notes: it.notes || '' })));
      if (!items.length) return toast.info('No watchlist items');
      const header = Object.keys(items[0]).join(',');
      const csv = [header, ...items.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'watchlist.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Exported watchlist CSV');
    } catch (e: any) { toast.error(e.message); }
  };

  const [importMode, setImportMode] = useState<'positions' | 'watchlist'>('positions');
  const [importFormat, setImportFormat] = useState<'auto' | 'degiro' | 'trading212' | 'ibkr' | 'keytrade' | 'coinmarketcap' | 'generic'>('auto');

  function parseCsvRow(row: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(current.trim()); current = '';
      } else { current += c; }
    }
    result.push(current.trim());
    return result;
  }

  type ImportFormat = 'degiro' | 'trading212' | 'ibkr' | 'keytrade' | 'coinmarketcap' | 'generic';

  function detectFormat(cols: string[]): ImportFormat {
    const s = cols.join(',').toLowerCase();
    if (s.includes('isin') && s.includes('aantal')) return 'degiro';
    if (s.includes('ticker') && s.includes('no. of shares')) return 'trading212';
    if (s.includes('financialinstrument') || (s.includes('symbol') && s.includes('quantity') && s.includes('tradedate'))) return 'ibkr';
    if (s.includes('mnemo') || s.includes('keytrade')) return 'keytrade';
    if (s.includes('coinmarketcap') || (s.includes('coin') && s.includes('holdings'))) return 'coinmarketcap';
    return 'generic';
  }

  const onImportCsv = async (file: File) => {
    try {
      const text = await file.text();
      const allLines = text.split(/\r?\n/).filter(Boolean);
      if (allLines.length < 2) throw new Error('CSV appears to be empty or has only headers');

      const cols = parseCsvRow(allLines[0]).map(c => c.toLowerCase());
      const fmt = importFormat === 'auto' ? detectFormat(cols) : importFormat;

      const getIdx = (...keys: string[]) => cols.findIndex(c => keys.some(k => c.includes(k)));

      let symIdx: number, qtyIdx: number, priceIdx: number, nameIdx: number, dateIdx: number;

      if (fmt === 'degiro') {
        // DeGiro export: Product, Symbol/ISIN, Aantal, Koers
        symIdx = getIdx('symbol', 'isin', 'product');
        qtyIdx = getIdx('aantal', 'quantity', 'shares');
        priceIdx = getIdx('slotkoers', 'koers', 'price');
        nameIdx = getIdx('product', 'name');
        dateIdx = getIdx('datum', 'date');
      } else if (fmt === 'trading212') {
        // Trading 212: Ticker, No. of shares, Average price
        symIdx = getIdx('ticker', 'symbol');
        qtyIdx = getIdx('no. of shares', 'quantity', 'shares');
        priceIdx = getIdx('average price', 'price', 'avg');
        nameIdx = getIdx('name', 'instrument');
        dateIdx = getIdx('date', 'time');
      } else if (fmt === 'ibkr') {
        // Interactive Brokers Activity Statement
        // IBKR CSV has: "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,..."
        symIdx = getIdx('symbol', 'financialinstrument');
        qtyIdx = getIdx('quantity', 'qty', 'shares');
        priceIdx = getIdx('t. price', 'price', 'tradeprice', 'cost');
        nameIdx = getIdx('description', 'name', 'company');
        dateIdx = getIdx('date/time', 'tradedate', 'date');
      } else if (fmt === 'keytrade') {
        // Keytrade Bank: Mnemo, Quantité/Hoeveelheid, Cours/Koers
        symIdx = getIdx('mnemo', 'ticker', 'symbol', 'isin');
        qtyIdx = getIdx('quantité', 'hoeveelheid', 'quantity', 'shares');
        priceIdx = getIdx('cours', 'koers', 'price', 'entry');
        nameIdx = getIdx('libellé', 'omschrijving', 'name');
        dateIdx = getIdx('date', 'datum');
      } else if (fmt === 'coinmarketcap') {
        // CoinMarketCap portfolio export: coin, holdings, avg buy price
        symIdx = getIdx('coin', 'symbol', 'ticker');
        qtyIdx = getIdx('holdings', 'quantity', 'amount', 'balance');
        priceIdx = getIdx('avg buy price', 'price', 'avg', 'cost');
        nameIdx = getIdx('name', 'coin');
        dateIdx = getIdx('date', 'time');
      } else {
        // Generic: symbol/ticker, quantity/shares/qty, price/entry/avg
        symIdx = getIdx('symbol', 'ticker', 'asset', 'stock');
        qtyIdx = getIdx('quantity', 'shares', 'qty', 'amount', 'holdings');
        priceIdx = getIdx('entry', 'price', 'avg', 'average', 'cost', 'avg buy');
        nameIdx = getIdx('name', 'description', 'company');
        dateIdx = getIdx('date', 'purchase', 'open', 'time');
      }

      if (symIdx < 0) throw new Error(`CSV format not recognized. Expected columns: symbol, quantity, price.\nDetected format: ${fmt}`);

      if (importMode === 'watchlist') {
        const wls = await api.watchlists();
        const wlId = wls?.[0]?.id;
        if (!wlId) throw new Error('No watchlist found');
        let ok = 0, bad = 0;
        for (const ln of allLines.slice(1)) {
          const parts = parseCsvRow(ln);
          const sym = (parts[symIdx] || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
          if (!sym || sym.length < 1) { bad++; continue; }
          try { await api.addToWatchlist(wlId, sym); ok++; }
          catch { bad++; }
        }
        toast.success(`Watchlist import: ${ok} added, ${bad} skipped`);
        return;
      }

      // Positions import
      const ps = await api.portfolio.all();
      if (!ps?.length) throw new Error('No portfolio found');
      const portfolioId = ps[0].id;
      let ok = 0, bad = 0;
      for (const ln of allLines.slice(1)) {
        const parts = parseCsvRow(ln);
        const sym = (parts[symIdx] || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
        if (!sym || sym.length < 1) { bad++; continue; }
        const quantity = qtyIdx >= 0 ? parseFloat(parts[qtyIdx]?.replace(',', '.') || '0') : 1;
        const entryPrice = priceIdx >= 0 ? parseFloat(parts[priceIdx]?.replace(',', '.') || '0') : 0;
        const name = nameIdx >= 0 ? parts[nameIdx] : undefined;
        const purchaseDate = dateIdx >= 0 ? parts[dateIdx] : undefined;
        if (!quantity || quantity <= 0) { bad++; continue; }
        try {
          await api.portfolio.createPosition(portfolioId, { symbol: sym, quantity, entryPrice, name, purchaseDate });
          ok++;
        } catch { bad++; }
      }
      toast.success(`Positions import: ${ok} imported, ${bad} skipped`);
    } catch (e: any) {
      toast.error(e.message || 'Import failed');
    }
  };

  const pushSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Check if already subscribed on mount
  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => setPushEnabled(!!sub)).catch(() => {});
  }, [pushSupported]);

  const enablePush = async () => {
    if (!pushSupported) { toast.error('Push notifications not supported on this device/browser'); return; }
    setPushLoading(true);
    try {
      const permResult = await Notification.requestPermission();
      if (permResult !== 'granted') { toast.error('Permission denied'); return; }

      // Fetch VAPID public key from backend
      const keyRes = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await keyRes.json();
      if (!publicKey) { toast.error('VAPID key not configured on server'); return; }

      // Convert VAPID key to Uint8Array
      const urlBase64ToUint8Array = (b64: string) => {
        const pad = b64.replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(pad);
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
      };

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await api.push.subscribe(subscription.toJSON());
      setPushEnabled(true);
      toast.success('Push notifications enabled!');
    } catch (e: any) { toast.error(e.message || 'Failed to enable push'); }
    finally { setPushLoading(false); }
  };

  const disablePush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.push.unsubscribe({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      toast.success('Push notifications disabled');
    } catch (e: any) { toast.error(e.message || 'Failed to disable push'); }
    finally { setPushLoading(false); }
  };

  const testPush = async () => {
    try {
      await api.push.test();
      toast.success('Test notification sent');
    } catch (e: any) { toast.error(e.message); }
  };

  const saveTelegram = async () => {
    await saveSettingsPatch({ telegramChatId });
  };

  const checkUpdates = async () => {
    setUpdateChecking(true);
    try {
      const d = await api.updates.status();
      setUpdateInfo(d);
      const avail = d?.lastCheckResult?.updateAvailable;
      toast.success(avail ? `Update available! (${d?.lastCheckResult?.latestBeta || d?.lastCheckResult?.latestMain})` : `Up to date — ${d?.currentVersion}`);
    } catch (e: any) { toast.error(e.message); } finally { setUpdateChecking(false); }
  };

  const testTelegram = async () => {
    try {
      await api.updateSettings({ settings: { ...user?.settings, telegramChatId } });
      // Trigger a test notification via backend (uses the chat ID from settings)
      await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: telegramChatId, message: '✅ Portfolio Tracker Pro — test notification' }),
      });
      toast.success('Test notification sent to Telegram');
    } catch { toast.success('Chat ID saved (test endpoint may not be available)'); }
  };

  return (
    <div className="p-4 sm:p-8 pb-48 md:pb-12 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <SettingsIcon className="w-6 h-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-white">Settings</h2>
      </div>

      {/* Quick nav — horizontal scroll on mobile */}
      <div className="mb-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 pr-2 pl-1 flex-nowrap whitespace-nowrap"
          style={{ WebkitMaskImage: 'linear-gradient(to right, black 75%, transparent 100%)', maskImage: 'linear-gradient(to right, black 75%, transparent 100%)' } as any}>
        {[
          { id: 'profile', label: '👤 Profile' },
          { id: 'ai', label: '🧠 AI' },
          { id: 'appearance', label: '🎨 Theme' },
          { id: 'currency', label: '💱 Currency' },
          { id: 'reports', label: '📅 Reports' },
          { id: 'export', label: '📥 Export' },
          { id: 'backup', label: '💾 Backup' },
          { id: 'updates', label: '🔄 Updates' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex-shrink-0 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs text-gray-400 hover:text-white transition-colors min-h-[44px]">
            {label}
          </button>
        ))}
        </div>

      </div>

      <div className="space-y-6">
        {/* Profile */}
        <Section title="Profile" icon={User} id="section-profile">
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-[#0d0f14] rounded-xl">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                {(user?.username || 'U')[0].toUpperCase()}
              </div>
              <div>
                <div className="text-white font-bold">{user?.username || '—'}</div>
                <div className="text-gray-400 text-sm">{user?.email || 'No email set'}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <FormInput label="New Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="you@example.com" className="flex-1" />
              <div className="pt-6">
                <ActionBtn onClick={changeEmail} disabled={saving}>Update Email</ActionBtn>
              </div>
            </div>
            {emailErr && <p className="text-red-400 text-sm">{emailErr}</p>}
          </div>
        </Section>

        {/* Password */}
        <Section title="Change Password" icon={Lock}>
          <div className="space-y-3">
            {[
              { label: 'Current Password', val: currentPw, setter: setCurrentPw, show: showCurrentPw, toggle: () => setShowCurrentPw(v => !v) },
              { label: 'New Password', val: newPw, setter: setNewPw, show: showNewPw, toggle: () => setShowNewPw(v => !v) },
              { label: 'Confirm New Password', val: confirmPw, setter: setConfirmPw, show: showConfirmPw, toggle: () => setShowConfirmPw(v => !v) },
            ].map(({ label, val, setter, show, toggle }) => (
              <div key={label} className="relative">
                <label className="block text-gray-400 text-sm font-medium mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={val}
                    onChange={e => setter(e.target.value)}
                    className="w-full px-4 py-2.5 pr-10 bg-[#0d0f14] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors text-sm"
                  />
                  <button type="button" onClick={toggle}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/5">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}

            {newPw.length > 0 && (
              <div className="p-3 bg-[#0d0f14] rounded-xl space-y-1.5">
                {[
                  { ok: newPw.length >= 8, label: 'At least 8 characters' },
                  { ok: /[A-Z]/.test(newPw), label: 'One uppercase letter' },
                  { ok: /[a-z]/.test(newPw), label: 'One lowercase letter' },
                  { ok: /[0-9]/.test(newPw), label: 'One number' },
                ].map(r => (
                  <div key={r.label} className={`flex items-center gap-2 text-xs ${r.ok ? 'text-emerald-400' : 'text-gray-500'}`}>
                    <Check className={`w-3 h-3 ${r.ok ? 'opacity-100' : 'opacity-30'}`} />
                    {r.label}
                  </div>
                ))}
              </div>
            )}

            {pwErr && <p className="text-red-400 text-sm">{pwErr}</p>}
            <div className="pt-1">
              <ActionBtn onClick={changePassword} disabled={saving}>Change Password</ActionBtn>
            </div>
          </div>
        </Section>

        {/* AI / Oracle */}
        <Section title="Oracle AI" icon={Sparkles} id="section-ai">
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Configure AI providers and scheduled reports in Oracle.</p>
            <div className="flex gap-3">
              <ActionBtn onClick={() => navigate('/oracle')}>Open Oracle</ActionBtn>
              <ActionBtn onClick={() => navigate('/oracle')} variant="ghost">Configure Providers</ActionBtn>
            </div>
          </div>
        </Section>

        {/* Theme */}
        <Section title="Appearance" icon={SunMoon} id="section-appearance">
          <div>
            <div className="text-gray-400 text-sm mb-3">Color Theme</div>
            <div className="flex gap-2">
              {(['dark','light','auto'] as const).map(t => (
                <button key={t} onClick={() => { setTheme(t as any); saveSettingsPatch({ theme: t }); }}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${theme === t ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                  {t === 'dark' ? '🌙 Dark' : t === 'light' ? '☀️ Light' : '🔄 Auto'}
                </button>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-2">Note: Light and Auto themes are in preview — some areas remain dark.</p>
          </div>
        </Section>

        {/* Currency */}
        <Section title="Display Currency" icon={Globe} id="section-currency">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <FormSelect label="Currency" value={currency} onChange={e => setCurrency(e.target.value)} options={CURRENCIES} />
            </div>
            <ActionBtn onClick={saveCurrency} disabled={saving}>Save</ActionBtn>
          </div>
          <p className="text-gray-500 text-xs mt-3">All values will be converted and displayed in the selected currency.</p>
        </Section>

        {/* Scheduled Reports */}
        <Section title="Scheduled Reports" icon={Bell} id="section-reports">
          <div className="space-y-3">
            <Toggle
              checked={autoReports.daily?.enabled || false}
              onChange={(v) => saveAutoReports({
                ...autoReports,
                daily: { enabled: v, time: autoReports.daily?.time || '09:00', timezone: autoReports.daily?.timezone || 'UTC' }
              })}
              label="Daily Summary"
              sub={`Time: ${autoReports.daily?.time || '09:00'} (${autoReports.daily?.timezone || 'UTC'})`}
            />
            {(autoReports.daily?.enabled || false) && (
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Daily time" type="time" value={autoReports.daily?.time || '09:00'} onChange={e => saveAutoReports({ ...autoReports, daily: { ...autoReports.daily, time: e.target.value } })} />
                <FormInput label="Timezone" value={autoReports.daily?.timezone || 'UTC'} onChange={e => saveAutoReports({ ...autoReports, daily: { ...autoReports.daily, timezone: e.target.value } })} placeholder="UTC" />
              </div>
            )}

            <Toggle
              checked={autoReports.weekly?.enabled || false}
              onChange={(v) => saveAutoReports({
                ...autoReports,
                weekly: { enabled: v, day: autoReports.weekly?.day || 'Monday', time: autoReports.weekly?.time || '09:00' }
              })}
              label="Weekly Digest"
              sub={`${autoReports.weekly?.day || 'Monday'} · ${autoReports.weekly?.time || '09:00'}`}
            />
            {(autoReports.weekly?.enabled || false) && (
              <div className="grid grid-cols-2 gap-3">
                <FormSelect label="Day" value={autoReports.weekly?.day || 'Monday'} onChange={e => saveAutoReports({ ...autoReports, weekly: { ...autoReports.weekly, day: e.target.value } })}
                  options={WEEK_DAYS.map(d => ({ value: d, label: d }))} />
                <FormInput label="Weekly time" type="time" value={autoReports.weekly?.time || '09:00'} onChange={e => saveAutoReports({ ...autoReports, weekly: { ...autoReports.weekly, time: e.target.value } })} />
              </div>
            )}
          </div>
        </Section>

        {/* Push */}
        <Section title="Push Notifications" icon={Bell}>
          {!pushSupported ? (
            <div className="text-yellow-400 text-sm">Push notifications require a modern browser with service worker support (HTTPS).</div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-2.5 h-2.5 rounded-full ${pushEnabled ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                <span className="text-gray-300 text-sm">{pushEnabled ? 'Push notifications enabled' : 'Push notifications disabled'}</span>
              </div>
              <div className="flex gap-3 flex-wrap">
                {!pushEnabled
                  ? <ActionBtn onClick={enablePush} disabled={pushLoading}>{pushLoading ? 'Enabling…' : 'Enable Push'}</ActionBtn>
                  : <ActionBtn onClick={disablePush} variant="ghost" disabled={pushLoading}>{pushLoading ? 'Disabling…' : 'Disable Push'}</ActionBtn>
                }
                {pushEnabled && <ActionBtn onClick={testPush} variant="ghost">Send Test</ActionBtn>}
              </div>
              <p className="text-gray-600 text-xs mt-3">You'll be prompted to allow browser notifications. Alerts are sent server-side when price targets are hit.</p>
            </>
          )}
        </Section>

        {/* Telegram */}
        <Section title="Telegram Integration" icon={MessageCircle}>
          <div className="flex gap-3 items-end">
            <FormInput label="Chat ID" value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} placeholder="e.g. 123456789" className="flex-1" />
            <ActionBtn onClick={saveTelegram} disabled={saving}>Save</ActionBtn>
            <ActionBtn onClick={testTelegram} variant="ghost" disabled={!telegramChatId}>Test</ActionBtn>
          </div>
          <p className="text-gray-500 text-xs mt-3">Enter your Telegram Chat ID to receive price alert notifications. Start a chat with the bot first, then paste your ID here.</p>
          {telegramChatId && (
            <div className="mt-3 flex items-center gap-2 text-emerald-400 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Chat ID configured — alerts will be sent to Telegram
            </div>
          )}
        </Section>

        {/* Wallet Auto-Sync */}
        <Section title="Wallet Auto-Sync" icon={RefreshCw} id="section-wallet-sync">
          <p className="text-gray-400 text-sm mb-4">Choose how often wallets are synced automatically. Syncing fetches live balance and transaction data.</p>
          <div className="flex gap-3 flex-wrap">
            {[{ label: 'Off', value: '0' }, { label: '5 min', value: '5' }, { label: '15 min', value: '15' }, { label: '30 min', value: '30' }, { label: '1 hour', value: '60' }].map(opt => (
              <button key={opt.value}
                onClick={() => saveSettingsPatch({ walletSyncInterval: opt.value })}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 text-sm transition-colors min-h-[40px]">
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-gray-600 text-xs mt-2">Wallet sync interval is saved to your preferences. The server processes the actual syncing via cron.</p>
        </Section>

        {/* Export / Import */}
        <Section title="Export / Import" icon={Download} id="section-export">
          <div className="flex gap-3 flex-wrap">
            <button onClick={exportPositionsCsv} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium">
              <Download className="w-4 h-4" /> Export Positions CSV
            </button>
            <button onClick={exportWatchlistCsv} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium">
              <Download className="w-4 h-4" /> Export Watchlist CSV
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium">
              🖨️ Portfolio PDF
            </button>
          </div>
          <div className="mt-4 p-4 bg-white/3 rounded-xl border border-white/5">
            <div className="text-gray-300 text-sm font-medium mb-3">Import CSV</div>
            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <select value={importMode} onChange={e => setImportMode(e.target.value as any)}
                className="flex-1 px-3 py-2 bg-[#0d0f14] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50">
                <option value="positions">Positions</option>
                <option value="watchlist">Watchlist</option>
              </select>
              <select value={importFormat} onChange={e => setImportFormat(e.target.value as any)}
                className="flex-1 px-3 py-2 bg-[#0d0f14] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50">
                <option value="auto">Auto-detect format</option>
                <option value="generic">Generic (symbol, qty, price)</option>
                <option value="degiro">DeGiro</option>
                <option value="trading212">Trading 212</option>
                <option value="ibkr">Interactive Brokers (IBKR)</option>
                <option value="keytrade">Keytrade Bank</option>
                <option value="coinmarketcap">CoinMarketCap</option>
              </select>
              <button onClick={() => importRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-300 text-sm font-medium min-h-[40px]">
                <Upload className="w-4 h-4" /> Choose File
              </button>
            </div>
            <p className="text-gray-600 text-xs">Supports Generic, DeGiro, and Trading 212 CSV exports. Auto-detect works for most broker formats.</p>
            <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportCsv(f);
              e.currentTarget.value = '';
            }} />
          </div>
        </Section>

        {/* Backup */}
        <Section title="Data Backup" icon={Download} id="section-backup">
          <p className="text-gray-400 text-sm mb-4">Download a full backup of your portfolio database.</p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={downloadBackup} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium">
              <Download className="w-4 h-4" /> Download Backup
            </button>
            <button onClick={() => restoreRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-300 text-sm font-medium">
              <Upload className="w-4 h-4" /> Restore Backup
            </button>
            <input ref={restoreRef} type="file" accept=".db,application/octet-stream" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restoreBackup(f);
              e.currentTarget.value = '';
            }} />
          </div>
          <p className="text-gray-500 text-xs mt-3">Restore will replace ALL your data.</p>
        </Section>

        {/* Updates */}
        <Section title="App Info / Updates" icon={Info} id="section-updates">
          <div className="space-y-4">
            {/* Version row */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white text-sm font-medium">Version</div>
                <div className="text-gray-500 text-xs font-mono">
                  {updateInfo ? `${updateInfo.currentVersion} · ${updateInfo.commitHash}` : 'Loading…'}
                </div>
              </div>
              <ActionBtn onClick={checkUpdates} variant="ghost" disabled={updateChecking}>
                {updateChecking ? 'Checking…' : 'Check for updates'}
              </ActionBtn>
            </div>

            {/* Update available banner */}
            {updateInfo?.lastCheckResult?.updateAvailable && (
              <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <span className="text-emerald-400 text-lg">🎉</span>
                <div>
                  <div className="text-emerald-400 text-sm font-medium">Update available</div>
                  <div className="text-gray-400 text-xs">{updateInfo.lastCheckResult.latestBeta || updateInfo.lastCheckResult.latestMain}</div>
                </div>
              </div>
            )}

            {/* Channel + auto-update */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-gray-400 text-xs mb-2">Update Channel</div>
                <div className="flex gap-2">
                  {(['stable','beta'] as const).map(ch => (
                    <button key={ch} onClick={() => { setUpdateChannel(ch); saveSettingsPatch({ updateChannel: ch }); }}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${updateChannel === ch ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                      {ch === 'stable' ? '🔒 Stable' : '🚀 Beta'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-gray-400 text-xs mb-2">Auto-Update</div>
                <button onClick={() => { setAutoUpdate(!autoUpdate); saveSettingsPatch({ autoUpdate: !autoUpdate }); }}
                  className={`w-full py-1.5 px-3 rounded-lg border text-xs font-medium transition-all ${autoUpdate ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                  {autoUpdate ? '✅ Enabled' : '⬜ Disabled'}
                </button>
              </div>
            </div>

            {updateInfo?.lastCheckTime && (
              <div className="text-gray-600 text-xs">Last checked: {new Date(updateInfo.lastCheckTime).toLocaleString()}</div>
            )}
          </div>
        </Section>

        {/* Account */}
        <Section title="Account" icon={Trash2}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white text-sm font-medium">Sign Out</div>
              <div className="text-gray-500 text-xs mt-0.5">Log out from all sessions</div>
            </div>
            <ActionBtn onClick={logout} variant="danger">Sign Out</ActionBtn>
          </div>
        </Section>
      </div>
    </div>
  );
}
