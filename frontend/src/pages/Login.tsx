import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';

export function Login() {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Register state
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Invalid username or password');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(''); setRegSuccess('');
    if (regPass.length < 6) { setRegError('Password must be at least 6 characters'); return; }
    if (regPass !== regConfirm) { setRegError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.register(regUser, regPass, regEmail || undefined);
      setRegSuccess('Account created! You can now sign in.');
      setTab('login');
      setUsername(regUser);
    } catch (e: any) {
      setRegError(e.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  const inp = "w-full px-4 py-3 bg-[#0d0f14] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors text-sm";

  return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-blue-500/30 mx-auto mb-4">P</div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">Portfolio Pro</h1>
          <p className="text-gray-400 mt-2 text-sm">{tab === 'login' ? 'Sign in to your account' : 'Create a new account'}</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
          <button onClick={() => setTab('login')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'login' ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Sign In</button>
          <button onClick={() => setTab('register')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'register' ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Register</button>
        </div>

        {/* Card */}
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-2xl border border-white/5 p-8 shadow-2xl">
          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-5">
              {regSuccess && <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">{regSuccess}</div>}
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Username</label>
                <input name="login" type="text" value={username} onChange={e => setUsername(e.target.value)} className={inp} placeholder="demo" required autoComplete="username" />
              </div>
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <input name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={`${inp} pr-12`} placeholder="••••••••" required autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white font-semibold shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Username</label>
                <input type="text" value={regUser} onChange={e => setRegUser(e.target.value)} className={inp} placeholder="username" required minLength={3} autoComplete="username" />
              </div>
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Email <span className="text-gray-600">(optional)</span></label>
                <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} className={inp} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <input type={showRegPass ? 'text' : 'password'} value={regPass} onChange={e => setRegPass(e.target.value)} className={`${inp} pr-12`} placeholder="Min. 6 characters" required autoComplete="new-password" />
                  <button type="button" onClick={() => setShowRegPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">Confirm Password</label>
                <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} className={inp} placeholder="Repeat password" required autoComplete="new-password" />
              </div>
              {regError && <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{regError}</div>}
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white font-semibold shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50">
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">Portfolio Tracker Pro © 2026</p>
      </div>
    </div>
  );
}
