import { useEffect, useState, useRef } from 'react';
import { StatCard } from '../components/StatCard';
import { PerformanceChart } from '../components/PerformanceChart';
import { CandlestickChart } from '../components/CandlestickChart';
import { PortfolioDonut } from '../components/PortfolioDonut';
import { MarketTiles } from '../components/MarketTiles';
import { Skeleton } from '../components/ui/skeleton';
import { api } from '../lib/api';
import { getPrices } from '../lib/priceCache';
import { fmt, pct } from '../lib/format';

function guessAssetClass(symbol: string, type?: string): string {
  if (type === 'crypto' || /(-USD$|-USDT$|-BTC$)/i.test(symbol)) return 'Crypto';
  if (type === 'option') return 'Options';
  if (type === 'bond') return 'Bonds';
  if (type === 'etf') return 'ETF';
  return 'Equities';
}

function guessRegion(symbol: string): string {
  if (/(-USD$|-USDT$|-BTC$|-ETH$)/i.test(symbol)) return 'Crypto/Digital';
  if (/\.(AS|PA|DE|MI|BR|SW|L|OL|ST|HE|CO|LS)$/i.test(symbol)) return 'Europe';
  if (/\.(T|HK|SS|SZ|KS|NS|BO)$/i.test(symbol)) return 'Asia';
  return 'North America';
}

export function Dashboard() {
  const [stats, setStats] = useState({ totalValue: 0, totalPL: 0, totalInvested: 0, assetCount: 0, dailyPL: 0 });
  const [performance, setPerformance] = useState<{ date: string; value: number }[]>([]);
  const [donut, setDonut] = useState<{ name: string; value: number; color: string }[]>([]);
  const [sectorDonut, setSectorDonut] = useState<{ name: string; value: number; color: string }[]>([]);
  const [regionDonut, setRegionDonut] = useState<{ name: string; value: number; color: string }[]>([]);
  const [donutTab, setDonutTab] = useState<'allocation'|'sectors'|'regions'>('allocation');
  const [loading, setLoading] = useState(true);
  const portfolioIdRef = useRef<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const portfolios = await api.portfolio.all().catch(() => []);
        if (portfolios && portfolios[0]?.id) {
          const portfolioId = portfolios[0].id;
          portfolioIdRef.current = portfolioId;
          const portfolioCash = Number(portfolios[0].cash || 0);

          const rawPositions = await api.portfolio.positions(portfolioId).catch(() => []);
          const openPos = Array.isArray(rawPositions)
            ? rawPositions.filter((p: any) => p.status === 'open' || !p.status)
            : [];

          // ── BATCH price fetch (P1-1) ──
          const posSymbols = [...new Set(openPos.map((p: any) => p.symbol as string))] as string[];
          const priceMap = await getPrices(posSymbols);

          // Portfolio stats
          const positionsValue = openPos.reduce(
            (s: number, p: any) => s + (p.quantity || 0) * (priceMap[p.symbol]?.price || 0),
            0
          );
          const totalValue = positionsValue + portfolioCash;
          const totalInvested =
            openPos.reduce((s: number, p: any) => s + (p.quantity || 0) * (p.entry_price || 0), 0) +
            portfolioCash;
          const totalPL = positionsValue - (totalInvested - portfolioCash);
          // Daily P/L = sum of (quantity × priceChange per share) across all positions
          const dailyPL = openPos.reduce(
            (s: number, p: any) => s + (p.quantity || 0) * ((priceMap[p.symbol] as any)?.change || 0),
            0
          );
          setStats({ totalValue, totalPL, totalInvested, assetCount: openPos.length, dailyPL });

          // Performance snapshots — default 1M (30 days) to match initial chart tab
          const perf = await api.portfolio.performance(portfolioId, { days: 30 }).catch(() => null);
          const snaps = perf?.snapshots || [];
          if (Array.isArray(snaps) && snaps.length) {
            setPerformance(
              snaps.map((s: any) => ({
                date: s.date?.slice(5) || s.date,
                value: Number(s.total_value || 0),
              }))
            );
          }

          // Donut allocation — uses batch prices, handles 0-price gracefully
          const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#22c55e', '#06b6d4', '#ec4899', '#a855f7', '#14b8a6'];
          const values = openPos
            .map((p: any) => ({
              symbol: p.symbol,
              value: (p.quantity || 0) * (priceMap[p.symbol]?.price || 0),
            }))
            .sort((a: any, b: any) => b.value - a.value);

          const TOP_N = 8;
          const top = values.slice(0, TOP_N);
          const topSum = top.reduce((s: any, v: any) => s + v.value, 0);
          const other = Math.max(positionsValue - topSum, 0);

          const donutData = [
            ...top.map((t: any, i: number) => ({
              name: t.symbol,
              value: totalValue > 0 ? (t.value / totalValue) * 100 : 0,
              color: colors[i % colors.length],
            })),
            { name: 'Cash', value: totalValue > 0 ? (portfolioCash / totalValue) * 100 : 0, color: '#06b6d4' },
            ...(other > 0.5
              ? [{ name: 'Other', value: totalValue > 0 ? (other / totalValue) * 100 : 0, color: '#6b7280' }]
              : []),
          ].filter((d) => d.value > 0.05);

          setDonut(donutData);

          // Sector grouping (uses sector field from price API or rough guesses)
          const sectorMap: Record<string, number> = {};
          const regionMap: Record<string, number> = {};
          for (const p of openPos) {
            const val = (p.quantity || 0) * (priceMap[p.symbol]?.price || 0);
            if (val <= 0) continue;
            const sector = (priceMap[p.symbol] as any)?.sector || guessAssetClass(p.symbol, p.type);
            sectorMap[sector] = (sectorMap[sector] || 0) + val;
            const region = guessRegion(p.symbol);
            regionMap[region] = (regionMap[region] || 0) + val;
          }
          const mkDonutFromMap = (map: Record<string, number>, cs: string[]) => {
            const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
            return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({
              name, value: (value / total) * 100, color: cs[i % cs.length]
            }));
          };
          const cs2 = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#22c55e','#06b6d4','#ec4899'];
          setSectorDonut(mkDonutFromMap(sectorMap, cs2));
          setRegionDonut(mkDonutFromMap(regionMap, cs2));


        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const TF_DAYS: Record<string, number | undefined> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'All': undefined };
  const loadPerformance = async (tf: string) => {
    if (!portfolioIdRef.current) return;
    const days = TF_DAYS[tf];
    const perf = await api.portfolio.performance(portfolioIdRef.current, days ? { days } : undefined).catch(() => null);
    const snaps = perf?.snapshots || [];
    if (Array.isArray(snaps) && snaps.length) {
      setPerformance(snaps.map((s: any) => ({ date: s.date?.slice(5) || s.date, value: Number(s.total_value || 0) })));
    }
  };

  const { totalValue, totalPL, totalInvested, assetCount, dailyPL } = stats;
  const plPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0; // total return %
  const prevValue = totalValue - dailyPL;
  const dailyPct = prevValue > 0 ? (dailyPL / prevValue) * 100 : 0; // today's % change
  const hasPortfolioData = totalValue > 0;

  const sparklineDummy = [1, 1.1, 1.05, 1.2, 1.15];

  return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto pb-24">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl bg-white/5" />
          ))
        ) : (
          <>
            <StatCard
              label="Portfolio Value (incl. cash)"
              value={hasPortfolioData ? fmt(totalValue) : '$0.00'}
              change={hasPortfolioData
                ? `Today: ${dailyPL >= 0 ? '+' : ''}${fmt(Math.abs(dailyPL))} (${pct(dailyPct)})`
                : undefined}
              changeType={dailyPL >= 0 ? 'positive' : 'negative'}
              sparklineData={sparklineDummy}
            />
            <StatCard
              label="Total P/L (vs. cost)"
              value={hasPortfolioData ? (totalPL >= 0 ? '+' : '') + fmt(Math.abs(totalPL)) : '$0.00'}
              change={hasPortfolioData && totalInvested > 0 ? `Return: ${pct(plPct)}` : undefined}
              changeType={totalPL >= 0 ? 'positive' : 'negative'}
              sparklineData={sparklineDummy}
            />
            <StatCard
              label="Total Invested"
              value={hasPortfolioData ? fmt(totalInvested) : '$0.00'}
              sparklineData={sparklineDummy}
            />
            <StatCard
              label="Open Positions"
              value={String(assetCount)}
              change={assetCount > 0 ? `${assetCount} positions` : 'No positions yet'}
              changeType="neutral"
              sparklineData={sparklineDummy}
            />
          </>
        )}
      </div>

      {/* Pinnable Market Tiles */}
      <MarketTiles />

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <PerformanceChart
            data={performance}
            summaryLabelLeft={performance.length ? performance[performance.length - 1].date : undefined}
            summaryLabelRight={
              hasPortfolioData
                ? `${totalPL >= 0 ? '+' : '-'}${fmt(Math.abs(totalPL))} (${pct(plPct)})`
                : undefined
            }
            yTickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`)}
            onTimeframeChange={loadPerformance}
          />
        </div>
        <div>
          {/* Allocation tabs */}
          <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10 mb-3">
            {(['allocation','sectors','regions'] as const).map(t => (
              <button key={t} onClick={() => setDonutTab(t)}
                className={`flex-1 py-1.5 rounded text-xs font-medium capitalize transition-all ${donutTab === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'allocation' ? '🥧 Alloc' : t === 'sectors' ? '🏭 Sectors' : '🌍 Regions'}
              </button>
            ))}
          </div>
          <PortfolioDonut
            data={donutTab === 'allocation' ? donut : donutTab === 'sectors' ? sectorDonut : regionDonut}
            totalLabel={hasPortfolioData ? fmt(totalValue) : undefined}
            loading={loading}
          />
        </div>
      </div>

      {/* Candlestick Chart */}
      <div className="mb-8">
        <CandlestickChart />
      </div>
    </div>
  );
}
