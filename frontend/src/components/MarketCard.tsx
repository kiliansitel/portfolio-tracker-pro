interface MarketCardProps {
  symbol: string;
  name: string;
  price: string;
  change: string;
  changePercent: string;
  isPositive: boolean;
  volume?: string;
  marketCap?: string;
}

export function MarketCard({ 
  symbol, 
  name, 
  price, 
  change, 
  changePercent, 
  isPositive,
  volume,
  marketCap 
}: MarketCardProps) {
  return (
    <div className={`
      relative bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-lg p-4 border border-white/5
      hover:border-${isPositive ? 'emerald' : 'red'}-500/30 transition-all duration-200
      before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded-l-lg
      before:bg-gradient-to-b before:from-${isPositive ? 'emerald' : 'red'}-400 before:to-${isPositive ? 'emerald' : 'red'}-600
    `}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-white font-bold text-base">{symbol}</div>
            <div className="text-gray-500 text-xs">{name}</div>
          </div>
          <div className="text-2xl font-bold text-white mt-1">{price}</div>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1 text-sm font-semibold ${
          isPositive ? 'text-emerald-400' : 'text-red-400'
        }`}>
          <span>{isPositive ? '+' : ''}{change}</span>
          <span className="text-xs">({changePercent})</span>
        </div>
        
        {(volume || marketCap) && (
          <div className="text-xs text-gray-500">
            {volume && <div>Vol: {volume}</div>}
            {marketCap && <div>Cap: {marketCap}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
