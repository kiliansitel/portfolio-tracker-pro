import { TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  sparklineData?: number[];
}

export function StatCard({ label, value, change, changeType = 'neutral', sparklineData }: StatCardProps) {
  const chartData = sparklineData?.map((value, index) => ({ value, index })) || [];
  
  return (
    <div className="relative bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5 shadow-lg hover:border-blue-500/30 transition-all duration-300 hover:shadow-blue-500/10 group">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative z-10">
        <div className="text-gray-400 text-sm font-medium mb-2">{label}</div>
        <div className="text-3xl font-bold text-white mb-3">{value}</div>
        
        {change && (
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 text-sm font-semibold ${
              changeType === 'positive' ? 'text-emerald-400' : 
              changeType === 'negative' ? 'text-red-400' : 
              'text-gray-400'
            }`}>
              {changeType === 'positive' && <TrendingUp className="w-4 h-4" />}
              {changeType === 'negative' && <TrendingDown className="w-4 h-4" />}
              {change}
            </div>
          </div>
        )}
        
        {chartData.length > 0 && (
          <div className="mt-4 h-12 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke={changeType === 'positive' ? '#34d399' : changeType === 'negative' ? '#f87171' : '#6366f1'}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
