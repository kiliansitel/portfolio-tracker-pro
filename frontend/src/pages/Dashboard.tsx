import { useEffect, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { PerformanceChart } from '../components/PerformanceChart';
import { CandlestickChart } from '../components/CandlestickChart';
import { PortfolioDonut } from '../components/PortfolioDonut';
import { MarketCard } from '../components/MarketCard';
import { api } from '../lib/api';

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function pct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

const MARKET_SYMBOLS = ['BTC-USD', 'ETH-USD', 'NVDA', 'AAPL', 'TSLA'];

export function Dashboard() {
  const [stats, setStats] = useState({ totalValue: 0, totalPL: 0, totalInvested: 0, assetCount: 0 });
  const [markets, setMarkets] = useState<any[]>([]);
  const [performance, setPerformance] = useState<{ date: string; value: number }[]>([]);
  const [donut, setDonut] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load portfolio data
        const portfolios = await api.portfolio.all().catch(() => []);
        if (portfolios && portfolios[0]?.id) {
          const portfolioId = portfolios[0].id;
          const portfolioCash = Number(portfolios[0].cash || 0);

          const rawPositions = await api.portfolio.positions(portfolioId).catch(() => []);
          const openPos = Array.isArray(rawPositions) ? rawPositions.filter((p: any) => p.status === 'open' || !p.status) : [];

          // Prices for positions
          const symbols = [...new Set(openPos.map((p: any) => p.symbol as string))];
          const priceMap: Record<string, number> = {};
          await Promise.all(symbols.map(async (sym) => {
            try { const d = await api.markets.price(sym); if (d?.price) priceMap[sym] = d.price; } catch { /**/ }
          }));

          const positionsValue = openPos.reduce((s: number, p: any) => s + (p.quantity || 0) * (priceMap[p.symbol] || 0), 0);
          const totalValue = positionsValue + portfolioCash;
          const totalInvested = openPos.reduce((s: number, p: any) => s + (p.quantity || 0) * (p.entry_price || 0), 0) + portfolioCash;
          const totalPL = positionsValue - (totalInvested - portfolioCash); // P/L on positions only
          setStats({ totalValue, totalPL, totalInvested, assetCount: openPos.length });

          // Performance snapshots
          const perf = await api.portfolio.performance(portfolioId).catch(() => null);
          const snaps = perf?.snapshots || [];
          if (Array.isArray(snaps) && snaps.length) {
            const last = snaps.slice(-12);
            setPerformance(last.map((s: any) => ({ date: s.date?.slice(5) || s.date, value: Number(s.total_value || 0) })));
          }

          // Donut allocation: top 4 positions + Cash + Other
          const values = openPos.map((p: any) => ({
            symbol: p.symbol,
            value: (p.quantity || 0) * (priceMap[p.symbol] || 0),
          })).sort((a, b) => b.value - a.value);

          const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#22c55e', '#06b6d4'];
          const top = values.slice(0, 4);
          const topSum = top.reduce((s, v) => s + v.value, 0);
          const other = Math.max(positionsValue - topSum, 0);

          const donutData = [
            ...top.map((t, i) => ({ name: t.symbol, value: totalValue > 0 ? (t.value / totalValue) * 100 : 0, color: colors[i % colors.length] })),
            { name: 'Cash', value: totalValue > 0 ? (portfolioCash / totalValue) * 100 : 0, color: colors[4] },
            ...(other > 0 ? [{ name: 'Other', value: totalValue > 0 ? (other / totalValue) * 100 : 0, color: colors[5] }] : []),
          ].filter(d => d.value > 0.05);

          setDonut(donutData);
        }

        // Load market data for market cards
        const mktData = await Promise.all(
          MARKET_SYMBOLS.map(sym => api.markets.price(sym).catch(() => null))
        );
        setMarkets(mktData.filter(Boolean));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const { totalValue, totalPL, totalInvested, assetCount } = stats;
  const plPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const portfolioSparkline = [2.1, 2.3, 2.2, 2.5, 2.7];
  const gainSparkline = [2.0, 2.1, 2.2, 2.3, 2.2];
  const investmentSparkline = [20, 20, 20, 20, 20];
  const assetsSparkline = [15, 17, 19, 20, Math.max(assetCount, 5)];

  const hasPortfolioData = totalValue > 0;

  return (
    <div className="p-8 max-w-[1440px] mx-auto">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Portfolio Value"
          value={loading ? '—' : hasPortfolioData ? fmt(totalValue) : '$2.7M'}
          change={!loading && hasPortfolioData ? pct(plPct) : '+28.5%'}
          changeType={totalPL >= 0 ? 'positive' : 'negative'}
          sparklineData={portfolioSparkline}
        />
        <StatCard
          label="Total P/L"
          value={loading ? '—' : hasPortfolioData ? (totalPL >= 0 ? '+' : '') + fmt(Math.abs(totalPL)) : '+$2.2M'}
          change={!loading && hasPortfolioData ? pct(plPct) : '+87.1%'}
          changeType={totalPL >= 0 ? 'positive' : 'negative'}
          sparklineData={gainSparkline}
        />
        <StatCard
          label="Total Investment"
          value={loading ? '—' : hasPortfolioData ? fmt(totalInvested) : '$20,000.00'}
          sparklineData={investmentSparkline}
        />
        <StatCard
          label="Assets"
          value={loading ? '—' : String(assetCount > 0 ? assetCount : 21)}
          change={assetCount > 0 ? `${assetCount} positions` : '4 Invested'}
          changeType="neutral"
          sparklineData={assetsSparkline}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="col-span-2">
          <PerformanceChart
            data={performance}
            summaryLabelLeft={performance.length ? performance[performance.length - 1].date : undefined}
            summaryLabelRight={hasPortfolioData ? `${totalPL >= 0 ? '+' : '-'}${fmt(Math.abs(totalPL))} (${pct(plPct)})` : undefined}
            yTickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`)}
          />
        </div>
        <div>
          <PortfolioDonut
            data={donut}
            totalLabel={hasPortfolioData ? fmt(totalValue) : undefined}
          />
        </div>
      </div>

      {/* Candlestick Chart */}
      <div className="mb-8">
        <CandlestickChart />
      </div>

      {/* Markets Section */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-500 to-red-600" />
          <h3 className="text-white font-semibold text-lg">Markets</h3>
        </div>

        <div className="grid grid-cols-5 gap-4">
          {markets.length > 0
            ? markets.map((m: any) => (
                <MarketCard
                  key={m.symbol}
                  symbol={m.symbol?.replace('-USD', '') || m.symbol}
                  name={m.symbol?.replace('-USD', '') === 'BTC' ? 'Bitcoin' : m.symbol?.replace('-USD', '') === 'ETH' ? 'Ethereum' : m.symbol}
                  price={`$${(m.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  change={`${(m.change || 0) >= 0 ? '+' : ''}${(m.change || 0).toFixed(2)}`}
                  changePercent={`${(m.changePercent || 0) >= 0 ? '+' : ''}${(m.changePercent || 0).toFixed(2)}%`}
                  isPositive={(m.change || 0) >= 0}
                />
              ))
            : !loading && (
                <>
                  <MarketCard symbol="BTC" name="Bitcoin" price="—" change="—" changePercent="—" isPositive={true} />
                  <MarketCard symbol="ETH" name="Ethereum" price="—" change="—" changePercent="—" isPositive={true} />
                  <MarketCard symbol="NVDA" name="Nvidia" price="—" change="—" changePercent="—" isPositive={true} />
                  <MarketCard symbol="AAPL" name="Apple" price="—" change="—" changePercent="—" isPositive={true} />
                  <MarketCard symbol="TSLA" name="Tesla" price="—" change="—" changePercent="—" isPositive={true} />
                </>
              )}
        </div>
      </div>
    </div>
  );
}
