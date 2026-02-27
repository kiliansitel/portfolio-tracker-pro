/**
 * PerformanceChart — custom SVG (no Recharts), guaranteed render.
 * Smooth area chart with auto domain, tooltip, timeframe buttons.
 */
import { useState, useRef, useCallback, useId } from 'react';
import { fmt } from '../lib/format';

const timeframes = ['1D', '1W', '1M', '3M', '1Y', 'All'];

interface DataPoint { date: string; value: number; }

function useLiveTooltip(data: DataPoint[], svgWidth: number, svgHeight: number, paddingLeft: number, paddingRight: number) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; idx: number } | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!data.length || svgWidth <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const chartW = svgWidth - paddingLeft - paddingRight;
    const relX = Math.max(0, Math.min(x - paddingLeft, chartW));
    const idx = Math.round((relX / chartW) * (data.length - 1));
    setTooltip({ x, y: e.clientY - rect.top, idx: Math.max(0, Math.min(idx, data.length - 1)) });
  }, [data, svgWidth, paddingLeft, paddingRight]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);
  return { tooltip, handleMouseMove, handleMouseLeave };
}

export function PerformanceChart({
  data,
  allData,
  summaryLabelLeft,
  summaryLabelRight,
  yTickFormatter,
  onTimeframeChange,
}: {
  data?: DataPoint[];
  allData?: Record<string, DataPoint[]>;
  summaryLabelLeft?: string;
  summaryLabelRight?: string;
  yTickFormatter?: (v: number) => string;
  onTimeframeChange?: (tf: string) => void;
} = {}) {
  const [activeTf, setActiveTf] = useState('1M');
  const [svgWidth, setSvgWidth] = useState(600);
  const gradId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver(entries => {
      setSvgWidth(entries[0].contentRect.width);
    });
    ro.observe(node);
    setSvgWidth(node.clientWidth);
    (containerRef as any).current = node;
  }, []);

  const handleTf = (tf: string) => {
    setActiveTf(tf);
    onTimeframeChange?.(tf);
  };

  const chartData = (allData?.[activeTf] ?? data) || [];
  const tickFmt = yTickFormatter ?? ((v: number) => fmt(v));

  // Chart dimensions
  const H = 220;
  const padT = 10, padB = 24, padL = 56, padR = 32;
  const chartW = Math.max(svgWidth - padL - padR, 10);
  const chartH = H - padT - padB;

  // Compute domain from actual data (not 0)
  const values = chartData.map(d => d.value);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const pad5 = (rawMax - rawMin) * 0.05 || rawMax * 0.05 || 1;
  const minV = rawMin - pad5;
  const maxV = rawMax + pad5;
  const range = maxV - minV;

  const toX = (i: number) => padL + (chartData.length <= 1 ? chartW / 2 : (i / (chartData.length - 1)) * chartW);
  const toY = (v: number) => padT + chartH - ((v - minV) / range) * chartH;

  // Build SVG path
  let pathD = '';
  let areaD = '';
  if (chartData.length > 0) {
    const pts = chartData.map((d, i) => `${toX(i).toFixed(1)},${toY(d.value).toFixed(1)}`);
    pathD = `M${pts.join('L')}`;
    areaD = `M${toX(0).toFixed(1)},${(padT + chartH).toFixed(1)}L${pts.join('L')}L${toX(chartData.length - 1).toFixed(1)},${(padT + chartH).toFixed(1)}Z`;
  }

  // Y-axis ticks (4)
  const yTicks = Array.from({ length: 4 }, (_, i) => minV + (range * i) / 3);

  // X-axis labels (max 5)
  const xLabelIdxs: number[] = [];
  if (chartData.length >= 2) {
    const step = Math.floor((chartData.length - 1) / 4);
    for (let i = 0; i <= 4; i++) xLabelIdxs.push(Math.min(i * step, chartData.length - 1));
  }

  const { tooltip, handleMouseMove, handleMouseLeave } = useLiveTooltip(chartData, svgWidth, H, padL, padR);

  const isPositive = chartData.length >= 2 && chartData[chartData.length - 1].value >= chartData[0].value;
  const lineColor = isPositive ? '#22c55e' : '#ef4444';
  const areaColor = isPositive ? '#22c55e' : '#ef4444';

  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5 shadow-lg">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ background: lineColor }} />
          <h3 className="text-white font-semibold text-lg">Performance</h3>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {timeframes.map(tf => (
            <button key={tf} onClick={() => handleTf(tf)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${activeTf === tf
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={measureRef} className="w-full" style={{ height: H }}>
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-600">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 17l4-4 4 4 4-4M3 21h18" /></svg>
            <span className="text-sm">No performance data yet</span>
            <span className="text-xs text-gray-700">Data builds up as daily snapshots are recorded</span>
          </div>
        ) : (
          <svg width={svgWidth} height={H} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ cursor: 'crosshair' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={areaColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={areaColor} stopOpacity={0.0} />
              </linearGradient>
              <clipPath id={`clip-${gradId}`}>
                <rect x={padL} y={padT} width={chartW} height={chartH} />
              </clipPath>
            </defs>

            {/* Y-axis gridlines + labels */}
            {yTicks.map((v, i) => {
              const y = toY(v);
              return (
                <g key={i}>
                  <line x1={padL} x2={padL + chartW} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                  <text x={padL - 6} y={y + 4} textAnchor="end" fill="#4b5563" fontSize={11}>{tickFmt(v)}</text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {xLabelIdxs.map(idx => (
              <text key={idx} x={toX(idx)} y={H - 4} textAnchor="middle" fill="#4b5563" fontSize={11}>
                {chartData[idx]?.date}
              </text>
            ))}

            {/* Area fill */}
            <path d={areaD} fill={`url(#${gradId})`} clipPath={`url(#clip-${gradId})`} />

            {/* Line */}
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2} clipPath={`url(#clip-${gradId})`} />

            {/* Tooltip crosshair + dot */}
            {tooltip && chartData[tooltip.idx] && (() => {
              const x = toX(tooltip.idx);
              const y = toY(chartData[tooltip.idx].value);
              const tipW = 130, tipH = 44;
              const tipX = Math.min(x + 10, svgWidth - tipW - 4);
              const tipY = Math.max(padT, y - tipH / 2);
              return (
                <g>
                  <line x1={x} x2={x} y1={padT} y2={padT + chartH} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 2" />
                  <circle cx={x} cy={y} r={5} fill={lineColor} stroke="#0d0f14" strokeWidth={2} />
                  <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} fill="#1a1d29" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                  <text x={tipX + 8} y={tipY + 16} fill="#9ca3af" fontSize={11}>{chartData[tooltip.idx].date}</text>
                  <text x={tipX + 8} y={tipY + 33} fill="white" fontWeight="bold" fontSize={13}>{tickFmt(chartData[tooltip.idx].value)}</text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Summary */}
      {(summaryLabelLeft || summaryLabelRight) && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <div className="text-gray-500">{summaryLabelLeft || '—'}</div>
          <div className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{summaryLabelRight || '—'}</div>
        </div>
      )}
    </div>
  );
}
