import { Sparkles, Send, RefreshCw, Bot, User } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-gradient-to-br from-blue-500 to-purple-600'
          : 'bg-gradient-to-br from-purple-500 to-pink-600'
      }`}>
        {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div className={`max-w-[75%] px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-blue-500/30 text-white'
          : 'bg-gradient-to-br from-[#1a1d29] to-[#14161f] border border-white/10 text-gray-200'
      }`}>
        {msg.content}
      </div>
    </div>
  );
}

export function Oracle() {
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'assistant',
    content: 'Hello! I\'m Oracle, your AI financial assistant. Ask me anything about your portfolio, watchlist, or market insights. You can also use the quick actions above.',
    ts: Date.now(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput('');

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: userText,
      ts: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await api.oracle.chat(userText, conversationId);
      const content =
        result?.content ||
        result?.message ||
        result?.response ||
        (typeof result === 'string' ? result : null) ||
        'No response received.';

      if (result?.conversationId) setConversationId(result.conversationId);

      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content,
        ts: Date.now(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `a-err-${Date.now()}`,
        role: 'assistant',
        content: err?.message?.includes('provider') || err?.message?.includes('AI')
          ? 'Oracle is unavailable — please configure an AI provider in Settings.'
          : `Error: ${err?.message || 'Unknown error'}`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome-' + Date.now(),
      role: 'assistant',
      content: 'Chat cleared. How can I help you?',
      ts: Date.now(),
    }]);
    setConversationId(undefined);
  };

  const SUGGESTIONS = [
    { emoji: '📊', text: 'Analyze my portfolio and give me actionable insights.' },
    { emoji: '🏆', text: "What's my best performing position this month?" },
    { emoji: '⚠️', text: 'Which positions are at risk right now?' },
    { emoji: '👁', text: 'Show me signals from my watchlist.' },
    { emoji: '📰', text: "What's moving the market today?" },
    { emoji: '💡', text: 'Suggest how I can diversify better.' },
  ];

  // Only show suggestions when there's just the welcome message and not loading
  const showSuggestions = messages.length === 1 && !loading;

  return (
    <div className="flex flex-col h-[calc(100vh-73px)] max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-purple-500" />
          <h2 className="text-2xl font-bold text-white">Oracle</h2>
          <span className="text-gray-500 text-sm">AI-powered financial assistant</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick actions */}
          <button
            onClick={() => send('Analyze my portfolio and give me actionable insights.')}
            disabled={loading}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 hover:text-white text-sm transition-colors disabled:opacity-50"
          >
            📊 Analyze Portfolio
          </button>
          <button
            onClick={() => send('Analyze my watchlist and highlight the best entry opportunities.')}
            disabled={loading}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 hover:text-white text-sm transition-colors disabled:opacity-50"
          >
            👁 Watchlist Signals
          </button>
          <button
            onClick={clearChat}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Clear chat"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 pb-4 space-y-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="px-4 py-3 rounded-xl bg-gradient-to-br from-[#1a1d29] to-[#14161f] border border-white/10">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        {/* Conversation starter suggestions */}
        {showSuggestions && (
          <div className="mt-4">
            <p className="text-gray-600 text-xs text-center mb-4">Try asking…</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => send(s.text)}
                  className="flex items-start gap-2 p-3 bg-gradient-to-br from-[#1a1d29] to-[#14161f] border border-white/10 rounded-xl text-left text-sm text-gray-300 hover:border-blue-500/30 hover:text-white transition-all"
                >
                  <span className="text-lg leading-tight flex-shrink-0">{s.emoji}</span>
                  <span className="leading-snug">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-8 pb-8">
        <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/10 p-4 flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Oracle anything… (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-white placeholder-gray-600 text-sm resize-none focus:outline-none min-h-[24px] max-h-32 overflow-y-auto disabled:opacity-50"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-gray-600 text-xs mt-2 text-center">
          Oracle uses your AI provider configured in Settings. Responses are generated AI output — always verify financial information.
        </p>
      </div>
    </div>
  );
}
