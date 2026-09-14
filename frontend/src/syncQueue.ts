// Persisted FIFO queue of mutations that need to reach the server when we
// come back online. All entries survive app restarts.

import AsyncStorage from "@react-native-async-storage/async-storage";

export type QueuedEntity =
  | "trip"
  | "flights"
  | "transport"
  | "stays"
  | "attractions"
  | "tickets"
  | "documents";

export type QueuedOp = {
  op_id: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;             // e.g. "/trips" or "/trips/{tid}/flights"
  body?: any;
  entity: QueuedEntity;
  entity_id: string;        // client-generated (for POST) or existing (for PATCH/DELETE)
  ts: number;
  attempts: number;
  last_error?: string;
};

const K = "ts:syncqueue:v1";
const FAILED_K = "ts:syncqueue:failed:v1";

let mem: QueuedOp[] | null = null;

async function loadQueue(): Promise<QueuedOp[]> {
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(K);
    mem = raw ? JSON.parse(raw) : [];
  } catch {
    mem = [];
  }
  return mem!;
}

async function saveQueue() {
  if (!mem) return;
  try {
    await AsyncStorage.setItem(K, JSON.stringify(mem));
  } catch {
    /* ignore */
  }
}

export const syncQueue = {
  async count() {
    const q = await loadQueue();
    return q.length;
  },

  async peekAll() {
    const q = await loadQueue();
    return [...q];
  },

  async enqueue(op: Omit<QueuedOp, "op_id" | "ts" | "attempts">) {
    const q = await loadQueue();
    // Try to collapse consecutive PATCHes on the same entity_id so bulk edits
    // don't blow up the queue.
    const last = q[q.length - 1];
    if (
      last &&
      last.method === "PATCH" &&
      op.method === "PATCH" &&
      last.entity === op.entity &&
      last.entity_id === op.entity_id
    ) {
      last.body = { ...(last.body || {}), ...(op.body || {}) };
      last.ts = Date.now();
      await saveQueue();
      return last;
    }
    const entry: QueuedOp = {
      ...op,
      op_id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      attempts: 0,
    };
    q.push(entry);
    await saveQueue();
    return entry;
  },

  async shift(op_id: string) {
    const q = await loadQueue();
    const idx = q.findIndex((o) => o.op_id === op_id);
    if (idx >= 0) q.splice(idx, 1);
    await saveQueue();
  },

  async recordFailure(op: QueuedOp, error: string, permanent: boolean) {
    if (permanent) {
      // Push to a failed log so the user can see what got skipped.
      try {
        const raw = await AsyncStorage.getItem(FAILED_K);
        const failed = raw ? JSON.parse(raw) : [];
        failed.push({ ...op, last_error: error, failed_at: Date.now() });
        await AsyncStorage.setItem(FAILED_K, JSON.stringify(failed.slice(-30)));
      } catch {
        /* ignore */
      }
      await this.shift(op.op_id);
      return;
    }
    // otherwise bump attempts and keep it in place
    const q = await loadQueue();
    const idx = q.findIndex((o) => o.op_id === op.op_id);
    if (idx >= 0) {
      q[idx].attempts += 1;
      q[idx].last_error = error;
      await saveQueue();
    }
  },

  async popFailed(): Promise<any[]> {
    try {
      const raw = await AsyncStorage.getItem(FAILED_K);
      if (!raw) return [];
      await AsyncStorage.removeItem(FAILED_K);
      return JSON.parse(raw) as any[];
    } catch {
      return [];
    }
  },

  async peekFailed(): Promise<any[]> {
    try {
      const raw = await AsyncStorage.getItem(FAILED_K);
      return raw ? (JSON.parse(raw) as any[]) : [];
    } catch {
      return [];
    }
  },

  async clear() {
    mem = [];
    await AsyncStorage.multiRemove([K, FAILED_K]);
  },
};
