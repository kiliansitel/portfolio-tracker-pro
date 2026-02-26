import { LayoutDashboard, TrendingUp, Target, PieChart, Sparkles } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';

const MOBILE_ITEMS = [
  { icon: LayoutDashboard, label: 'Home', path: '/' },
  { icon: TrendingUp, label: 'Positions', path: '/positions' },
  { icon: Target, label: 'Watchlist', path: '/watchlist' },
  { icon: PieChart, label: 'Portfolio', path: '/portfolio' },
  { icon: Sparkles, label: 'Oracle', path: '/oracle' },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f1117] border-t border-white/10 flex items-center justify-around px-2 py-2 safe-area-bottom">
      {MOBILE_ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : ''}`} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
