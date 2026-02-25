import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

const defaultPortfolioData = [
  { name: 'AAPL', value: 60, color: '#3b82f6' },
  { name: 'Cash', value: 40, color: '#8b5cf6' },
];

export function PortfolioDonut({
  data,
  totalLabel,
}: {
  data?: { name: string; value: number; color: string }[];
  totalLabel?: string;
} = {}) {
  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5 shadow-lg h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-600" />
        <h3 className="text-white font-semibold text-lg">Allocation</h3>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data && data.length ? data : defaultPortfolioData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {(data && data.length ? data : defaultPortfolioData).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6">
        <div className="text-center mb-4">
          <div className="text-2xl font-bold text-white">{totalLabel || '$2481.6K'}</div>
        </div>
        
        <div className="space-y-3">
          {(data && data.length ? data : defaultPortfolioData).map((item) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-gray-400">{item.name}</span>
              </div>
              <span className="text-white font-semibold">{item.value.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
