// Drains the sync queue whenever the network is reachable and the user is
// signed in. Exposes a small React context so the home screen can show
// "Syncing X changes…" and "N changes couldn't be applied" toasts.

import React from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { syncQueue, type QueuedOp } from "@/src/syncQueue";

type SyncCtx = {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastSyncAt: number | null;
  failed: any[];
  dismissFailed: () => void;
  triggerSync: () => Promise<void>;
};

const Ctx = React.createContext<SyncCtx>({
  online: true,
  pending: 0,
  syncing: false,
  lastSyncAt: null,
  failed: [],
  dismissFailed: () => {},
  triggerSync: async () => {},
});

async function runOnce(op: QueuedOp): Promise<{ ok: boolean; error?: string; permanent?: boolean }> {
  try {
    await api._rawReq(op.path, {
      method: op.method,
      body: op.body ? JSON.stringify(op.body) : undefined,
    });
    return { ok: true };
  } catch (e: any) {
    const msg = e?.message || String(e || "");
    // 404/409/410 → the target is gone / conflicting. Move to failed log
    // and continue with the rest of the queue.
    if (/^40[04]/.test(msg) || /^410/.test(msg) || /^409/.test(msg)) {
      return { ok: false, error: msg, permanent: true };
    }
    // 401/403 → auth issue, don't drain further; try again on next cycle.
    if (/^40[13]/.test(msg)) {
      return { ok: false, error: msg, permanent: false };
    }
    // 5xx / everything else → transient
    return { ok: false, error: msg, permanent: false };
  }
}

export function SyncProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const qc = useQueryClient();
  const [online, setOnline] = React.useState(true);
  const [pending, setPending] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const [lastSyncAt, setLastSyncAt] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState<any[]>([]);

  const refreshCounts = React.useCallback(async () => {
    setPending(await syncQueue.count());
    setFailed(await syncQueue.peekFailed());
  }, []);

  const drain = React.useCallback(async () => {
    if (!enabled) return;
    if (syncing) return;
    const ops = await syncQueue.peekAll();
    if (ops.length === 0) return;
    setSyncing(true);
    let anySynced = false;
    try {
      for (const op of ops) {
        const r = await runOnce(op);
        if (r.ok) {
          await syncQueue.shift(op.op_id);
          anySynced = true;
        } else if (r.permanent) {
          await syncQueue.recordFailure(op, r.error || "", true);
        } else {
          await syncQueue.recordFailure(op, r.error || "", false);
          break;
        }
      }
    } finally {
      setSyncing(false);
      setLastSyncAt(Date.now());
      await refreshCounts();
      if (anySynced) {
        // Refresh queries so any trips/items that were pending show up cleanly
        qc.invalidateQueries();
      }
    }
  }, [enabled, syncing, refreshCounts, qc]);

  // Bootstrap + NetInfo subscription
  React.useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  React.useEffect(() => {
    if (!enabled) return;
    const handle = (state: NetInfoState) => {
      const isOnline = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline) {
        // fire and forget
        void drain();
      }
    };
    // Initial fetch
    NetInfo.fetch().then(handle).catch(() => {});
    const unsub = NetInfo.addEventListener(handle);
    return () => unsub();
  }, [enabled, drain]);

  // A gentle heartbeat while pending > 0, in case NetInfo missed a transition.
  React.useEffect(() => {
    if (!enabled) return;
    if (pending === 0) return;
    const t = setInterval(() => { void drain(); }, 20_000);
    return () => clearInterval(t);
  }, [enabled, pending, drain]);

  const triggerSync = React.useCallback(async () => {
    await drain();
  }, [drain]);

  const dismissFailed = React.useCallback(async () => {
    await syncQueue.popFailed();
    setFailed([]);
  }, []);

  return (
    <Ctx.Provider value={{ online, pending, syncing, lastSyncAt, failed, dismissFailed, triggerSync }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSync() {
  return React.useContext(Ctx);
}
