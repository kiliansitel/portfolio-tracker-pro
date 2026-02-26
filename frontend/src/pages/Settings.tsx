import { Settings as SettingsIcon, User, Lock, Globe, Bell, Download, Trash2, Eye, EyeOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { FormInput, FormSelect, ActionBtn } from '../components/Modal';

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'EUR', label: 'EUR — Euro (€)' },
  { value: 'GBP', label: 'GBP — British Pound (£)' },
  { value: 'CHF', label: 'CHF — Swiss Franc (CHF)' },
];

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-6">
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
  const { user, logout } = useAuth();
  const [currency, setCurrency] = useState('USD');
  const [autoSettings, setAutoSettings] = useState<any>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

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

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (user) {
      setCurrency(user.currency || user.settings?.currency || 'USD');
      setAutoSettings(user.settings?.autoReports || {});
      setNewEmail(user.email || '');
    }
  }, [user]);

  const saveCurrency = async () => {
    setSaving(true);
    try {
      await api.updateSettings({ currency });
      showToast('Currency saved');
    } catch (e: any) { showToast(e.message, false); } finally { setSaving(false); }
  };

  const saveAutoReports = async (newAuto: any) => {
    setAutoSettings(newAuto);
    try {
      await api.updateSettings({ settings: { ...user?.settings, autoReports: newAuto } });
      showToast('Settings saved');
    } catch (e: any) { showToast(e.message, false); }
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

  const setDailyEnabled = (v: boolean) => saveAutoReports({ ...autoSettings, daily: { ...autoSettings.daily, enabled: v } });
  const setWeeklyEnabled = (v: boolean) => saveAutoReports({ ...autoSettings, weekly: { ...autoSettings.weekly, enabled: v } });

  return (
    <div className="p-8 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <SettingsIcon className="w-6 h-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-white">Settings</h2>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-3 rounded-xl shadow-xl font-medium text-sm text-white ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <div className="space-y-6">
        {/* Profile */}
        <Section title="Profile" icon={User}>
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
                  <button
                    type="button"
                    onClick={toggle}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            {pwErr && <p className="text-red-400 text-sm">{pwErr}</p>}
            <div className="pt-1">
              <ActionBtn onClick={changePassword} disabled={saving}>Change Password</ActionBtn>
            </div>
          </div>
        </Section>

        {/* Currency */}
        <Section title="Display Currency" icon={Globe}>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <FormSelect label="Currency" value={currency} onChange={e => setCurrency(e.target.value)} options={CURRENCIES} />
            </div>
            <ActionBtn onClick={saveCurrency} disabled={saving}>Save</ActionBtn>
          </div>
          <p className="text-gray-500 text-xs mt-3">All values will be converted and displayed in the selected currency.</p>
        </Section>

        {/* Auto Reports */}
        <Section title="Automated Reports" icon={Bell}>
          <div className="space-y-1">
            <Toggle
              checked={autoSettings.daily?.enabled || false}
              onChange={setDailyEnabled}
              label="Daily Report"
              sub={`Auto-generated each day at ${autoSettings.daily?.time || '09:00'} ${autoSettings.daily?.timezone || 'UTC'}`}
            />
            <Toggle
              checked={autoSettings.weekly?.enabled || false}
              onChange={setWeeklyEnabled}
              label="Weekly Report"
              sub={`Auto-generated each ${autoSettings.weekly?.day || 'Monday'} at ${autoSettings.weekly?.time || '09:00'}`}
            />
          </div>
        </Section>

        {/* Backup */}
        <Section title="Data Backup" icon={Download}>
          <p className="text-gray-400 text-sm mb-4">Download a full backup of your portfolio database.</p>
          <div className="flex gap-3">
            <button
              onClick={downloadBackup}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" /> Download Backup
            </button>
          </div>
        </Section>

        {/* Danger Zone */}
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
