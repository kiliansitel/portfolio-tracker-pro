import { useState, useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { fmt } from '../lib/format';

const timeframes = ['1D', '1W', '1M', '3M', '1Y', 'All'];

export function PerformanceChart({
  data,
  allData,
  summaryLabelLeft,
  summaryLabelRight,
  yTickFormatter,
  onTimeframeChange,
}: {
  data?: { date: string; value: number }[];
  /** Full dataset for timeframe filtering (optional — if not provided, timeframe buttons are cosmetic) */
  allData?: Record<string, { date: string; value: number }[]>;
  summaryLabelLeft?: string;
  summaryLabelRight?: string;
  yTickFormatter?: (v: number) => string;
  onTimeframeChange?: (tf: string) => void;
} = {}) {
  const [activeTf, setActiveTf] = useState('1W');
  const gradId = useId().replace(/:/g, '');

  const handleTf = (tf: string) => {
    setActiveTf(tf);
    onTimeframeChange?.(tf);
  };

  const chartData = (allData?.[activeTf] ?? data) || [];

  const tickFmt = yTickFormatter ?? ((v: number) => fmt(v));

  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
          <h3 className="text-white font-semibold text-lg">Performance</h3>
        </div>

        <div className="flex items-center gap-2">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => handleTf(tf)}
              className={`
                px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200
                ${activeTf === tf
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }
              `}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 17l4-4 4 4 4-4M3 21h18" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-sm font-medium">No performance data yet</div>
              <div className="text-gray-600 text-xs mt-1">Chart builds up over time as daily snapshots are recorded</div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={tickFmt}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1d29',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value: number) => [fmt(value), 'Value']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={3}
                fill={`url(#${gradId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-between mt-6 text-sm">
        <div className="text-gray-500">{summaryLabelLeft || '—'}</div>
        <div className="text-emerald-400 font-semibold">{summaryLabelRight || ''}</div>
      </div>
    </div>
  );
}
