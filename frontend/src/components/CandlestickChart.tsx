/**
 * CandlestickChart — TradingView Lightweight Charts v5
 * Exact TradingView look: dark theme, green/red candles, volume bars, RSI panel.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Maximize2, Minimize2 } from 'lucide-react';
import { api } from '../lib/api';

// ─── Timeframes ──────────────────────────────────────────────────────────────
const TIMEFRAMES: Record<string, { range: string; interval: string; label: string }> = {
  '1D':  { range: '1d',   interval: '5m',  label: '1D'  },
  '5D':  { range: '5d',   interval: '15m', label: '5D'  },
  '1M':  { range: '1mo',  interval: '1d',  label: '1M'  },
  '3M':  { range: '3mo',  interval: '1d',  label: '3M'  },
  'YTD': { range: 'ytd',  interval: '1d',  label: 'YTD' },
  '1Y':  { range: '1y',   interval: '1wk', label: '1Y'  },
  '5Y':  { range: '5y',   interval: '1mo', label: '5Y'  },
  'All': { range: 'max',  interval: '1mo', label: 'All' },
};

// ─── OHLCV ───────────────────────────────────────────────────────────────────
interface OHLCV {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

function parseYahooChart(json: any): OHLCV[] {
  try {
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const ts: number[] = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    return ts.map((t, i) => ({
      time: t,
      open:   +((q.open?.[i]   ?? 0).toFixed(4)),
      high:   +((q.high?.[i]   ?? 0).toFixed(4)),
      low:    +((q.low?.[i]    ?? 0).toFixed(4)),
      close:  +((q.close?.[i]  ?? 0).toFixed(4)),
      volume: Math.round(q.volume?.[i] ?? 0),
    })).filter(d => d.close > 0 && d.time > 0);
  } catch { return []; }
}

// ─── Indicators ──────────────────────────────────────────────────────────────
function calcMA(data: OHLCV[], p: number) {
  return data.slice(p - 1).map((_, i) => ({
    time: data[i + p - 1].time as any,
    value: +(data.slice(i, i + p).reduce((s, d) => s + d.close, 0) / p).toFixed(4),
  }));
}

function calcRSI(data: OHLCV[], p = 14) {
  if (data.length < p + 1) return [];
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) {
    const d = data[i].close - data[i - 1].close;
    if (d > 0) ag += d; else al += Math.abs(d);
  }
  ag /= p; al /= p;
  return data.slice(p).map((_, i) => {
    const idx = i + p;
    const d = data[idx].close - data[idx - 1].close;
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? Math.abs(d) : 0)) / p;
    const rs = al === 0 ? 100 : ag / al;
    return { time: data[idx].time as any, value: +(100 - 100 / (1 + rs)).toFixed(2) };
  });
}

// ─── Dark TradingView-style chart options ─────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseChartOpts: any = {
  layout: {
    background:  { color: '#131722' },
    textColor:   '#9598A1',
    fontSize:    12,
    fontFamily:  "'Inter', -apple-system, sans-serif",
  },
  grid: {
    vertLines: { color: '#1e222d' },
    horzLines: { color: '#1e222d' },
  },
  crosshair: {
    vertLine: { color: '#758696', width: 1, style: 1, visible: true, labelVisible: true },
    horzLine: { color: '#758696', width: 1, style: 1, visible: true, labelVisible: true },
  },
  rightPriceScale: { borderColor: '#2a2e39' },
  timeScale: {
    borderColor:    '#2a2e39',
    timeVisible:    true,
    secondsVisible: false,
  },
};

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'BTC-USD', 'ETH-USD'];

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { initialSymbol?: string; compact?: boolean; }

export function CandlestickChart({ initialSymbol, compact = false }: Props) {
  const [symbol, setSymbol]       = useState(initialSymbol || 'SPY');
  const [tf, setTf]               = useState('3M');
  const [chartType, setChartType] = useState<'candle' | 'area'>('candle');
  const [showMA20,  setShowMA20]  = useState(false);
  const [showMA50,  setShowMA50]  = useState(false);
  const [showMA200, setShowMA200] = useState(false);
  const [showRSI,   setShowRSI]   = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [searchQ, setSearchQ]     = useState('');
  const [searchRes, setSearchRes] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [info, setInfo]           = useState<{ price?: number; change?: number; changePct?: number; name?: string } | null>(null);

  const mainRef      = useRef<HTMLDivElement>(null);
  const volumeRef    = useRef<HTMLDivElement>(null);
  const rsiRef       = useRef<HTMLDivElement>(null);
  const chartObj     = useRef<any>(null);
  const volChart     = useRef<any>(null);
  const rsiChart     = useRef<any>(null);
  const mainSeries   = useRef<any>(null);
  const volSeries    = useRef<any>(null);
  const ma20s        = useRef<any>(null);
  const ma50s        = useRef<any>(null);
  const ma200s       = useRef<any>(null);
  const rsiLine      = useRef<any>(null);
  const rawData      = useRef<OHLCV[]>([]);
  const searchTimer  = useRef<any>(null);
  const roMain       = useRef<ResizeObserver | null>(null);
  const roVol        = useRef<ResizeObserver | null>(null);
  const roRsi        = useRef<ResizeObserver | null>(null);

  // ── Init/destroy charts ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current) return;

    import('lightweight-charts').then(lc => {
      // Destroy old
      if (chartObj.current) { try { chartObj.current.remove(); } catch {} }
      if (volChart.current) { try { volChart.current.remove();  } catch {} }
      if (rsiChart.current) { try { rsiChart.current.remove();  } catch {} }

      const mainH   = compact ? 220 : 360;
      const volH    = compact ? 0   : 72;
      const rsiH    = showRSI && !compact ? 110 : 0;

      // ── Main chart ────────────────────────────────────────────────────────
      const mc = lc.createChart(mainRef.current!, {
        ...baseChartOpts,
        width:  mainRef.current!.clientWidth,
        height: mainH,
      });
      chartObj.current = mc;

      // ── Volume chart (below main, no time axis)
      if (volumeRef.current && volH > 0) {
        const vc = lc.createChart(volumeRef.current, {
          ...baseChartOpts,
          width:  volumeRef.current.clientWidth,
          height: volH,
          timeScale: { visible: false },
          rightPriceScale: {
            borderColor: '#2a2e39',
            minimumWidth: 60,
          },
        } as any);
        volChart.current = vc;
      }

      // ── RSI chart (below volume)
      if (rsiRef.current && rsiH > 0) {
        const rc = lc.createChart(rsiRef.current, {
          ...baseChartOpts,
          width:  rsiRef.current.clientWidth,
          height: rsiH,
          rightPriceScale: { ...baseChartOpts.rightPriceScale, minimumWidth: 60 },
        });
        rsiChart.current = rc;
      }

      // ── ResizeObservers ────────────────────────────────────────────────────
      const observeWith = (ro: ResizeObserver | null, el: HTMLElement | null, chart: any) => {
        if (!el || !chart) return ro;
        const newRO = new ResizeObserver(es => chart.resize(es[0].contentRect.width, chart.options().height));
        newRO.observe(el);
        return newRO;
      };
      roMain.current = observeWith(roMain.current, mainRef.current, mc);
      roVol.current  = observeWith(roVol.current,  volumeRef.current, volChart.current);
      roRsi.current  = observeWith(roRsi.current,  rsiRef.current,    rsiChart.current);

      // Load data after init
      loadData(lc);
    });

    return () => {
      roMain.current?.disconnect();
      roVol.current?.disconnect();
      roRsi.current?.disconnect();
      try { chartObj.current?.remove(); } catch {}
      try { volChart.current?.remove(); } catch {}
      try { rsiChart.current?.remove(); } catch {}
      chartObj.current = volChart.current = rsiChart.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, showRSI, fullscreen]);

  // ── Load data when symbol/tf/chartType/MAs change ─────────────────────────
  const loadData = useCallback(async (lc?: any) => {
    if (!chartObj.current) return;
    setLoading(true);
    try {
      const { range, interval } = TIMEFRAMES[tf];
      const json = await api.markets.chart(symbol, `${range}&interval=${encodeURIComponent(interval)}`);
      const data = parseYahooChart(json);
      if (!data.length) { setLoading(false); return; }
      rawData.current = data;

      const last    = data[data.length - 1];
      const prev    = data[data.length - 2];
      const chg     = prev ? last.close - prev.close : 0;
      const chgPct  = prev ? (chg / prev.close) * 100 : 0;

      // Try to get name from search results
      const name = searchRes.find((r: any) => r.symbol === symbol)?.name || symbol;
      setInfo({ price: last.close, change: chg, changePct: chgPct, name });

      const lcMod = lc || await import('lightweight-charts');
      const { CandlestickSeries, AreaSeries, HistogramSeries, LineSeries } = lcMod;
      const mc = chartObj.current;
      if (!mc) return;

      // ── Clear old series ──────────────────────────────────────────────────
      if (mainSeries.current) { try { mc.removeSeries(mainSeries.current); } catch {} mainSeries.current = null; }
      if (ma20s.current)      { try { mc.removeSeries(ma20s.current);       } catch {} ma20s.current = null; }
      if (ma50s.current)      { try { mc.removeSeries(ma50s.current);       } catch {} ma50s.current = null; }
      if (ma200s.current)     { try { mc.removeSeries(ma200s.current);      } catch {} ma200s.current = null; }
      if (volSeries.current && volChart.current) { try { volChart.current.removeSeries(volSeries.current); } catch {} volSeries.current = null; }
      if (rsiLine.current && rsiChart.current)   { try { rsiChart.current.removeSeries(rsiLine.current);   } catch {} rsiLine.current = null; }

      // ── Main series ───────────────────────────────────────────────────────
      if (chartType === 'candle') {
        const cs = mc.addSeries(CandlestickSeries, {
          upColor:         '#26a69a',
          downColor:       '#ef5350',
          borderUpColor:   '#26a69a',
          borderDownColor: '#ef5350',
          wickUpColor:     '#26a69a',
          wickDownColor:   '#ef5350',
        });
        cs.setData(data.map(d => ({ time: d.time as any, open: d.open, high: d.high, low: d.low, close: d.close })));
        mainSeries.current = cs;
      } else {
        const as = mc.addSeries(AreaSeries, {
          lineColor:   '#2962ff',
          topColor:    'rgba(41,98,255,0.28)',
          bottomColor: 'rgba(41,98,255,0.0)',
          lineWidth:   2,
        });
        as.setData(data.map(d => ({ time: d.time as any, value: d.close })));
        mainSeries.current = as;
      }

      // ── MA overlays ────────────────────────────────────────────────────────
      const addMA = (period: number, color: string) => {
        if (data.length < period) return null;
        const s = mc.addSeries(LineSeries, {
          color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(calcMA(data, period));
        return s;
      };
      if (showMA20)  ma20s.current  = addMA(20,  '#2962ff');
      if (showMA50)  ma50s.current  = addMA(50,  '#ff9800');
      if (showMA200) ma200s.current = addMA(200, '#e040fb');

      // ── Volume ─────────────────────────────────────────────────────────────
      if (volChart.current) {
        const vs = volChart.current.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });
        vs.setData(data.map(d => ({
          time:  d.time as any,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
        })));
        volSeries.current = vs;
        // Sync time scale
        mc.timeScale().subscribeVisibleLogicalRangeChange((r: any) => {
          if (r && volChart.current) volChart.current.timeScale().setVisibleLogicalRange(r);
        });
        volChart.current.timeScale().subscribeVisibleLogicalRangeChange((r: any) => {
          if (r && mc) mc.timeScale().setVisibleLogicalRange(r);
        });
      }

      // ── RSI ──────────────────────────────────────────────────────────────
      if (rsiChart.current) {
        const rsiData = calcRSI(data);
        if (rsiData.length) {
          const rs = rsiChart.current.addSeries(AreaSeries, {
            lineColor:   '#7b1fa2',
            topColor:    'rgba(123,31,162,0.3)',
            bottomColor: 'rgba(123,31,162,0)',
            lineWidth:   1,
          });
          rs.setData(rsiData);
          rsiLine.current = rs;

          // OB/OS lines
          const ob = rsiChart.current.addSeries(lcMod.LineSeries, { color: 'rgba(239,83,80,0.6)', lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
          ob.setData(rsiData.map((d: any) => ({ time: d.time, value: 70 })));
          const os = rsiChart.current.addSeries(lcMod.LineSeries, { color: 'rgba(38,166,154,0.6)', lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
          os.setData(rsiData.map((d: any) => ({ time: d.time, value: 30 })));

          // Sync time
          mc.timeScale().subscribeVisibleLogicalRangeChange((r: any) => {
            if (r && rsiChart.current) rsiChart.current.timeScale().setVisibleLogicalRange(r);
          });
        }
      }

      mc.timeScale().fitContent();
      if (volChart.current) volChart.current.timeScale().fitContent();
      if (rsiChart.current) rsiChart.current.timeScale().fitContent();

    } catch (e) {
      console.error('chart load error', e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, chartType, showMA20, showMA50, showMA200]);

  // Reload on dependency change
  useEffect(() => {
    if (chartObj.current) loadData();
  }, [loadData]);

  // ── Symbol search ──────────────────────────────────────────────────────────
  const handleSearch = (q: string) => {
    setSearchQ(q);
    setSearchOpen(true);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchRes([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.tickers.search(q);
        setSearchRes(Array.isArray(res) ? res.slice(0, 8) : []);
      } catch { setSearchRes([]); }
    }, 300);
  };

  const pickSymbol = (s: string) => {
    setSymbol(s);
    setSearchQ('');
    setSearchRes([]);
    setSearchOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const isUp = (info?.change ?? 0) >= 0;

  const chartWrapper = (
    <div className={`flex flex-col bg-[#131722] ${fullscreen ? 'fixed inset-0 z-[9999] rounded-none' : 'rounded-xl'} overflow-hidden`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 flex flex-col sm:flex-row sm:items-start gap-3 border-b border-[#2a2e39]">
        {/* Ticker info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-bold text-xl">{symbol}</span>
            {info?.name && info.name !== symbol && (
              <span className="text-[#9598a1] text-sm">{info.name}</span>
            )}
          </div>
          {info?.price && (
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-white font-bold text-2xl">{info.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
              <span className={`text-sm font-semibold ${isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                {isUp ? '+' : ''}{info.change?.toFixed(2)} ({isUp ? '+' : ''}{info.changePct?.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 items-end">
          {/* Search */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded-lg">
              <Search className="w-3.5 h-3.5 text-[#9598a1]" />
              <input value={searchQ} onChange={e => handleSearch(e.target.value)} onFocus={() => setSearchOpen(true)}
                placeholder="Symbol..." className="bg-transparent text-white placeholder-[#4c525e] outline-none text-sm w-24" />
            </div>
            {searchOpen && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl z-50 overflow-hidden">
                {(searchRes.length > 0 ? searchRes : DEFAULT_SYMBOLS.map(s => ({ symbol: s, name: '' }))).map((r: any) => (
                  <button key={r.symbol} onClick={() => pickSymbol(r.symbol)}
                    className="w-full px-3 py-2 text-left hover:bg-[#2a2e39] transition-colors flex items-center gap-2">
                    <span className="text-white font-bold text-sm">{r.symbol}</span>
                    {r.name && <span className="text-[#9598a1] text-xs truncate">{r.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Overlays row */}
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {[
              { label: 'MA20',  active: showMA20,  toggle: () => setShowMA20(v => !v),  color: '#2962ff' },
              { label: 'MA50',  active: showMA50,  toggle: () => setShowMA50(v => !v),  color: '#ff9800' },
              { label: 'MA200', active: showMA200, toggle: () => setShowMA200(v => !v), color: '#e040fb' },
              { label: 'RSI',   active: showRSI,   toggle: () => setShowRSI(v => !v),   color: '#7b1fa2' },
            ].map(({ label, active, toggle, color }) => (
              <button key={label} onClick={toggle}
                className="px-2 py-0.5 rounded text-xs font-medium border transition-colors"
                style={active
                  ? { background: `${color}25`, borderColor: `${color}80`, color }
                  : { background: 'transparent', borderColor: '#2a2e39', color: '#4c525e' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Timeframe bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e222d] gap-2">
        {/* TF buttons */}
        <div className="flex items-center gap-0 overflow-x-auto no-scrollbar">
          {Object.entries(TIMEFRAMES).map(([key]) => (
            <button key={key} onClick={() => setTf(key)}
              className={`px-2.5 sm:px-3 py-1 text-xs font-medium transition-colors rounded whitespace-nowrap ${
                tf === key
                  ? 'bg-[#2a2e39] text-white'
                  : 'text-[#9598a1] hover:text-white hover:bg-[#1e222d]'
              }`}>
              {key}
            </button>
          ))}
        </div>

        {/* Chart type + Fullscreen */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setChartType('candle')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${chartType === 'candle' ? 'bg-[#2a2e39] text-white' : 'text-[#4c525e] hover:text-white'}`}>
            🕯
          </button>
          <button onClick={() => setChartType('area')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${chartType === 'area' ? 'bg-[#2a2e39] text-white' : 'text-[#4c525e] hover:text-white'}`}>
            📈
          </button>
          {!compact && (
            <button onClick={() => setFullscreen(v => !v)} className="p-1.5 rounded text-[#4c525e] hover:text-white hover:bg-[#2a2e39] transition-colors ml-1">
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden" onClick={() => searchOpen && setSearchOpen(false)}>
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#131722]/80">
            <div className="w-6 h-6 border-2 border-[#2962ff]/30 border-t-[#2962ff] rounded-full animate-spin" />
          </div>
        )}
        {/* Main candle/area */}
        <div ref={mainRef} className="w-full" />
        {/* Volume */}
        {!compact && <div ref={volumeRef} className="w-full border-t border-[#1e222d]" />}
        {/* RSI */}
        {showRSI && !compact && (
          <div className="border-t border-[#1e222d]">
            <div className="flex items-center gap-2 px-3 py-1">
              <span className="text-[#7b1fa2] text-xs font-medium">RSI(14)</span>
              <span className="text-[#4c525e] text-xs">≥70 overbought · ≤30 oversold</span>
            </div>
            <div ref={rsiRef} className="w-full" />
          </div>
        )}
      </div>
    </div>
  );

  if (compact) {
    return <div className="h-[280px] overflow-hidden rounded-xl">{chartWrapper}</div>;
  }
  return chartWrapper;
}
