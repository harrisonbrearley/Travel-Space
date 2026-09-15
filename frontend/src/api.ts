// Central API surface for the app. Three data paths are wired together:
//
//   1. Signed-in ONLINE  → real HTTP fetch. Every successful response is
//      mirrored into `serverMirror` so future offline reads work.
//   2. Signed-in OFFLINE → transparent fallback. Reads come from
//      `serverMirror`, writes are optimistically applied to the mirror and
//      pushed into `syncQueue` for later replay.
//   3. Guest / local     → the user chose "Continue without signing in".
//      Everything goes straight to `localApi`; nothing ever talks to the
//      server.
//
// The public `api` object exposes the same method names in all three modes
// so screens don't need to care which one is active.

import { localApi, serverMirror, rid } from "./localStore";
import { syncQueue, type QueuedEntity } from "./syncQueue";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

let _token: string | null = null;
let _localMode = false;

export function setAuthToken(t: string | null) {
  _token = t;
}

export function setLocalMode(on: boolean) {
  _localMode = on;
}

export function isLocalMode() {
  return _localMode;
}

// --- Network error detection ---
// fetch throws TypeError on network failure; the SDK also lets callers pass
// in a status-code error we shouldn't retry.
function isNetworkError(e: any): boolean {
  if (!e) return false;
  if (e.name === "TypeError") return true;
  const msg = (e.message || String(e)).toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("network request failed")
  );
}

function isNotFoundOrGone(e: any): boolean {
  const msg = e?.message || String(e || "");
  return /^40[04]|^410|^409/.test(msg);
}

async function req<T = any>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined || {}),
  };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function getWithMirror<T>(
  path: string,
  onSuccess?: (data: T) => Promise<void>,
  offlineFallback?: () => Promise<T>,
): Promise<T> {
  try {
    const res = await req<T>(path);
    if (onSuccess) {
      try { await onSuccess(res); } catch { /* mirror is best-effort */ }
    }
    return res;
  } catch (e) {
    if (isNetworkError(e) && offlineFallback) {
      return offlineFallback();
    }
    throw e;
  }
}

type Mutation<T> = {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: any;
  entity: QueuedEntity;
  entity_id: string;
  optimistic: () => Promise<T>;
  applyToMirror?: (result: T) => Promise<void>;
};

async function mutateWithQueue<T>(op: Mutation<T>): Promise<T> {
  try {
    const res = await req<T>(op.path, {
      method: op.method,
      body: op.body ? JSON.stringify(op.body) : undefined,
    });
    if (op.applyToMirror) {
      try { await op.applyToMirror(res); } catch { /* best-effort */ }
    } else if (res !== undefined) {
      // default: no-op; caller passes applyToMirror when useful
    }
    return res;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    // Offline: apply optimistically and enqueue.
    const optimistic = await op.optimistic();
    await syncQueue.enqueue({
      method: op.method,
      path: op.path,
      body: op.body,
      entity: op.entity,
      entity_id: op.entity_id,
    });
    return optimistic;
  }
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

export const api = {
  // Auth — always remote
  exchangeSession: (session_id: string) =>
    req("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  me: () => req("/auth/me"),
  logout: () => req("/auth/logout", { method: "POST" }),
  deleteAccount: () => req("/auth/me", { method: "DELETE" }),

  // Trips
  listTrips: () => {
    if (_localMode) return localApi.listTrips();
    return getWithMirror(
      "/trips",
      async (trips: any) => { if (Array.isArray(trips)) await serverMirror.mirrorTrips(trips); },
      () => serverMirror.listTrips(),
    );
  },

  getTrip: (id: string) => {
    if (_localMode) return localApi.getTrip(id);
    return getWithMirror(
      `/trips/${id}`,
      async (trip: any) => { if (trip?.id) await serverMirror.mirrorTrip(trip); },
      () => serverMirror.getTrip(id),
    );
  },

  createTrip: async (data: any) => {
    if (_localMode) return localApi.createTrip(data);
    // Ensure a client-side id so we can optimistically render & later reconcile.
    const withId = { ...data, id: data.id || rid() };
    return mutateWithQueue({
      path: "/trips",
      method: "POST",
      body: withId,
      entity: "trip",
      entity_id: withId.id,
      optimistic: () => serverMirror.createTrip(withId),
      applyToMirror: async (t: any) => { if (t?.id) await serverMirror.mirrorTrip(t); },
    });
  },

  updateTrip: async (id: string, data: any) => {
    if (_localMode) return localApi.updateTrip(id, data);
    return mutateWithQueue({
      path: `/trips/${id}`,
      method: "PATCH",
      body: data,
      entity: "trip",
      entity_id: id,
      optimistic: () => serverMirror.updateTrip(id, data),
      applyToMirror: async (t: any) => { if (t?.id) await serverMirror.mirrorTrip(t); },
    });
  },

  deleteTrip: async (id: string) => {
    if (_localMode) return localApi.deleteTrip(id);
    return mutateWithQueue({
      path: `/trips/${id}`,
      method: "DELETE",
      entity: "trip",
      entity_id: id,
      optimistic: () => serverMirror.deleteTrip(id),
    });
  },

  // Sub-items
  list: (kind: string, tripId: string) => {
    if (_localMode) return localApi.list(kind, tripId);
    return getWithMirror(
      `/trips/${tripId}/${kind}`,
      async (rows: any) => { if (Array.isArray(rows)) await serverMirror.mirrorList(kind, tripId, rows); },
      () => serverMirror.list(kind, tripId),
    );
  },

  create: async (kind: string, tripId: string, data: any) => {
    if (_localMode) return localApi.create(kind, tripId, data);
    const withId = { ...data, id: data.id || rid(), trip_id: tripId };
    return mutateWithQueue({
      path: `/trips/${tripId}/${kind}`,
      method: "POST",
      body: withId,
      entity: kind as QueuedEntity,
      entity_id: withId.id,
      optimistic: () => serverMirror.create(kind, tripId, withId),
      applyToMirror: async (row: any) => {
        if (row?.id) {
          // Reflect the (possibly server-normalised) row into the mirror
          await serverMirror.update(kind, row.id, row).catch(async () => {
            await serverMirror.create(kind, tripId, row);
          });
        }
      },
    });
  },

  update: async (kind: string, id: string, data: any) => {
    if (_localMode) return localApi.update(kind, id, data);
    return mutateWithQueue({
      path: `/${kind}/${id}`,
      method: "PATCH",
      body: data,
      entity: kind as QueuedEntity,
      entity_id: id,
      optimistic: () => serverMirror.update(kind, id, data),
      applyToMirror: async (row: any) => { if (row?.id) await serverMirror.update(kind, id, row).catch(() => {}); },
    });
  },

  remove: async (kind: string, id: string) => {
    if (_localMode) return localApi.remove(kind, id);
    return mutateWithQueue({
      path: `/${kind}/${id}`,
      method: "DELETE",
      entity: kind as QueuedEntity,
      entity_id: id,
      optimistic: () => serverMirror.remove(kind, id),
    });
  },

  getDocument: (id: string) => {
    if (_localMode) return localApi.getDocument(id);
    return getWithMirror(
      `/documents/${id}`,
      async (doc: any) => { if (doc?.id) await serverMirror.update("documents", id, doc).catch(() => {}); },
      () => serverMirror.getDocument(id),
    );
  },

  // Collaboration invites — remote only
  createInvite: (tripId: string, mode: "collab" | "copy") =>
    req(`/trips/${tripId}/invites`, { method: "POST", body: JSON.stringify({ mode }) }),
  getInvitePreview: (token: string) => req(`/invites/${token}`),
  acceptInvite: (token: string) => req(`/invites/${token}/accept`, { method: "POST" }),
  removeCollaborator: (tripId: string, userId: string) =>
    req(`/trips/${tripId}/collaborators/${userId}`, { method: "DELETE" }),

  // AI — remote only (require network + auth)
  parseFlight: (text: string) =>
    req("/ai/parse-flight", { method: "POST", body: JSON.stringify({ text }) }),
  parseBooking: (body: { text?: string; image_base64?: string; mime?: string }) =>
    req("/ai/parse-booking", { method: "POST", body: JSON.stringify(body) }),
  parseBookingMulti: (body: { text?: string; image_base64?: string; mime?: string }) =>
    req("/ai/parse-booking-multi", { method: "POST", body: JSON.stringify(body) }),

  // Geo — remote only. Accept-Language lets Nominatim return names in the
  // caller's language when possible.
  geocode: (q: string, lang?: string) =>
    req(`/geocode?q=${encodeURIComponent(q)}${lang ? `&lang=${lang}` : ""}`),
  reverseGeocode: (lat: number, lon: number, lang?: string) =>
    req(`/reverse-geocode?lat=${lat}&lon=${lon}${lang ? `&lang=${lang}` : ""}`),

  // Public (no auth)
  publicTrip: (shareId: string) => req(`/public/trips/${shareId}`),

  // Exchange rates
  exchangeRates: (base = "USD") => req(`/exchange-rates?base=${base}`),

  // Low-level escape hatch (used by the sync worker to replay queued ops)
  _rawReq: req,
};

// Re-export types unchanged from before
export type Trip = {
  id: string;
  user_id: string;
  share_id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  category: "upcoming" | "past" | "wishlist";
  cover_photo: string;
  budget_planned: number;
  currency: string;
  itinerary_filters: Record<string, boolean>;
  collaborators?: string[];
  created_at: string;
};

export type BookingStatus = "booked" | "not_booked" | "pay_on_arrival";

export type Flight = {
  id: string; trip_id: string;
  flight_number: string; airline: string;
  departure_location: string; departure_latitude: number | null; departure_longitude: number | null; departure_datetime: string;
  arrival_location: string; arrival_latitude: number | null; arrival_longitude: number | null; arrival_datetime: string;
  layovers: { location: string; latitude?: number | null; longitude?: number | null; arrival_datetime: string; departure_datetime: string }[];
  booking_status: BookingStatus; ticket_id: string;
  cost: number; cost_currency: string; notes: string;
};

export type Transport = {
  id: string; trip_id: string;
  transport_type: "car" | "bus" | "ferry" | "train" | "other";
  departure_location: string; departure_latitude: number | null; departure_longitude: number | null; departure_datetime: string;
  arrival_location: string; arrival_latitude: number | null; arrival_longitude: number | null; arrival_datetime: string;
  booking_status: BookingStatus; ticket_id: string;
  cost: number; cost_currency: string; notes: string;
};

export type Stay = {
  id: string; trip_id: string;
  accommodation_name: string; location: string; latitude: number | null; longitude: number | null;
  checkin_datetime: string; checkout_datetime: string; booking_link: string;
  breakfast_included: boolean; dinner_included: boolean;
  booking_status: BookingStatus; ticket_id: string;
  cost: number; cost_currency: string;
};

export type Attraction = {
  id: string; trip_id: string;
  name: string; website_link: string; activity_datetime: string;
  location: string; latitude: number | null; longitude: number | null;
  booking_status: BookingStatus; ticket_id: string;
  cost: number; cost_currency: string; notes: string;
};

export type Ticket = {
  id: string; trip_id: string;
  link: string; photo: string;
  file_base64?: string; file_mime?: string; file_name?: string;
  cost: number; cost_currency: string;
  details: string;
  ticket_type: "flight" | "transport" | "stay" | "attraction" | "other";
  linked_item_id: string;
};

export type DocumentKind = "photo" | "pdf" | "other";
export type LinkedType = "flight" | "transport" | "stay" | "attraction" | "ticket" | "none";

export type Doc = {
  id: string;
  trip_id: string;
  name: string;
  kind: DocumentKind;
  mime: string;
  file_base64: string;
  size: number;
  notes: string;
  linked_type: LinkedType;
  linked_item_id: string;
  created_at: string;
};
