/**
 * GlobalSearch — Cmd+K command palette for global symbol/page search.
 * Shows real-time Yahoo Finance ticker results + quick nav to pages.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, X } from 'lucide-react';
import { api } from '../lib/api';

interface Ticker { symbol: string; name: string; exchange?: string; type?: string; }

const QUICK_LINKS = [
  { label: 'Dashboard', path: '/', icon: '📊' },
  { label: 'Positions', path: '/positions', icon: '📈' },
  { label: 'Watchlist', path: '/watchlist', icon: '👁' },
  { label: 'Oracle AI', path: '/oracle', icon: '🤖' },
  { label: 'Alerts', path: '/alerts', icon: '🔔' },
  { label: 'News', path: '/news', icon: '📰' },
  { label: 'Settings', path: '/settings', icon: '⚙️' },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd/Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); setQuery(''); setResults([]); setSelectedIdx(0); }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await api.tickers.search(q);
      setResults(Array.isArray(data) ? data.slice(0, 8) : []);
      setSelectedIdx(0);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const allItems = query.trim()
    ? results.map(r => ({ label: r.symbol, sub: r.name, action: () => navigate(`/watchlist?add=${r.symbol}`) }))
    : QUICK_LINKS.map(l => ({ label: l.label, sub: l.path, icon: l.icon, action: () => navigate(l.path) }));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, allItems.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && allItems[selectedIdx]) { allItems[selectedIdx].action(); setOpen(false); }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-gray-500 hover:text-gray-300 text-sm transition-colors"
      title="Global Search (Ctrl+K)">
      <Search className="w-4 h-4" />
      <span className="hidden sm:inline text-xs">Search</span>
      <kbd className="hidden sm:inline-flex px-1.5 py-0.5 bg-white/5 rounded text-xs text-gray-600">⌘K</kbd>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 sm:pt-24 px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg bg-[#1a1d29] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search symbols, pages…"
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-base"
          />
          {loading && <div className="w-4 h-4 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />}
          <button onClick={() => setOpen(false)} className="p-1 text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-2">
          {allItems.length === 0 && query.trim() && !loading && (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">No results for "{query}"</div>
          )}
          {!query.trim() && (
            <div className="px-4 pt-2 pb-1 text-gray-600 text-xs uppercase tracking-wider">Quick Navigation</div>
          )}
          {allItems.map((item, i) => (
            <button key={i} onClick={() => { item.action(); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${i === selectedIdx ? 'bg-blue-500/10 text-white' : 'text-gray-300 hover:bg-white/5'}`}>
              {(item as any).icon && <span className="text-lg">{(item as any).icon}</span>}
              {!(item as any).icon && (
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {(item.label || '?')[0]}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-medium text-sm">{item.label}</div>
                <div className="text-gray-500 text-xs truncate">{item.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="border-t border-white/5 px-4 py-2 flex items-center gap-4 text-gray-600 text-xs">
          <span><kbd className="px-1.5 py-0.5 bg-white/5 rounded text-xs">↑↓</kbd> navigate</span>
          <span><kbd className="px-1.5 py-0.5 bg-white/5 rounded text-xs">Enter</kbd> select</span>
          <span><kbd className="px-1.5 py-0.5 bg-white/5 rounded text-xs">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
