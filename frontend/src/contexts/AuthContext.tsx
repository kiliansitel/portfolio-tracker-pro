import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth } from '../lib/auth';
import { api } from '../lib/api';
import { setUserCurrency, setExchangeRates } from '../lib/currency';

interface AuthContextType {
  user: any;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(auth.getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (auth.isLoggedIn()) {
      api.me()
        .then(async (u) => {
          setUser(u);
          // Sync currency preference + exchange rates
          if (u?.settings?.currency || u?.currency) {
            setUserCurrency(u.settings?.currency || u.currency);
          }
          try {
            const rates = await api.exchangeRates();
            if (rates && typeof rates === 'object') setExchangeRates(rates);
          } catch {}
          setLoading(false);
        })
        .catch(() => {
          auth.clearSession();
          setUser(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const data = await api.login(username, password);
    auth.setSession(data.token, data.user);
    setUser(data.user);
  };

  const logout = () => {
    auth.clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
