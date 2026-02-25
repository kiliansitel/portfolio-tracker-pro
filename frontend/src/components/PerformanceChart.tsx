import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

const defaultPerformanceData = [
  { date: 'Feb 20', value: 2.1 },
  { date: 'Feb 21', value: 2.5 },
  { date: 'Feb 22', value: 2.3 },
  { date: 'Feb 23', value: 2.7 },
  { date: 'Feb 24', value: 2.81 },
];

const timeframes = ['1D', '1W', '1M', '3M', '1Y', 'All'];

export function PerformanceChart({
  data,
  summaryLabelLeft,
  summaryLabelRight,
  yTickFormatter,
}: {
  data?: { date: string; value: number }[];
  summaryLabelLeft?: string;
  summaryLabelRight?: string;
  yTickFormatter?: (v: number) => string;
} = {}) {
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
              className={`
                px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200
                ${tf === '1W' 
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
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={(data && data.length ? data : defaultPerformanceData)}>
            <defs>
              <linearGradient id="performanceGradient" x1="0" y1="0" x2="0" y2="1">
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
              tickFormatter={(value) => (yTickFormatter ? yTickFormatter(value) : `$${value}M`)}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1a1d29', 
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}M`, 'Value']}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#3b82f6" 
              strokeWidth={3}
              fill="url(#performanceGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between mt-6 text-sm">
        <div className="text-gray-500">{summaryLabelLeft || 'Feb 24'}</div>
        <div className="text-emerald-400 font-semibold">{summaryLabelRight || '+$0.71M (+33.8%)'}</div>
      </div>
    </div>
  );
}
