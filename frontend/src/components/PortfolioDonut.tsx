/**
 * PortfolioDonut — custom SVG donut chart, no Recharts dependency.
 * Guaranteed to render correctly.
 */
import { useState } from 'react';
import { Skeleton } from './ui/skeleton';

interface Slice { name: string; value: number; color: string; }

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= 360) endAngle = startAngle + 359.999;
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M${s.x.toFixed(2)},${s.y.toFixed(2)} A${r},${r} 0 ${large},1 ${e.x.toFixed(2)},${e.y.toFixed(2)}`;
}

export function PortfolioDonut({
  data,
  totalLabel,
  loading,
  title = 'Allocation',
}: {
  data?: Slice[];
  totalLabel?: string;
  loading?: boolean;
  title?: string;
} = {}) {
  const [showAll, setShowAll] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const MAX = 5;

  const hasData = Array.isArray(data) && data.length > 0;
  const total = hasData ? data!.reduce((s, d) => s + d.value, 0) : 0;

  const cx = 90, cy = 90, r = 70, inner = 46;
  const gap = 2; // gap between slices in degrees

  let angle = -90;
  const slices = hasData
    ? data!.map(d => {
        const sweep = (d.value / total) * 360 - gap;
        const start = angle;
        angle += (d.value / total) * 360;
        return { ...d, start, end: start + sweep };
      })
    : [];

  return (
    <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl p-4 sm:p-6 border border-white/5 shadow-lg h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-600" />
        <h3 className="text-white font-semibold text-lg">{title}</h3>
      </div>

      {loading ? (
        <div className="space-y-3 flex-1">
          <Skeleton className="h-44 w-44 rounded-full mx-auto bg-white/5" />
          <Skeleton className="h-3 w-full bg-white/5" />
          <Skeleton className="h-3 w-3/4 bg-white/5" />
        </div>
      ) : !hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-sm gap-2">
          <div className="w-16 h-16 rounded-full border-4 border-dashed border-gray-700" />
          No data available
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center">
          {/* SVG Donut */}
          <svg width={180} height={180} viewBox="0 0 180 180">
            {/* Background ring */}
            <circle cx={cx} cy={cy} r={(r + inner) / 2} fill="none"
              stroke="rgba(255,255,255,0.04)" strokeWidth={r - inner} />

            {/* Slices */}
            {slices.map((s, i) => (
              <path
                key={i}
                d={arcPath(cx, cy, (r + inner) / 2, s.start, s.end)}
                fill="none"
                stroke={s.color}
                strokeWidth={r - inner}
                strokeLinecap="butt"
                opacity={hovered === null || hovered === i ? 1 : 0.4}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}

            {/* Center text */}
            {hovered !== null && slices[hovered] ? (
              <>
                <text x={cx} y={cy - 8} textAnchor="middle" fill="white" fontSize={13} fontWeight="bold">{slices[hovered].name}</text>
                <text x={cx} y={cy + 10} textAnchor="middle" fill={slices[hovered].color} fontSize={16} fontWeight="bold">{slices[hovered].value.toFixed(1)}%</text>
              </>
            ) : (
              <>
                <text x={cx} y={cy - 6} textAnchor="middle" fill="#6b7280" fontSize={11}>Total</text>
                <text x={cx} y={cy + 12} textAnchor="middle" fill="white" fontSize={14} fontWeight="bold">{totalLabel || '—'}</text>
              </>
            )}
          </svg>

          {/* Legend */}
          <div className="w-full mt-3 space-y-2">
            {(showAll ? data! : data!.slice(0, MAX)).map((item, i) => (
              <div key={i}
                className="flex items-center justify-between text-sm cursor-pointer"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ opacity: hovered === null || hovered === i ? 1 : 0.5, transition: 'opacity 0.15s' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-gray-400 truncate text-xs">{item.name}</span>
                </div>
                <span className="text-white font-semibold text-xs ml-2 tabular-nums">{item.value.toFixed(1)}%</span>
              </div>
            ))}
            {data!.length > MAX && (
              <button onClick={() => setShowAll(v => !v)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors w-full text-center pt-1">
                {showAll ? '▲ Less' : `▼ +${data!.length - MAX} more`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
