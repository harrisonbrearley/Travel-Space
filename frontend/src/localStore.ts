// Local, on-device store used when the user chooses to skip sign-in or
// is offline. Mirrors the shape of the remote API responses. All data is
// persisted in AsyncStorage so it survives app restarts.

import AsyncStorage from "@react-native-async-storage/async-storage";

const K = "ts:localstore:v1";

// UUID/id generator that does not need any native module.
function rid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type LocalState = {
  trips: any[];
  flights: any[];
  transport: any[];
  stays: any[];
  attractions: any[];
  tickets: any[];
  documents: any[];
};

const empty: LocalState = {
  trips: [], flights: [], transport: [], stays: [], attractions: [], tickets: [], documents: [],
};

let cache: LocalState | null = null;
let loading: Promise<LocalState> | null = null;

async function load(): Promise<LocalState> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(K);
      cache = raw ? { ...empty, ...JSON.parse(raw) } : { ...empty };
    } catch {
      cache = { ...empty };
    }
    loading = null;
    return cache!;
  })();
  return loading;
}

async function persist() {
  if (!cache) return;
  try {
    await AsyncStorage.setItem(K, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

const COLLECTIONS = ["flights", "transport", "stays", "attractions", "tickets", "documents"] as const;

function defaultTrip(data: any) {
  return {
    id: data.id || rid(),
    user_id: "local",
    share_id: `local_${rid()}`,
    name: data.name || "New Trip",
    destination: data.destination || "",
    start_date: data.start_date || "",
    end_date: data.end_date || "",
    category: data.category || "upcoming",
    cover_photo: data.cover_photo || "",
    budget_planned: data.budget_planned || 0,
    currency: data.currency || "USD",
    itinerary_filters: data.itinerary_filters || {
      flights: true, transport: true, stay: true, attractions: true,
    },
    created_at: new Date().toISOString(),
  };
}

async function unlinkTicketsForItem(itemId: string) {
  if (!cache) return;
  cache.tickets = cache.tickets.map((t) =>
    t.linked_item_id === itemId ? { ...t, linked_item_id: "" } : t
  );
}

async function unlinkItemsForTicket(ticketId: string) {
  if (!cache) return;
  for (const col of ["flights", "transport", "stays", "attractions"] as const) {
    (cache as any)[col] = (cache as any)[col].map((it: any) =>
      it.ticket_id === ticketId ? { ...it, ticket_id: "" } : it
    );
  }
}

const TICKET_COLLECTIONS: Record<string, string> = {
  flight: "flights", transport: "transport", stay: "stays", attraction: "attractions",
};

async function syncTicketLink(ticket: any) {
  if (!cache || !ticket?.id) return;
  const linkedCol = TICKET_COLLECTIONS[ticket.ticket_type];
  const linkedId = ticket.linked_item_id || "";
  for (const col of Object.values(TICKET_COLLECTIONS)) {
    if (col === linkedCol && linkedId) {
      (cache as any)[col] = (cache as any)[col].map((it: any) =>
        it.ticket_id === ticket.id && it.id !== linkedId ? { ...it, ticket_id: "" } : it
      );
    } else {
      (cache as any)[col] = (cache as any)[col].map((it: any) =>
        it.ticket_id === ticket.id ? { ...it, ticket_id: "" } : it
      );
    }
  }
  if (linkedCol && linkedId) {
    (cache as any)[linkedCol] = (cache as any)[linkedCol].map((it: any) =>
      it.id === linkedId ? { ...it, ticket_id: ticket.id } : it
    );
  }
}

function stripBlob<T extends Record<string, any>>(row: T): T {
  const { file_base64, ...rest } = row as any;
  return { ...rest, file_base64: "" } as T;
}

export const localApi = {
  // --- trips ---
  async listTrips() {
    const s = await load();
    return [...s.trips];
  },
  async getTrip(id: string) {
    const s = await load();
    const t = s.trips.find((x) => x.id === id);
    if (!t) throw new Error(`404: Trip not found`);
    return t;
  },
  async createTrip(data: any) {
    const s = await load();
    const t = defaultTrip(data);
    s.trips.push(t);
    await persist();
    return t;
  },
  async updateTrip(id: string, data: any) {
    const s = await load();
    const idx = s.trips.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error(`404: Trip not found`);
    // partial merge
    s.trips[idx] = { ...s.trips[idx], ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null)) };
    await persist();
    return s.trips[idx];
  },
  async deleteTrip(id: string) {
    const s = await load();
    s.trips = s.trips.filter((x) => x.id !== id);
    for (const col of COLLECTIONS) {
      (s as any)[col] = (s as any)[col].filter((x: any) => x.trip_id !== id);
    }
    await persist();
    return { ok: true };
  },

  // --- generic sub-items ---
  async list(kind: string, tripId: string) {
    const s = await load();
    const rows = ((s as any)[kind] || []).filter((x: any) => x.trip_id === tripId);
    if (kind === "documents") return rows.map(stripBlob);
    return rows;
  },
  async create(kind: string, tripId: string, data: any) {
    const s = await load();
    const row = { ...data, id: data.id || rid(), trip_id: tripId };
    if (kind === "documents") {
      row.size = data.file_base64 ? Math.floor((data.file_base64.length * 3) / 4) : 0;
      row.created_at = new Date().toISOString();
    }
    (s as any)[kind] = [...((s as any)[kind] || []), row];
    if (kind === "tickets") await syncTicketLink(row);
    await persist();
    return row;
  },
  async update(kind: string, id: string, data: any) {
    const s = await load();
    const arr = (s as any)[kind] || [];
    const idx = arr.findIndex((x: any) => x.id === id);
    if (idx < 0) throw new Error(`404: Not found`);
    const patch = Object.fromEntries(
      Object.entries(data).filter(([k]) => k !== "id" && k !== "trip_id")
    );
    if (kind === "documents" && "file_base64" in patch) {
      (patch as any).size = (patch as any).file_base64
        ? Math.floor(((patch as any).file_base64.length * 3) / 4)
        : 0;
    }
    arr[idx] = { ...arr[idx], ...patch };
    if (kind === "tickets") await syncTicketLink(arr[idx]);
    await persist();
    return arr[idx];
  },
  async remove(kind: string, id: string) {
    const s = await load();
    if (kind === "tickets") await unlinkItemsForTicket(id);
    else await unlinkTicketsForItem(id);
    (s as any)[kind] = ((s as any)[kind] || []).filter((x: any) => x.id !== id);
    await persist();
    return { ok: true };
  },

  // documents — fetch single with blob
  async getDocument(id: string) {
    const s = await load();
    const d = (s.documents || []).find((x) => x.id === id);
    if (!d) throw new Error(`404: Not found`);
    return d;
  },

  // Housekeeping
  async hasLocalData() {
    const s = await load();
    return s.trips.length > 0;
  },
  async clearAll() {
    cache = { ...empty };
    await AsyncStorage.removeItem(K);
  },
  async snapshot() {
    const s = await load();
    return JSON.parse(JSON.stringify(s));
  },
};
