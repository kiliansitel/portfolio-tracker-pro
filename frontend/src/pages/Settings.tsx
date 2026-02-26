import {
  Settings as SettingsIcon, User, Lock, Globe, Bell, Download, Trash2, Eye, EyeOff, Check,
  Upload, Sparkles, SunMoon, MessageCircle, Info
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
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
  const [theme, setTheme] = useState<'dark'|'light'>('dark');

  // Scheduled reports
  const [autoReports, setAutoReports] = useState<any>({});

  // Telegram
  const [telegramChatId, setTelegramChatId] = useState('');

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

    const storedTheme = (localStorage.getItem('theme') as any) || user.settings?.theme || 'dark';
    setTheme(storedTheme === 'light' ? 'light' : 'dark');
  }, [user]);

  // Apply theme immediately
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') root.classList.add('light-theme');
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
      showToast('Currency saved');
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

  const onImportCsv = async (file: File) => {
    // Minimal: parse a very simple CSV with headers symbol,quantity,entryPrice
    try {
      const text = await file.text();
      const [hdr, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const cols = hdr.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      const symIdx = cols.findIndex(c => c.toLowerCase().includes('symbol') || c.toLowerCase() === 'ticker');
      const qtyIdx = cols.findIndex(c => c.toLowerCase().includes('quantity'));
      const epIdx = cols.findIndex(c => c.toLowerCase().includes('entry') || c.toLowerCase().includes('price'));
      if (symIdx < 0) throw new Error('CSV must include a symbol/ticker column');
      const ps = await api.portfolio.all();
      if (!ps?.length) throw new Error('No portfolio found');
      const portfolioId = ps[0].id;
      let ok = 0, bad = 0;
      for (const ln of lines) {
        const parts = ln.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        const symbol = (parts[symIdx] || '').toUpperCase();
        if (!symbol) { bad++; continue; }
        const quantity = qtyIdx >= 0 ? Number(parts[qtyIdx]) : 1;
        const entryPrice = epIdx >= 0 ? Number(parts[epIdx]) : 0;
        try {
          await api.portfolio.createPosition(portfolioId, { symbol, quantity, entryPrice });
          ok++;
        } catch { bad++; }
      }
      toast.success(`Imported: ${ok} ok, ${bad} failed`);
    } catch (e: any) {
      toast.error(e.message || 'Import failed');
    }
  };

  const pushSupported = window.isSecureContext && 'Notification' in window;

  const enablePush = async () => {
    // Backend requires a PushSubscription; without VAPID key exposure we can only best-effort.
    toast.error('Push subscription requires HTTPS + VAPID public key; backend currently has no public-key endpoint.');
  };

  const disablePush = async () => {
    toast.error('Push unsubscribe needs endpoint; not available without a subscription');
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
    try {
      const d = await api.updates.status();
      toast.success(d?.message || 'Update check complete');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-4 sm:p-8 pb-40 md:pb-8 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <SettingsIcon className="w-6 h-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-white">Settings</h2>
      </div>

      {/* Quick nav — horizontal scroll on mobile */}
      <div className="relative mb-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 pr-6">
        {[
          { id: 'profile', label: '👤 Profile' },
          { id: 'ai', label: '🧠 AI' },
          { id: 'appearance', label: '🎨 Theme' },
          { id: 'currency', label: '💱 Currency' },
          { id: 'reports', label: '📅 Reports' },
          { id: 'export', label: '📥 Export' },
          { id: 'backup', label: '💾 Backup' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex-shrink-0 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs text-gray-400 hover:text-white transition-colors min-h-[36px]">
            {label}
          </button>
        ))}
        </div>
        {/* Scroll affordance */}
        <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-[#0d0f14] to-transparent z-10" />
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
          <Toggle
            checked={theme === 'light'}
            onChange={(v) => { setTheme(v ? 'light' : 'dark'); saveSettingsPatch({ theme: v ? 'light' : 'dark' }); }}
            label="Light mode"
            sub="Persisted locally and in your account settings"
          />
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
          {!window.isSecureContext && (
            <div className="text-yellow-400 text-sm">Requires HTTPS connection</div>
          )}
          <div className="flex gap-3 flex-wrap mt-3">
            <ActionBtn onClick={enablePush} disabled={!pushSupported}>Enable</ActionBtn>
            <ActionBtn onClick={disablePush} variant="ghost" disabled={!pushSupported}>Disable</ActionBtn>
            <ActionBtn onClick={testPush} variant="ghost">Test</ActionBtn>
          </div>
          <p className="text-gray-500 text-xs mt-3">Note: subscribing requires a service worker + VAPID public key. Server must expose the public key.</p>
        </Section>

        {/* Telegram */}
        <Section title="Telegram Integration" icon={MessageCircle}>
          <div className="flex gap-3 items-end">
            <FormInput label="Chat ID" value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} placeholder="e.g. 123456789" className="flex-1" />
            <ActionBtn onClick={saveTelegram} disabled={saving}>Save</ActionBtn>
          </div>
          <p className="text-gray-500 text-xs mt-3">Enter your Telegram Chat ID. Start a chat with the bot first, then paste your Chat ID here.</p>
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
            <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium">
              <Upload className="w-4 h-4" /> Import Positions CSV
            </button>
            <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportCsv(f);
              e.currentTarget.value = '';
            }} />
          </div>
          <p className="text-gray-500 text-xs mt-3">Import is a basic CSV importer (symbol/quantity/entryPrice). Advanced broker formats can be added later.</p>
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
        <Section title="App Info / Updates" icon={Info}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white text-sm font-medium">Version</div>
              <div className="text-gray-500 text-xs">Client build: (version info pending)</div>
            </div>
            <ActionBtn onClick={checkUpdates} variant="ghost">Check for updates</ActionBtn>
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
