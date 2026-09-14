import React from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { storage } from "@/src/utils/storage";
import { api, setAuthToken, setLocalMode } from "@/src/api";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "ts_session_token";
const LOCAL_KEY = "ts_local_mode";

export type SessionUser = {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
} | null;

type Ctx = {
  loading: boolean;
  user: SessionUser;
  isLocal: boolean;              // true when user chose "continue without signing in"
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  useLocal: () => Promise<void>; // enter guest / offline mode
};

const AuthCtx = React.createContext<Ctx>({
  loading: true,
  user: null,
  isLocal: false,
  signIn: async () => {},
  signOut: async () => {},
  useLocal: async () => {},
});

const seenSessionIds = new Set<string>();

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState<SessionUser>(null);
  const [isLocal, setIsLocal] = React.useState(false);

  const enterLocalMode = React.useCallback(async () => {
    setLocalMode(true);
    setIsLocal(true);
    try {
      await storage.setItem(LOCAL_KEY, "1");
    } catch {}
  }, []);

  const exitLocalMode = React.useCallback(async () => {
    setLocalMode(false);
    setIsLocal(false);
    try {
      await storage.removeItem(LOCAL_KEY);
    } catch {}
  }, []);

  const applyToken = async (token: string) => {
    setAuthToken(token);
    await storage.secureSet(TOKEN_KEY, token);
    try {
      const me = await api.me();
      setUser(me.user);
      await exitLocalMode();
    } catch {
      setAuthToken(null);
      await storage.secureRemove(TOKEN_KEY);
      setUser(null);
    }
  };

  const exchange = React.useCallback(async (sessionId: string) => {
    if (!sessionId || seenSessionIds.has(sessionId)) return;
    seenSessionIds.add(sessionId);
    try {
      const res = await api.exchangeSession(sessionId);
      if (res?.session_token) {
        await applyToken(res.session_token);
      }
    } catch (e) {
      console.warn("session exchange failed", e);
    }
  }, []);

  // Bootstrap
  React.useEffect(() => {
    (async () => {
      // 1) session_id in URL takes priority
      if (Platform.OS === "web") {
        const url = typeof window !== "undefined" ? window.location.href : "";
        const sid = extractSessionId(url);
        if (sid) {
          await exchange(sid);
          try {
            const u = new URL(window.location.href);
            u.searchParams.delete("session_id");
            const hash = u.hash.replace(/[?#&]?session_id=[^&#]+/, "");
            u.hash = hash.startsWith("#") ? hash : (hash ? "#" + hash : "");
            window.history.replaceState(window.history.state, "", u.toString());
          } catch {}
          setLoading(false);
          return;
        }
      } else {
        const initial = await Linking.getInitialURL();
        const sid = extractSessionId(initial);
        if (sid) {
          await exchange(sid);
          setLoading(false);
          return;
        }
      }

      // 2) Existing token
      const stored = await storage.secureGet<string | null>(TOKEN_KEY, null);
      if (stored) {
        await applyToken(stored);
        setLoading(false);
        return;
      }

      // 3) Persisted local (guest) mode
      const local = await storage.getItem<string | null>(LOCAL_KEY, null);
      if (local === "1") {
        await enterLocalMode();
      }
      setLoading(false);
    })();

    const sub = Linking.addEventListener("url", (evt) => {
      const sid = extractSessionId(evt.url);
      if (sid) exchange(sid);
    });
    return () => sub.remove();
  }, [exchange, enterLocalMode]);

  const signIn = async () => {
    let redirectUrl = "";
    if (Platform.OS === "web") {
      redirectUrl = window.location.origin + "/";
    } else {
      redirectUrl = Linking.createURL("");
    }
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let sid: string | null = null;
    if ((result as any)?.url) sid = extractSessionId((result as any).url);
    if (!sid) {
      const initial = await Linking.getInitialURL();
      sid = extractSessionId(initial);
    }
    if (sid) await exchange(sid);
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {}
    setAuthToken(null);
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
    await exitLocalMode();
  };

  const useLocal = async () => {
    await enterLocalMode();
  };

  return (
    <AuthCtx.Provider value={{ loading, user, isLocal, signIn, signOut, useLocal }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return React.useContext(AuthCtx);
}
