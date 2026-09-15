// Local-only auth stub. There is no sign-in anymore — every user is a
// guest whose data lives on-device. The context is kept so existing
// callers (`useAuth().isLocal`, etc.) don't have to change.

import React from "react";
import { storage } from "@/src/utils/storage";
import { setAuthToken, setLocalMode } from "@/src/api";

const LOCAL_KEY = "ts_local_mode";

export type SessionUser = null;

type Ctx = {
  loading: boolean;
  user: SessionUser;
  isLocal: boolean;
  signIn: () => Promise<void>;    // no-op; kept for legacy references
  signOut: () => Promise<void>;   // clears local flag
  useLocal: () => Promise<void>;  // enter local mode
};

const AuthCtx = React.createContext<Ctx>({
  loading: true,
  user: null,
  isLocal: true,
  signIn: async () => {},
  signOut: async () => {},
  useLocal: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [isLocal, setIsLocal] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setAuthToken(null);
      setLocalMode(true);
      setIsLocal(true);
      try { await storage.setItem(LOCAL_KEY, "1"); } catch {}
      setLoading(false);
    })();
  }, []);

  const useLocalCb = React.useCallback(async () => {
    setLocalMode(true);
    setIsLocal(true);
    try { await storage.setItem(LOCAL_KEY, "1"); } catch {}
  }, []);

  const signIn = React.useCallback(async () => {
    // No-op: sign-in is disabled in this build.
  }, []);

  const signOut = React.useCallback(async () => {
    // Keeps app in local-only mode; nothing to revoke.
    setLocalMode(true);
    setIsLocal(true);
    try { await storage.setItem(LOCAL_KEY, "1"); } catch {}
  }, []);

  return (
    <AuthCtx.Provider value={{ loading, user: null, isLocal, signIn, signOut, useLocal: useLocalCb }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return React.useContext(AuthCtx);
}
