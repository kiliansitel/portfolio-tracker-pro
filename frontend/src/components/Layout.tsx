import { Outlet, useNavigate } from 'react-router';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Bell, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { auth } from '../lib/auth';
import { GlobalSearch } from './GlobalSearch';

export function Layout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  // Proactive JWT expiry check — redirect 60s before token expires
  useEffect(() => {
    const check = () => {
      if (!auth.isLoggedIn()) {
        logout();
        navigate('/login');
        return;
      }
      const secs = auth.expiresInSeconds();
      if (secs !== null && secs < 60) {
        logout();
        navigate('/login');
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [logout, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen w-screen bg-[#0d0f14] overflow-hidden relative">
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1a1d29',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff',
          },
        }}
      />
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <BottomNav />

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-[#0f1117] border-b border-white/5 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              Portfolio Pro
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <GlobalSearch />
            {user && (
              <span className="text-gray-400 text-sm font-medium hidden sm:inline">
                {user.username || user.name}
              </span>
            )}
            <button className="relative p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
              <Bell className="w-5 h-5" />
              <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>

        {/* Page Content — extra bottom padding on mobile for the bottom nav */}
        <div className="pb-20 md:pb-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
