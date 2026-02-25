import { Newspaper, Star, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  timeAgo: string;
  iconGradient: string;
  iconLetter: string;
  url?: string;
}

const GRADIENTS = [
  'from-purple-500 to-pink-600',
  'from-blue-500 to-purple-600',
  'from-purple-600 to-purple-700',
  'from-pink-500 to-purple-600',
  'from-cyan-500 to-blue-600',
  'from-indigo-500 to-purple-600',
  'from-blue-600 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-teal-500 to-blue-600',
  'from-violet-500 to-purple-600',
];

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const MOCK_ARTICLES: NewsArticle[] = [
  { id: '1', title: "Stock market today: Dow drops 900 points as S&P 500, Nasdaq slide on Trump tariff fears", source: 'Yahoo Finance', timeAgo: '1hr ago', iconGradient: 'from-purple-500 to-pink-600', iconLetter: 'Y' },
  { id: '2', title: "S&P 500 futures little changed as market tries to rebound from recent rout", source: 'CNBC', timeAgo: '2hr ago', iconGradient: 'from-blue-500 to-purple-600', iconLetter: 'C' },
  { id: '3', title: "Stock market today: Dow, S&P 500, Nasdaq futures tick up after AI-fueled sell-off", source: 'Yahoo Finance UK', timeAgo: '3hr ago', iconGradient: 'from-purple-600 to-purple-700', iconLetter: 'Y' },
  { id: '4', title: "Stock Market Today: Dow, S&P 500 and Nasdaq struggle to rebound from latest AI-disruption selloff", source: 'MarketWatch', timeAgo: '3hr ago', iconGradient: 'from-pink-500 to-purple-600', iconLetter: 'M' },
  { id: '5', title: "Worried About a Stock Market Crash? This Is the Single Best Investing Move You Can Make Right Now.", source: 'The Motley Fool', timeAgo: '2d ago', iconGradient: 'from-pink-500 to-purple-600', iconLetter: 'M' },
];

export function News() {
  const [activeTab, setActiveTab] = useState<'picked' | 'myStocks' | 'search'>('picked');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    api.markets.news()
      .then((data: any) => {
        // API returns { query, items: [...] }
        const items = Array.isArray(data) ? data : (data?.items || []);
        if (items.length > 0) {
          setArticles(items.map((a: any, i: number) => ({
            id: String(a.id || i),
            title: decodeHtmlEntities(a.title || a.headline || '—'),
            source: a.source || a.publisher || '—',
            timeAgo: a.timeAgo || '—',
            iconGradient: GRADIENTS[i % GRADIENTS.length],
            iconLetter: (a.source || a.publisher || 'N')[0]?.toUpperCase() || 'N',
            url: a.link || a.url,
          })));
        } else {
          setArticles(MOCK_ARTICLES);
        }
      })
      .catch(() => setArticles(MOCK_ARTICLES))
      .finally(() => setLoading(false));
  }, []);

  const displayed = activeTab === 'search' && searchQuery
    ? articles.filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.source.toLowerCase().includes(searchQuery.toLowerCase()))
    : articles;

  return (
    <div className="p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Newspaper className="w-6 h-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-white">Market News</h2>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 mb-6">
        {(['picked', 'myStocks', 'search'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
              activeTab === tab
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {tab === 'picked' && <Star className="w-4 h-4" />}
            {tab === 'search' && <Search className="w-4 h-4" />}
            {tab === 'picked' ? 'Picked' : tab === 'myStocks' ? 'My Stocks' : 'Search'}
          </button>
        ))}
      </div>

      {activeTab === 'search' && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search news..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#1a1d29] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors text-sm"
              autoFocus
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading news...</div>
      ) : (
        <div className="space-y-3">
          {displayed.map((article) => (
            <a
              key={article.id}
              href={article.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-5 hover:border-blue-500/30 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${article.iconGradient} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                  <span className="text-white font-bold text-sm">{article.iconLetter}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium leading-relaxed mb-2 group-hover:text-blue-400 transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{article.source}</span>
                    <span>•</span>
                    <span>{article.timeAgo}</span>
                  </div>
                </div>
              </div>
            </a>
          ))}

          {displayed.length === 0 && (
            <div className="text-center py-12 text-gray-500">No articles found</div>
          )}
        </div>
      )}
    </div>
  );
}
