import { Bell, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Alert {
  id: number;
  symbol: string;
  condition: string; // 'above' | 'below'
  targetPrice: number;
  currentPrice: number;
  isActive: boolean;
  logoGradient: string;
}

const GRADIENTS: Record<string, string> = {
  BTC: 'from-orange-500 to-orange-600',
  ETH: 'from-blue-500 to-purple-600',
  GOOGL: 'from-blue-500 to-blue-600',
  AAPL: 'from-gray-600 to-gray-700',
  NVDA: 'from-green-500 to-emerald-600',
  TSLA: 'from-red-500 to-red-600',
  SLV: 'from-gray-400 to-gray-500',
  GLD: 'from-yellow-500 to-yellow-600',
  AMD: 'from-red-600 to-red-700',
  MSFT: 'from-blue-500 to-cyan-500',
};

function getGradient(symbol: string): string {
  const root = symbol.replace('-USD', '').split('-')[0];
  return GRADIENTS[root] || 'from-blue-500 to-purple-600';
}

export function Alerts() {
  const [alertList, setAlertList] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.alerts.list()
      .then(async (data: any[]) => {
        if (!Array.isArray(data) || data.length === 0) { setLoading(false); return; }

        // Fetch current prices for all symbols
        const symbols = [...new Set(data.map((a: any) => a.symbol))];
        const prices: Record<string, number> = {};
        await Promise.all(symbols.map(async (sym) => {
          try {
            const p = await api.markets.price(sym);
            if (p?.price) prices[sym] = p.price;
          } catch { /* skip */ }
        }));

        setAlertList(data.map((a: any) => ({
          id: a.id,
          symbol: a.symbol,
          condition: a.condition, // 'above' or 'below'
          targetPrice: a.value || 0,
          currentPrice: prices[a.symbol] || 0,
          isActive: a.is_active === 1 || a.is_active === true,
          logoGradient: getGradient(a.symbol),
        })));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleAlert = (id: number) => {
    setAlertList((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a))
    );
  };

  const formatCondition = (alert: Alert) => {
    return `${alert.condition === 'above' ? 'Above' : 'Below'} $${alert.targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getProgress = (alert: Alert) => {
    if (alert.targetPrice === 0 || alert.currentPrice === 0) return 0;
    if (alert.condition === 'above') {
      return Math.min((alert.currentPrice / alert.targetPrice) * 100, 100);
    } else {
      // For 'below': progress toward target means price going down
      return Math.min((alert.targetPrice / alert.currentPrice) * 100, 100);
    }
  };

  const isTriggered = (alert: Alert) => {
    if (alert.currentPrice === 0) return false;
    return alert.condition === 'above'
      ? alert.currentPrice >= alert.targetPrice
      : alert.currentPrice <= alert.targetPrice;
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-white">Price Alerts</h2>
          {!loading && <span className="text-gray-500 text-sm">({alertList.length} alerts)</span>}
        </div>
        <button className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-500">Loading alerts...</div>
      )}

      {/* Alerts List */}
      <div className="space-y-4">
        {alertList.map((alert) => {
          const progress = getProgress(alert);
          const triggered = isTriggered(alert);

          return (
            <div
              key={alert.id}
              className={`bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border p-6 hover:border-blue-500/30 transition-all ${
                triggered ? 'border-emerald-500/30' : 'border-white/5'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${alert.logoGradient} flex items-center justify-center shadow-lg`}>
                    <span className="text-white font-bold text-lg">{alert.symbol.replace('-USD','')[0]}</span>
                  </div>
                  <div>
                    <div className="text-white font-bold text-lg">{alert.symbol}</div>
                    <div className="text-gray-400 text-sm">{formatCondition(alert)}</div>
                    {alert.currentPrice > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-gray-500 text-xs">Current:</span>
                        <span className="text-white text-xs font-medium">
                          ${alert.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {triggered && (
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full font-medium">
                            Triggered
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${alert.isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                    <span className={`text-sm font-medium ${alert.isActive ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {alert.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleAlert(alert.id)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${alert.isActive ? 'bg-emerald-500' : 'bg-gray-700'}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-lg transition-transform duration-200 ${alert.isActive ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative h-1.5 bg-[#0d0f14] rounded-full overflow-hidden">
                <div
                  className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                    triggered
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      : 'bg-gradient-to-r from-blue-500 to-purple-600'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {alert.targetPrice > 0 && alert.currentPrice > 0 && (
                <div className="flex justify-between mt-1 text-xs text-gray-600">
                  <span>$0</span>
                  <span>${alert.targetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && alertList.length === 0 && (
        <div className="text-center py-20">
          <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No alerts set</h3>
          <p className="text-gray-500">Click the + button to create your first price alert</p>
        </div>
      )}
    </div>
  );
}
