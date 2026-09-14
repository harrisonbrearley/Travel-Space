// A tiny on-device datastore for a trip and its sub-items. Used in two
// contexts:
//   1. Guest mode — the user chose "Continue without signing in". Data
//      lives only on this device.
//   2. Signed-in offline mirror — mirrors what the server told us the last
//      time we could reach it, so reads (and later writes) still work while
//      we're offline.
//
// The two instances (`localApi`, `serverMirror`) use different AsyncStorage
// keys to keep guest and account data separate.

import AsyncStorage from "@react-native-async-storage/async-storage";

export function rid() {
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

const empty = (): LocalState => ({
  trips: [], flights: [], transport: [], stays: [], attractions: [], tickets: [], documents: [],
});

const COLLECTIONS = ["flights", "transport", "stays", "attractions", "tickets", "documents"] as const;
const TICKET_COLLECTIONS: Record<string, string> = {
  flight: "flights", transport: "transport", stay: "stays", attraction: "attractions",
};

function defaultTrip(data: any) {
  return {
    id: data.id || rid(),
    user_id: data.user_id || "local",
    share_id: data.share_id || `local_${rid()}`,
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
    collaborators: data.collaborators || [],
    created_at: data.created_at || new Date().toISOString(),
  };
}

function stripBlob<T extends Record<string, any>>(row: T): T {
  const { file_base64, ...rest } = row as any;
  return { ...rest, file_base64: "" } as T;
}

export class LocalStore {
  private cache: LocalState | null = null;
  private loading: Promise<LocalState> | null = null;

  constructor(private storageKey: string) {}

  private async load(): Promise<LocalState> {
    if (this.cache) return this.cache;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(this.storageKey);
        this.cache = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
      } catch {
        this.cache = empty();
      }
      this.loading = null;
      return this.cache!;
    })();
    return this.loading;
  }

  private async persist() {
    if (!this.cache) return;
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(this.cache));
    } catch {
      /* ignore */
    }
  }

  private async unlinkTicketsForItem(itemId: string) {
    if (!this.cache) return;
    this.cache.tickets = this.cache.tickets.map((t) =>
      t.linked_item_id === itemId ? { ...t, linked_item_id: "" } : t,
    );
  }

  private async unlinkItemsForTicket(ticketId: string) {
    if (!this.cache) return;
    for (const col of ["flights", "transport", "stays", "attractions"] as const) {
      (this.cache as any)[col] = (this.cache as any)[col].map((it: any) =>
        it.ticket_id === ticketId ? { ...it, ticket_id: "" } : it,
      );
    }
  }

  private async syncTicketLink(ticket: any) {
    if (!this.cache || !ticket?.id) return;
    const linkedCol = TICKET_COLLECTIONS[ticket.ticket_type];
    const linkedId = ticket.linked_item_id || "";
    for (const col of Object.values(TICKET_COLLECTIONS)) {
      if (col === linkedCol && linkedId) {
        (this.cache as any)[col] = (this.cache as any)[col].map((it: any) =>
          it.ticket_id === ticket.id && it.id !== linkedId ? { ...it, ticket_id: "" } : it,
        );
      } else {
        (this.cache as any)[col] = (this.cache as any)[col].map((it: any) =>
          it.ticket_id === ticket.id ? { ...it, ticket_id: "" } : it,
        );
      }
    }
    if (linkedCol && linkedId) {
      (this.cache as any)[linkedCol] = (this.cache as any)[linkedCol].map((it: any) =>
        it.id === linkedId ? { ...it, ticket_id: ticket.id } : it,
      );
    }
  }

  // ---------- API surface (matches remote /api/... shape) ----------
  async listTrips() {
    const s = await this.load();
    return [...s.trips];
  }

  async getTrip(id: string) {
    const s = await this.load();
    const t = s.trips.find((x) => x.id === id);
    if (!t) throw new Error(`404: Trip not found`);
    return t;
  }

  async createTrip(data: any) {
    const s = await this.load();
    // idempotent: return existing if the id is already known
    if (data.id) {
      const existing = s.trips.find((x) => x.id === data.id);
      if (existing) return existing;
    }
    const t = defaultTrip(data);
    s.trips.push(t);
    await this.persist();
    return t;
  }

  async updateTrip(id: string, data: any) {
    const s = await this.load();
    const idx = s.trips.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error(`404: Trip not found`);
    s.trips[idx] = {
      ...s.trips[idx],
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null)),
    };
    await this.persist();
    return s.trips[idx];
  }

  async deleteTrip(id: string) {
    const s = await this.load();
    s.trips = s.trips.filter((x) => x.id !== id);
    for (const col of COLLECTIONS) {
      (s as any)[col] = (s as any)[col].filter((x: any) => x.trip_id !== id);
    }
    await this.persist();
    return { ok: true };
  }

  async list(kind: string, tripId: string) {
    const s = await this.load();
    const rows = ((s as any)[kind] || []).filter((x: any) => x.trip_id === tripId);
    if (kind === "documents") return rows.map(stripBlob);
    return rows;
  }

  async create(kind: string, tripId: string, data: any) {
    const s = await this.load();
    const arr = (s as any)[kind] || [];
    if (data.id) {
      const existing = arr.find((x: any) => x.id === data.id);
      if (existing) return existing;
    }
    const row = { ...data, id: data.id || rid(), trip_id: tripId };
    if (kind === "documents") {
      row.size = data.file_base64 ? Math.floor((data.file_base64.length * 3) / 4) : 0;
      row.created_at = data.created_at || new Date().toISOString();
    }
    (s as any)[kind] = [...arr, row];
    if (kind === "tickets") await this.syncTicketLink(row);
    await this.persist();
    return row;
  }

  async update(kind: string, id: string, data: any) {
    const s = await this.load();
    const arr = (s as any)[kind] || [];
    const idx = arr.findIndex((x: any) => x.id === id);
    if (idx < 0) throw new Error(`404: Not found`);
    const patch = Object.fromEntries(Object.entries(data).filter(([k]) => k !== "id" && k !== "trip_id"));
    if (kind === "documents" && "file_base64" in patch) {
      (patch as any).size = (patch as any).file_base64
        ? Math.floor(((patch as any).file_base64.length * 3) / 4)
        : 0;
    }
    arr[idx] = { ...arr[idx], ...patch };
    if (kind === "tickets") await this.syncTicketLink(arr[idx]);
    await this.persist();
    return arr[idx];
  }

  async remove(kind: string, id: string) {
    const s = await this.load();
    if (kind === "tickets") await this.unlinkItemsForTicket(id);
    else await this.unlinkTicketsForItem(id);
    (s as any)[kind] = ((s as any)[kind] || []).filter((x: any) => x.id !== id);
    await this.persist();
    return { ok: true };
  }

  async getDocument(id: string) {
    const s = await this.load();
    const d = (s.documents || []).find((x) => x.id === id);
    if (!d) throw new Error(`404: Not found`);
    return d;
  }

  // ---------- Bulk mirror helpers (used by online GETs to keep offline usable) ----------
  async mirrorTrips(trips: any[]) {
    const s = await this.load();
    s.trips = trips.map(defaultTrip);
    await this.persist();
  }

  async mirrorList(kind: string, tripId: string, items: any[]) {
    const s = await this.load();
    (s as any)[kind] = [
      ...(((s as any)[kind] || []) as any[]).filter((x: any) => x.trip_id !== tripId),
      ...items.map((x: any) => ({ ...x, trip_id: tripId })),
    ];
    await this.persist();
  }

  async mirrorTrip(trip: any) {
    const s = await this.load();
    const idx = s.trips.findIndex((x) => x.id === trip.id);
    if (idx >= 0) s.trips[idx] = defaultTrip(trip);
    else s.trips.push(defaultTrip(trip));
    await this.persist();
  }

  // ---------- Housekeeping ----------
  async hasData() {
    const s = await this.load();
    return s.trips.length > 0;
  }
  async tripCount() {
    const s = await this.load();
    return s.trips.length;
  }
  async clearAll() {
    this.cache = empty();
    await AsyncStorage.removeItem(this.storageKey);
  }
  async snapshot(): Promise<LocalState> {
    const s = await this.load();
    return JSON.parse(JSON.stringify(s));
  }
}

export const localApi = new LocalStore("ts:localstore:v1");
export const serverMirror = new LocalStore("ts:mirror:v1");
