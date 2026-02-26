import {
  LayoutDashboard, TrendingUp, Target, PieChart, Wallet, Bell,
  Settings, Link2, Newspaper, Sparkles, ClipboardList, DollarSign,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const sidebarItems = [
  { id: 'dashboard',    icon: LayoutDashboard, label: 'Dashboard',    path: '/' },
  { id: 'positions',    icon: TrendingUp,       label: 'Positions',    path: '/positions' },
  { id: 'watchlist',    icon: Target,            label: 'Watchlist',    path: '/watchlist' },
  { id: 'portfolio',    icon: PieChart,          label: 'Portfolio',    path: '/portfolio' },
  { id: 'news',         icon: Newspaper,         label: 'News',         path: '/news' },
  { id: 'oracle',       icon: Sparkles,          label: 'Oracle',       path: '/oracle' },
  { id: 'alerts',       icon: Bell,              label: 'Alerts',       path: '/alerts' },
  { id: 'wallet',       icon: Wallet,            label: 'Cash',         path: '/wallet' },
  { id: 'transactions', icon: ClipboardList,     label: 'Transactions', path: '/transactions' },
  { id: 'dividends',    icon: DollarSign,        label: 'Dividends',    path: '/dividends' },
  { id: 'connections',  icon: Link2,             label: 'Connections',  path: '/connections' },
  { id: 'settings',     icon: Settings,          label: 'Settings',     path: '/settings' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-16 bg-[#0f1117] border-r border-white/5 flex flex-col items-center py-6 gap-6 flex-shrink-0">
        {/* Logo */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30">
          P
        </div>

        <div className="w-8 h-px bg-white/10" />

        {/* Navigation Items */}
        <div className="flex-1 flex flex-col gap-3 w-full items-center">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(item.path)}
                    aria-label={item.label}
                    className={`
                      relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200
                      ${isActive
                        ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }
                    `}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg blur opacity-50" />
                    )}
                    <Icon className="w-5 h-5 relative z-10" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-[#1a1d29] border border-white/10 text-white text-sm px-3 py-1.5 rounded-lg shadow-xl">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
