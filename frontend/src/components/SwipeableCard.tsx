/**
 * SwipeableCard — swipe left to reveal Edit + Delete buttons on mobile.
 * On desktop/non-touch: renders children normally.
 */
import { useState, useRef, ReactNode } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Edit2, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Width of action buttons revealed on swipe left (default 140px) */
  revealWidth?: number;
  disabled?: boolean;
}

export function SwipeableCard({ children, onEdit, onDelete, revealWidth = 130, disabled = false }: Props) {
  const [offset, setOffset] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const isTouch = useRef(false);

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (disabled) return;
      setOffset(-revealWidth);
      setSwiped(true);
    },
    onSwipedRight: () => {
      setOffset(0);
      setSwiped(false);
    },
    onSwiping: ({ deltaX }) => {
      if (disabled) return;
      if (deltaX < 0) setOffset(Math.max(deltaX, -revealWidth));
      else if (swiped) setOffset(Math.min(0, -revealWidth + deltaX));
    },
    onTouchStartOrOnMouseDown: () => { isTouch.current = true; },
    trackMouse: false,
    trackTouch: true,
    preventScrollOnSwipe: false,
    delta: 10,
  });

  const reset = () => { setOffset(0); setSwiped(false); };

  return (
    <div className="relative overflow-hidden" style={{ touchAction: 'pan-y' }}>
      {/* Action buttons underneath */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center gap-1 px-3"
        style={{ width: revealWidth }}
      >
        {onEdit && (
          <button
            onClick={() => { reset(); onEdit(); }}
            className="flex-1 h-full flex flex-col items-center justify-center gap-1 bg-blue-500/90 hover:bg-blue-500 rounded-lg text-white transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            <span className="text-xs">Edit</span>
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => { reset(); onDelete(); }}
            className="flex-1 h-full flex flex-col items-center justify-center gap-1 bg-red-500/90 hover:bg-red-500 rounded-lg text-white transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-xs">Delete</span>
          </button>
        )}
      </div>

      {/* Swipeable content */}
      <div
        {...handlers}
        style={{ transform: `translateX(${offset}px)`, transition: offset === 0 || offset === -revealWidth ? 'transform 0.2s ease' : 'none' }}
        className="relative bg-[#0d0f14] z-10"
        onClick={(e) => { if (swiped) { e.stopPropagation(); reset(); } }}
      >
        {children}
      </div>
    </div>
  );
}
