import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

const candlestickData = [
  { date: 'Jan 27', open: 5068, close: 5096, high: 5102, low: 5055, volume: 450 },
  { date: 'Jan 29', open: 5096, close: 5079, high: 5110, low: 5072, volume: 380 },
  { date: 'Feb 1', open: 5079, close: 5124, high: 5136, low: 5070, volume: 520 },
  { date: 'Feb 4', open: 5124, close: 5062, high: 5144, low: 5048, volume: 680 },
  { date: 'Feb 6', open: 5062, close: 5156, high: 5164, low: 5050, volume: 720 },
  { date: 'Feb 10', open: 5156, close: 5102, high: 5172, low: 5092, volume: 590 },
  { date: 'Feb 12', open: 5102, close: 5088, high: 5114, low: 5076, volume: 470 },
  { date: 'Feb 17', open: 5088, close: 5140, high: 5158, low: 5080, volume: 640 },
  { date: 'Feb 19', open: 5140, close: 5186, high: 5201, low: 5132, volume: 780 },
  { date: 'Feb 24', open: 5186, close: 5168, high: 5196, low: 5154, volume: 520 },
];

const volumeData = candlestickData.map((d, i) => ({
  ...d,
  volumeValue: d.volume,
}));

const timeframes = ['1D', '1W', '1M', '3M', '6M', '1Y'];

export function CandlestickChart() {
  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-6 border border-white/5 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600" />
          <div>
            <h3 className="text-white font-semibold text-lg">GSPC</h3>
            <div className="text-gray-400 text-sm">S&P 500</div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            {timeframes.map((tf) => (
              <button
                key={tf}
                className={`
                  px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200
                  ${tf === '1M' 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30' 
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }
                `}
              >
                {tf}
              </button>
            ))}
          </div>
          
          <button className="px-4 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/30 transition-colors">
            Candlestick
          </button>
        </div>
      </div>

      {/* Main Candlestick Chart */}
      <div className="h-80 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={candlestickData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
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
              tickLine={false}
              axisLine={false}
              domain={['dataMin', 'dataMax']}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1a1d29', 
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Close']}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke="#10b981"
              strokeWidth={3}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume Chart */}
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={volumeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#6b7280" 
              style={{ fontSize: '10px' }}
              tickLine={false}
              axisLine={false}
              hide
            />
            <YAxis hide />
            <Bar 
              dataKey="volumeValue" 
              fill="#8b5cf6"
              opacity={0.3}
              barSize={20}
            />
            <Line 
              type="monotone" 
              dataKey="volumeValue" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
