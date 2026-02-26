import { LayoutDashboard, TrendingUp, Target, Sparkles, MoreHorizontal, X, PieChart, Bell, Settings, Newspaper, Link2, ClipboardList, Wallet, DollarSign } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { useState } from 'react';

const PRIMARY_ITEMS = [
  { icon: LayoutDashboard, label: 'Home', path: '/' },
  { icon: TrendingUp, label: 'Positions', path: '/positions' },
  { icon: Target, label: 'Watchlist', path: '/watchlist' },
  { icon: Sparkles, label: 'Oracle', path: '/oracle' },
];

const MORE_ITEMS = [
  { icon: PieChart, label: 'Portfolio', path: '/portfolio' },
  { icon: Bell, label: 'Alerts', path: '/alerts' },
  { icon: Newspaper, label: 'News', path: '/news' },
  { icon: Link2, label: 'Wallets', path: '/connections' },
  { icon: ClipboardList, label: 'Transactions', path: '/transactions' },
  { icon: DollarSign, label: 'Dividends', path: '/dividends' },
  { icon: Wallet, label: 'Wallet', path: '/wallet' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  const anyMoreActive = MORE_ITEMS.some(i => isActive(i.path));

  return (
    <>
      {/* More Menu Overlay */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-[#13151d] border-t border-white/10 rounded-t-2xl px-4 pt-4 pb-[80px]"
            onClick={e => e.stopPropagation()}
          >
            {/* drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-semibold text-base">More</span>
              <button onClick={() => setMoreOpen(false)} className="p-2 text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {MORE_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setMoreOpen(false); }}
                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${active ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-[11px] font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f1117]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-around px-1 py-1 pb-safe">
        {PRIMARY_ITEMS.map(item => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => { setMoreOpen(false); navigate(item.path); }}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] min-h-[56px] justify-center transition-all ${active ? 'text-blue-400' : 'text-gray-500'}`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-blue-400' : ''}`} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
        {/* More button */}
        <button
          onClick={() => setMoreOpen(o => !o)}
          className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] min-h-[56px] justify-center transition-all ${moreOpen || anyMoreActive ? 'text-blue-400' : 'text-gray-500'}`}
        >
          {moreOpen
            ? <X className="w-5 h-5" />
            : <MoreHorizontal className="w-5 h-5" />}
          <span className="text-[10px] font-medium">{moreOpen ? 'Close' : 'More'}</span>
        </button>
      </nav>
    </>
  );
}
