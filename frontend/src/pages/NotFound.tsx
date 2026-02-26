import { useNavigate } from 'react-router';
import { Home, AlertTriangle } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-600/20 border border-orange-500/30 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-orange-400" />
        </div>
        <div className="text-7xl font-black bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent mb-4">
          404
        </div>
        <h2 className="text-white font-bold text-2xl mb-2">Page not found</h2>
        <p className="text-gray-400 text-sm mb-8">
          This page doesn't exist or has been moved.
        </p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all"
        >
          <Home className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
