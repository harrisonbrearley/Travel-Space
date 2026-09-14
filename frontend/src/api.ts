import { localApi } from "./localStore";

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

// --- Router helpers ---
// When in local mode, sub-calls dispatch to localApi. Auth/AI/geo/exchange stay remote-only.

export const api = {
  // Auth (remote-only)
  exchangeSession: (session_id: string) =>
    req("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  me: () => req("/auth/me"),
  logout: () => req("/auth/logout", { method: "POST" }),

  // Trips
  listTrips: () => (_localMode ? localApi.listTrips() : req("/trips")),
  getTrip: (id: string) => (_localMode ? localApi.getTrip(id) : req(`/trips/${id}`)),
  createTrip: (data: any) =>
    _localMode
      ? localApi.createTrip(data)
      : req("/trips", { method: "POST", body: JSON.stringify(data) }),
  updateTrip: (id: string, data: any) =>
    _localMode
      ? localApi.updateTrip(id, data)
      : req(`/trips/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTrip: (id: string) =>
    _localMode ? localApi.deleteTrip(id) : req(`/trips/${id}`, { method: "DELETE" }),

  // Sub-items
  list: (kind: string, tripId: string) =>
    _localMode ? localApi.list(kind, tripId) : req(`/trips/${tripId}/${kind}`),
  create: (kind: string, tripId: string, data: any) =>
    _localMode
      ? localApi.create(kind, tripId, data)
      : req(`/trips/${tripId}/${kind}`, { method: "POST", body: JSON.stringify(data) }),
  update: (kind: string, id: string, data: any) =>
    _localMode
      ? localApi.update(kind, id, data)
      : req(`/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (kind: string, id: string) =>
    _localMode ? localApi.remove(kind, id) : req(`/${kind}/${id}`, { method: "DELETE" }),

  // Document single-with-blob fetch (needed to open the file)
  getDocument: (id: string) =>
    _localMode ? localApi.getDocument(id) : req(`/documents/${id}`),

  // Collaboration invites
  createInvite: (tripId: string, mode: "collab" | "copy") =>
    req(`/trips/${tripId}/invites`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
  getInvitePreview: (token: string) => req(`/invites/${token}`),
  acceptInvite: (token: string) => req(`/invites/${token}/accept`, { method: "POST" }),
  removeCollaborator: (tripId: string, userId: string) =>
    req(`/trips/${tripId}/collaborators/${userId}`, { method: "DELETE" }),

  // AI (remote-only; graceful failure if offline)
  parseFlight: (text: string) =>
    req("/ai/parse-flight", { method: "POST", body: JSON.stringify({ text }) }),
  parseBooking: (body: { text?: string; image_base64?: string; mime?: string }) =>
    req("/ai/parse-booking", { method: "POST", body: JSON.stringify(body) }),

  // Geo (remote-only)
  geocode: (q: string) => req(`/geocode?q=${encodeURIComponent(q)}`),
  reverseGeocode: (lat: number, lon: number) => req(`/reverse-geocode?lat=${lat}&lon=${lon}`),

  // Public (no auth)
  publicTrip: (shareId: string) => req(`/public/trips/${shareId}`),

  // Exchange rates
  exchangeRates: (base = "USD") => req(`/exchange-rates?base=${base}`),
};

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
