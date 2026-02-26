import { createBrowserRouter, Navigate } from 'react-router';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Positions } from './pages/Positions';
import { Watchlist } from './pages/Watchlist';
import { Portfolio } from './pages/Portfolio';
import { News } from './pages/News';
import { Oracle } from './pages/Oracle';
import { Alerts } from './pages/Alerts';
import { Connections } from './pages/Connections';
import { Settings } from './pages/Settings';
import { Wallet } from './pages/Wallet';
import { Transactions } from './pages/Transactions';
import { NotFound } from './pages/NotFound';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-blue-500/30 mx-auto mb-4 animate-pulse">
            P
          </div>
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <ErrorBoundary>
          <Layout />
        </ErrorBoundary>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'positions', element: <Positions /> },
      { path: 'watchlist', element: <Watchlist /> },
      { path: 'portfolio', element: <Portfolio /> },
      { path: 'news', element: <News /> },
      { path: 'oracle', element: <Oracle /> },
      { path: 'alerts', element: <Alerts /> },
      { path: 'connections', element: <Connections /> },
      { path: 'settings', element: <Settings /> },
      { path: 'wallet', element: <Wallet /> },
      { path: 'transactions', element: <Transactions /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  // Top-level catch-all for unmatched URLs outside the app shell
  { path: '*', element: <NotFound /> },
]);
