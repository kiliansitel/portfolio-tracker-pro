interface Props {
  marketState?: string;
  size?: 'xs' | 'sm';
}

export function MarketStateBadge({ marketState, size = 'xs' }: Props) {
  if (!marketState || marketState === 'REGULAR') return null;
  const isPost = marketState === 'POST' || marketState === 'POSTPOST';
  const isPre = marketState === 'PRE';
  if (!isPre && !isPost) return null;

  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`${pad} rounded font-bold leading-none ${
      isPre
        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
        : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
    }`}>
      {isPre ? 'PM' : 'AH'}
    </span>
  );
}
