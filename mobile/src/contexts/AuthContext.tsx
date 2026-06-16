import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

type AuthState = {
  token: string | null;
  user: { name: string; email: string; role: string } | null;
  login: (token: string, user: AuthState["user"]) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await SecureStore.getItemAsync("auth_token");
        const u = await SecureStore.getItemAsync("auth_user");
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function login(t: string, u: AuthState["user"]) {
    await SecureStore.setItemAsync("auth_token", t);
    await SecureStore.setItemAsync("auth_user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  }

  async function logout() {
    await SecureStore.deleteItemAsync("auth_token");
    await SecureStore.deleteItemAsync("auth_user");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
