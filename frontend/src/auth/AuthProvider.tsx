import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

interface SignUpResult {
  emailConfirmationRequired: boolean;
}

interface AuthContextValue {
  configured: boolean;
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  recoveryMode: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  clearRecoveryMode(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to frontend/.env.");
  }
  return supabase;
}

function redirectUrl(path: string) {
  return new URL(path, window.location.origin).toString();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(error ? null : data.session);
        setIsLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (event === "SIGNED_OUT") setRecoveryMode(false);
      setIsLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    isLoading,
    session,
    user: session?.user ?? null,
    recoveryMode,
    async signIn(email, password) {
      const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp(email, password) {
      const { data, error } = await requireSupabase().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl("/auth") },
      });
      if (error) throw error;
      return { emailConfirmationRequired: !data.session };
    },
    async requestPasswordReset(email) {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl("/auth/update-password"),
      });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
      setRecoveryMode(false);
    },
    async signOut() {
      const { error } = await requireSupabase().auth.signOut();
      if (error) throw error;
    },
    clearRecoveryMode() { setRecoveryMode(false); },
  }), [isLoading, recoveryMode, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
