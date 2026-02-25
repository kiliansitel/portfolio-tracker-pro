import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth } from '../lib/auth';
import { api } from '../lib/api';

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
        .then((u) => {
          setUser(u);
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
