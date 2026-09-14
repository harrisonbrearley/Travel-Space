const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function req<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // Trips
  listTrips: () => req("/trips"),
  getTrip: (id: string) => req(`/trips/${id}`),
  createTrip: (data: any) => req("/trips", { method: "POST", body: JSON.stringify(data) }),
  updateTrip: (id: string, data: any) =>
    req(`/trips/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTrip: (id: string) => req(`/trips/${id}`, { method: "DELETE" }),

  // Sub-items
  list: (kind: string, tripId: string) => req(`/trips/${tripId}/${kind}`),
  create: (kind: string, tripId: string, data: any) =>
    req(`/trips/${tripId}/${kind}`, { method: "POST", body: JSON.stringify(data) }),
  update: (kind: string, id: string, data: any) =>
    req(`/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (kind: string, id: string) => req(`/${kind}/${id}`, { method: "DELETE" }),

  // AI
  parseFlight: (text: string) =>
    req("/ai/parse-flight", { method: "POST", body: JSON.stringify({ text }) }),
};

export type Trip = {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  category: "upcoming" | "past" | "wishlist";
  cover_photo: string;
  budget_planned: number;
  itinerary_filters: Record<string, boolean>;
  created_at: string;
};

export type BookingStatus = "booked" | "not_booked" | "pay_on_arrival";

export type Flight = {
  id: string;
  trip_id: string;
  flight_number: string;
  airline: string;
  departure_location: string;
  departure_datetime: string;
  arrival_location: string;
  arrival_datetime: string;
  layovers: { location: string; arrival_datetime: string; departure_datetime: string }[];
  booking_status: BookingStatus;
  ticket_id: string;
  cost: number;
  notes: string;
};

export type Transport = {
  id: string;
  trip_id: string;
  transport_type: "car" | "bus" | "ferry" | "train" | "other";
  departure_location: string;
  departure_datetime: string;
  arrival_location: string;
  arrival_datetime: string;
  booking_status: BookingStatus;
  ticket_id: string;
  cost: number;
  notes: string;
};

export type Stay = {
  id: string;
  trip_id: string;
  accommodation_name: string;
  location: string;
  checkin_datetime: string;
  checkout_datetime: string;
  booking_link: string;
  breakfast_included: boolean;
  dinner_included: boolean;
  booking_status: BookingStatus;
  ticket_id: string;
  cost: number;
};

export type Attraction = {
  id: string;
  trip_id: string;
  name: string;
  website_link: string;
  activity_datetime: string;
  location: string;
  booking_status: BookingStatus;
  ticket_id: string;
  cost: number;
};

export type Ticket = {
  id: string;
  trip_id: string;
  link: string;
  photo: string;
  cost: number;
  details: string;
  ticket_type: "flight" | "transport" | "stay" | "attraction" | "other";
  linked_item_id: string;
};
