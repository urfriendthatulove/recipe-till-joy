import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getCurrentAuthUser,
  restoreAuthUser,
  signInWithCredentials,
  signOutAppUser,
  type AppRole,
  type AuthUser,
} from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  role: AppRole | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentAuthUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    restoreAuthUser()
      .then((restored) => {
        if (!mounted) return;
        setUser(restored);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      role: user?.role ?? null,
      signIn: async (username: string, password: string) => {
        const signedIn = await signInWithCredentials(username, password);
        setUser(signedIn);
      },
      signOut: async () => {
        await signOutAppUser();
        setUser(null);
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth harus dipakai di dalam AuthProvider");
  }
  return ctx;
}
