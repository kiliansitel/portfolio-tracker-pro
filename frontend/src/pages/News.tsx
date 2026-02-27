import { Newspaper, Star, Search, Clock } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  timeAgo: string;
  pubDateMs: number;
  iconGradient: string;
  iconLetter: string;
  url?: string;
  faviconUrl: string;
}

const GRADIENTS = [
  'from-purple-500 to-pink-600',  'from-blue-500 to-purple-600',
  'from-purple-600 to-purple-700','from-pink-500 to-purple-600',
  'from-cyan-500 to-blue-600',    'from-indigo-500 to-purple-600',
  'from-blue-600 to-purple-600',  'from-rose-500 to-pink-600',
  'from-teal-500 to-blue-600',    'from-violet-500 to-purple-600',
];

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Map well-known source names to their actual domains for accurate favicons
const SOURCE_DOMAIN_MAP: Record<string, string> = {
  'yahoo finance': 'finance.yahoo.com',
  'yahoo': 'finance.yahoo.com',
  'cnbc': 'cnbc.com',
  'bloomberg': 'bloomberg.com',
  'reuters': 'reuters.com',
  'the motley fool': 'fool.com',
  'motley fool': 'fool.com',
  'barron\'s': 'barrons.com',
  'barrons': 'barrons.com',
  'marketwatch': 'marketwatch.com',
  'seeking alpha': 'seekingalpha.com',
  'investing.com': 'investing.com',
  'nasdaq': 'nasdaq.com',
  'tipranks': 'tipranks.com',
  'investor\'s business daily': 'investors.com',
  'investors.com': 'investors.com',
  'benzinga': 'benzinga.com',
  'thestreet': 'thestreet.com',
  'financial times': 'ft.com',
  'wall street journal': 'wsj.com',
  'wsj': 'wsj.com',
  'fortune': 'fortune.com',
  'forbes': 'forbes.com',
  'business insider': 'businessinsider.com',
  'techcrunch': 'techcrunch.com',
  'coindesk': 'coindesk.com',
  'cointelegraph': 'cointelegraph.com',
};

function faviconUrl(url: string, source: string): string {
  const sourceKey = source.toLowerCase().trim();
  const domain = SOURCE_DOMAIN_MAP[sourceKey] ||
    (() => { try { const h = new URL(url).hostname.replace(/^www\./, ''); return h === 'news.google.com' ? '' : h; } catch { return ''; } })() ||
    '';
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
}

function mapArticle(a: any, i: number): NewsArticle {
  const url = a.link || a.url || '';
  const source = a.source || a.publisher || '—';
  const pubMs = a.pubDate ? new Date(a.pubDate).getTime() : (a.pubDateMs || 0);
  return {
    id: String(a.id || i),
    title: decodeHtmlEntities(a.title || a.headline || '—'),
    source,
    timeAgo: a.timeAgo || a.pubDate || '—',
    pubDateMs: isNaN(pubMs) ? 0 : pubMs,
    iconGradient: GRADIENTS[i % GRADIENTS.length],
    iconLetter: source[0]?.toUpperCase() || 'N',
    url,
    faviconUrl: faviconUrl(url, source),
  };
}

function dedup(items: NewsArticle[]): NewsArticle[] {
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();
  return items.filter(a => {
    const titleKey = a.title.toLowerCase().slice(0, 80);
    const urlKey = a.url || '';
    if ((urlKey && seenUrls.has(urlKey)) || seenTitles.has(titleKey)) return false;
    seenTitles.add(titleKey);
    if (urlKey) seenUrls.add(urlKey);
    return true;
  });
}

const MOCK_ARTICLES: NewsArticle[] = [
  { id: '1', title: "Stock market today: Dow drops 900 points as S&P 500, Nasdaq slide on Trump tariff fears", source: 'Yahoo Finance', timeAgo: '1hr ago', pubDateMs: Date.now() - 3600000, iconGradient: GRADIENTS[0], iconLetter: 'Y', faviconUrl: 'https://www.google.com/s2/favicons?domain=finance.yahoo.com&sz=64' },
  { id: '2', title: "S&P 500 futures little changed as market tries to rebound from recent rout", source: 'CNBC', timeAgo: '2hr ago', pubDateMs: Date.now() - 7200000, iconGradient: GRADIENTS[1], iconLetter: 'C', faviconUrl: 'https://www.google.com/s2/favicons?domain=cnbc.com&sz=64' },
];

export function News() {
  const [activeTab, setActiveTab] = useState<'picked' | 'myStocks' | 'search'>('picked');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [faviconErrors, setFaviconErrors] = useState<Set<string>>(new Set());

  const loadNews = useCallback((symbolOrQuery?: string) => {
    setLoading(true);
    const endpoint = symbolOrQuery
      ? `/news?${symbolOrQuery.startsWith('__q__') ? `query=${encodeURIComponent(symbolOrQuery.slice(5))}` : `symbol=${encodeURIComponent(symbolOrQuery)}`}`
      : '/news';
    // Use api.request via markets.news() or direct fetch for custom params
    (symbolOrQuery
      ? fetch(`/api${endpoint}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }).then(r => r.json())
      : api.markets.news()
    )
      .then((data: any) => {
        const raw = Array.isArray(data) ? data : (data?.items || []);
        const mapped = raw.map(mapArticle);
        const deduped = dedup(mapped);
        // Sort by pubDate descending (most recent first)
        deduped.sort((a, b) => b.pubDateMs - a.pubDateMs);
        setArticles(deduped.length ? deduped : MOCK_ARTICLES);
      })
      .catch(() => setArticles(MOCK_ARTICLES))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  const handleFaviconError = (id: string) => {
    setFaviconErrors(prev => new Set([...prev, id]));
  };

  const displayed = activeTab === 'search' && searchQuery
    ? articles.filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.source.toLowerCase().includes(searchQuery.toLowerCase()))
    : articles;

  return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Newspaper className="w-6 h-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-white">Market News</h2>
        {!loading && <span className="text-gray-600 text-sm ml-auto">{displayed.length} articles</span>}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        {(['picked', 'myStocks', 'search'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
              activeTab === tab
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}>
            {tab === 'picked' && <Star className="w-4 h-4" />}
            {tab === 'search' && <Search className="w-4 h-4" />}
            {tab === 'picked' ? 'Top Stories' : tab === 'myStocks' ? 'My Stocks' : 'Search'}
          </button>
        ))}
      </div>

      {activeTab === 'search' && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search news..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} autoFocus
              className="w-full pl-10 pr-4 py-3 bg-[#1a1d29] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors text-sm" />
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-5 animate-pulse">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-white/5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/5 rounded w-3/4" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5">
          <div className="text-4xl mb-3">📰</div>
          <div className="text-gray-400 font-medium mb-1">No news found</div>
          <div className="text-gray-600 text-sm">Try a different search term</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayed.map((article) => {
            const showFavicon = article.faviconUrl && !faviconErrors.has(article.id);
            return (
              <a key={article.id} href={article.url || '#'} target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-4 bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-4 sm:p-5 hover:border-blue-500/30 transition-all group">
                {/* Source icon */}
                <div className="flex-shrink-0">
                  {showFavicon ? (
                    <img src={article.faviconUrl} alt={article.source} loading="lazy" width={40} height={40}
                      className="w-10 h-10 rounded-lg object-cover bg-white/5"
                      onError={() => handleFaviconError(article.id)} />
                  ) : (
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${article.iconGradient} flex items-center justify-center shadow-lg`}>
                      <span className="text-white font-bold text-sm">{article.iconLetter}</span>
                    </div>
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-sm font-medium leading-snug mb-2 group-hover:text-blue-400 transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-400">{article.source}</span>
                    <span>·</span>
                    <Clock className="w-3 h-3" />
                    <span>{article.timeAgo}</span>
                  </div>
                </div>
              </a>
            );
          })}
          {/* Extra bottom spacer so last card never sits under bottom nav */}
          <div className="h-24" />
        </div>
      )}
    </div>
  );
}
