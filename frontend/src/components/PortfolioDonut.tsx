import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Skeleton } from './ui/skeleton';

export function PortfolioDonut({
  data,
  totalLabel,
  loading,
}: {
  data?: { name: string; value: number; color: string }[];
  totalLabel?: string;
  loading?: boolean;
} = {}) {
  const [showAll, setShowAll] = useState(false);
  const hasData = Array.isArray(data) && data.length > 0;
  const MAX_LEGEND = 5;

  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5 shadow-lg h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-600" />
        <h3 className="text-white font-semibold text-lg">Allocation</h3>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-48 rounded-full mx-auto" />
          <Skeleton className="h-4 w-24 mx-auto" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-600 text-sm">
          <div className="w-16 h-16 rounded-full border-4 border-dashed border-gray-700 mb-3" />
          No allocation data
        </div>
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data!.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6">
            <div className="text-center mb-4">
              <div className="text-2xl font-bold text-white">{totalLabel || '—'}</div>
            </div>

            <div className="space-y-3">
              {(showAll ? data! : data!.slice(0, MAX_LEGEND)).map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-gray-400 truncate max-w-[100px]">{item.name}</span>
                  </div>
                  <span className="text-white font-semibold ml-2">{item.value.toFixed(1)}%</span>
                </div>
              ))}
              {data!.length > MAX_LEGEND && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors w-full text-center pt-1"
                >
                  {showAll ? '▲ Show less' : `▼ +${data!.length - MAX_LEGEND} more`}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
