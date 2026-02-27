import { Calendar, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { fmt } from '../lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Skeleton } from '../components/ui/skeleton';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

function ExDateBadge({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-gray-600 text-xs">No ex-date</span>;
  const days = daysUntil(dateStr);
  if (days < 0) return <span className="px-2 py-0.5 bg-gray-500/10 text-gray-500 text-xs rounded-full">Passed {Math.abs(days)}d ago</span>;
  if (days === 0) return <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full animate-pulse">Ex-date TODAY</span>;
  if (days <= 7) return <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">In {days}d</span>;
  return <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded-full">{dateStr} (in {days}d)</span>;
}

export function Dividends() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [portfolioId, setPortfolioId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const ps = await api.portfolio.all().catch(() => []);
        if (!ps?.length) return;
        setPortfolioId(ps[0].id);
        const d = await api.dividends(ps[0].id).catch(() => null);
        setData(d);
      } finally { setLoading(false); }
    })();
  }, []);

  const monthlyIncome: number[] = data?.monthlyIncome || Array(12).fill(0);
  const positions: any[] = data?.positions || [];
  const summary = data?.summary || {};
  const chartData = MONTHS.map((m, i) => ({ month: m, income: Number((monthlyIncome[i] || 0).toFixed(2)) }));
  const maxIncome = Math.max(...monthlyIncome, 0.01);

  const upcomingEx = positions
    .filter(p => p.exDividendDate)
    .map(p => ({ ...p, daysLeft: daysUntil(p.exDividendDate) }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 10);

  // Next upcoming ex-date: prefer future, fall back to most recent past
  const nextUpcomingExDate = upcomingEx.find(p => p.daysLeft >= 0)?.exDividendDate
    || summary.nextExDate;

  if (loading) return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto space-y-4">
      <Skeleton className="h-8 w-48 bg-white/5 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24 bg-white/5 rounded-xl"/>)}
      </div>
    </div>
  );

  if (!data || positions.length === 0) return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Calendar className="w-6 h-6 text-emerald-400" />
        <h2 className="text-2xl font-bold text-white">Dividend Calendar</h2>
      </div>
      <div className="text-center py-24 bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5">
        <DollarSign className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <h3 className="text-xl font-semibold text-gray-400 mb-2">No dividend-paying positions</h3>
        <p className="text-gray-500">Add dividend stocks or ETFs to your portfolio to see your income calendar.</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-8 pb-40 md:pb-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="w-6 h-6 text-emerald-400" />
        <h2 className="text-2xl font-bold text-white">Dividend Calendar</h2>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-5 border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-400 text-xs">Annual Income</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">{fmt(summary.totalAnnualIncome || 0)}</div>
          <div className="text-gray-500 text-xs mt-0.5">{fmt((summary.totalAnnualIncome || 0) / 12)}/mo avg</div>
        </div>
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-5 border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span className="text-gray-400 text-xs">Avg Yield</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">{((summary.averageYield || 0) * 100).toFixed(2)}%</div>
          <div className="text-gray-500 text-xs mt-0.5">Weighted avg</div>
        </div>
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-5 border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-purple-400" />
            <span className="text-gray-400 text-xs">Div. Positions</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">{summary.positionsWithDividends || 0}</div>
          <div className="text-gray-500 text-xs mt-0.5">of {summary.totalPositions || 0} total</div>
        </div>
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-5 border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-400" />
            <span className="text-gray-400 text-xs">Next Ex-Date</span>
          </div>
          <div className="text-lg font-bold text-white">{nextUpcomingExDate || '—'}</div>
          {nextUpcomingExDate && (
            <div className={`text-xs mt-0.5 ${daysUntil(nextUpcomingExDate) < 0 ? 'text-gray-500' : 'text-orange-400'}`}>
              {(() => {
                const d = daysUntil(nextUpcomingExDate);
                if (d === 0) return 'Today!';
                if (d < 0) return `${Math.abs(d)}d ago`;
                return `In ${d} days`;
              })()}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Bar Chart */}
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-5 border border-white/5">
          <h3 className="text-white font-semibold mb-4">Monthly Income (Estimated)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `$${v}` : ''} width={40} />
                <Tooltip
                  contentStyle={{ background: '#1a1d29', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  formatter={(v: any) => [fmt(v), 'Estimated']}
                  labelStyle={{ color: '#9ca3af', fontSize: 12 }}
                />
                <Bar dataKey="income" fill="url(#divGrad)" radius={[4, 4, 0, 0]} />
                <defs>
                  <linearGradient id="divGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming Ex-Dates */}
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-5 border border-white/5">
          <h3 className="text-white font-semibold mb-4">Upcoming Ex-Dividend Dates</h3>
          <div className="space-y-3 max-h-52 overflow-y-auto">
            {upcomingEx.length === 0 ? (
              <p className="text-gray-500 text-sm">No upcoming ex-dates found</p>
            ) : upcomingEx.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <span className="text-emerald-400 text-xs font-bold">{p.symbol.slice(0, 3)}</span>
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">{p.symbol}</div>
                    <div className="text-gray-500 text-xs capitalize">{p.frequency} · {p.quantity} shares</div>
                  </div>
                </div>
                <div className="text-right">
                  <ExDateBadge dateStr={p.exDividendDate} />
                  <div className="text-emerald-400 text-xs mt-0.5 font-medium">{fmt(p.annualIncome)}/yr</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* All positions with dividends */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-white font-semibold">All Dividend Positions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-3 text-left text-gray-400 text-xs uppercase">Symbol</th>
                <th className="px-5 py-3 text-right text-gray-400 text-xs uppercase">Shares</th>
                <th className="px-5 py-3 text-right text-gray-400 text-xs uppercase">Rate/Share</th>
                <th className="px-5 py-3 text-right text-gray-400 text-xs uppercase">Yield</th>
                <th className="px-5 py-3 text-right text-gray-400 text-xs uppercase">Annual</th>
                <th className="px-5 py-3 text-center text-gray-400 text-xs uppercase">Frequency</th>
                <th className="px-5 py-3 text-left text-gray-400 text-xs uppercase">Ex-Date</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3 text-white font-bold">{p.symbol}</td>
                  <td className="px-5 py-3 text-right text-gray-300 text-sm">{p.quantity}</td>
                  <td className="px-5 py-3 text-right text-gray-300 text-sm">${p.dividendRate?.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right text-emerald-400 text-sm font-medium">{((p.dividendYield || 0) * 100).toFixed(2)}%</td>
                  <td className="px-5 py-3 text-right text-emerald-400 font-bold">{fmt(p.annualIncome)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded-full capitalize">{p.frequency}</span>
                  </td>
                  <td className="px-5 py-3"><ExDateBadge dateStr={p.exDividendDate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
