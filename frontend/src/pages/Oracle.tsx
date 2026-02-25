import { Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';

interface SignalRow {
  ticker: string;
  signal: string;
  priceTarget: string;
  confidence: string;
  timeframe: string;
}

const SIGNAL_DATA: SignalRow[] = [
  { ticker: 'AAPL', signal: 'Hold', priceTarget: '$270', confidence: 'Moderate', timeframe: 'Short Term' },
  { ticker: 'BTC-USD', signal: 'Buy', priceTarget: '-', confidence: 'High', timeframe: 'Short Term' },
  { ticker: 'ETH-USD', signal: 'Sell', priceTarget: '$1600', confidence: 'High', timeframe: 'Short Term' },
  { ticker: 'IBM', signal: 'Strong Buy', priceTarget: '$57', confidence: 'High', timeframe: 'Short Term' },
  { ticker: 'NVDA', signal: 'Hold', priceTarget: '$200', confidence: 'Moderate', timeframe: 'Short Term' },
  { ticker: 'TSLA', signal: 'Sell', priceTarget: '$330', confidence: 'High', timeframe: 'Short Term' },
];

function getSignalColor(signal: string): string {
  switch (signal) {
    case 'Buy': case 'Strong Buy': return 'text-emerald-400';
    case 'Sell': return 'text-red-400';
    case 'Hold': return 'text-yellow-400';
    default: return 'text-gray-400';
  }
}

export function Oracle() {
  const [activeTab, setActiveTab] = useState('Gamify');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await api.oracle.analyzeWatchlist();
      setAnalysisResult(result?.content || result?.analysis || JSON.stringify(result));
    } catch (err) {
      setAnalysisResult('Analysis unavailable. Please configure an AI provider in Settings.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-purple-500" />
          <h2 className="text-2xl font-bold text-white">Oracle</h2>
          <span className="text-gray-500 text-sm">AI-powered signals</span>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white font-medium shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all disabled:opacity-50 text-sm"
        >
          <Sparkles className="w-4 h-4" />
          {analyzing ? 'Analyzing...' : 'Analyze my watchlist signals'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 mb-8">
        {['Gamify', 'Summary', 'Rumours', 'Investor', 'Market'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg font-medium transition-all text-sm ${
              activeTab === tab
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Analysis Result */}
      {analysisResult && (
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-purple-500/20 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h3 className="text-purple-400 font-bold">Oracle Analysis</h3>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{analysisResult}</p>
        </div>
      )}

      {/* Signal Summary Table */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-white font-semibold text-lg">Signal Summary Table</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-gray-400 text-sm font-medium pb-3 px-4">Ticker</th>
                <th className="text-left text-gray-400 text-sm font-medium pb-3 px-4">Signal</th>
                <th className="text-left text-gray-400 text-sm font-medium pb-3 px-4">Price Target</th>
                <th className="text-left text-gray-400 text-sm font-medium pb-3 px-4">Confidence</th>
                <th className="text-left text-gray-400 text-sm font-medium pb-3 px-4">Timeframe</th>
              </tr>
            </thead>
            <tbody>
              {SIGNAL_DATA.map((row, idx) => (
                <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-4 px-4 text-white font-bold">{row.ticker}</td>
                  <td className={`py-4 px-4 font-semibold ${getSignalColor(row.signal)}`}>{row.signal}</td>
                  <td className="py-4 px-4 text-gray-300">{row.priceTarget}</td>
                  <td className="py-4 px-4 text-gray-300">{row.confidence}</td>
                  <td className="py-4 px-4 text-gray-300">{row.timeframe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 3 Entry Opportunities */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-emerald-500/20 p-6 mb-6">
        <h3 className="text-emerald-400 font-bold text-lg mb-4">Top 3 Entry Opportunities</h3>
        <div className="space-y-4 text-gray-300 text-sm leading-relaxed">
          <div>
            <div className="text-white font-bold mb-2">★ IBM</div>
            <div className="pl-4 space-y-1">
              <div><span className="text-emerald-400">- Entry Price Zone:</span> $40–$42</div>
              <div><span className="text-red-400">- Stop-Loss Level:</span> Below $39</div>
              <div><span className="text-blue-400">- Target Price:</span> $57 (40% upside)</div>
              <div><span className="text-purple-400">- Catalyst:</span> Recent strong earnings and positive analyst coverage.</div>
            </div>
          </div>
          <div>
            <div className="text-white font-bold mb-2">★ BTC-USD</div>
            <div className="pl-4 space-y-1">
              <div><span className="text-emerald-400">- Entry Price Zone:</span> $60,000–$63,000</div>
              <div><span className="text-red-400">- Stop-Loss Level:</span> Below $58,000</div>
              <div><span className="text-blue-400">- Target Price:</span> $75,000 (20% upside)</div>
              <div><span className="text-purple-400">- Catalyst:</span> Institutional adoption and macroeconomic tailwinds.</div>
            </div>
          </div>
          <div>
            <div className="text-white font-bold mb-2">★ NVDA</div>
            <div className="pl-4 space-y-1">
              <div><span className="text-emerald-400">- Entry Price Zone:</span> $183–$192</div>
              <div><span className="text-red-400">- Stop-Loss Level:</span> Below $180</div>
              <div><span className="text-blue-400">- Target Price:</span> $210 (10% upside)</div>
              <div><span className="text-purple-400">- Catalyst:</span> AI demand and upcoming product launches.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Actionable Next Steps */}
      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-6">
        <h3 className="text-white font-bold text-lg mb-4">Actionable Next Steps</h3>
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <div>• Consider setting an alert for <span className="text-emerald-400">IBM at $42</span> to catch entry opportunities.</div>
          <div>• Consider partial positions in <span className="text-emerald-400">BTC-USD</span> near current levels.</div>
          <div>• Monitor <span className="text-yellow-400">AAPL</span> for a breakout above $270 resistance.</div>
        </div>
      </div>
    </div>
  );
}
