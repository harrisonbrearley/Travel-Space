// Device-to-device trip sync.
//
// The goal: when two travellers meet in person (no network available)
// they can hand a trip from one phone to the other via a plain JSON file
// shared over AirDrop / Bluetooth / WiFi / email / QR / anything.
//
// Exports collect the entire trip snapshot — trip metadata plus every
// sub-item — into a single, human-readable JSON file with a stable
// schema version. Imports either drop the trip in as a fresh copy or
// merge new sub-items into an existing trip that matches by id.

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";

import { api } from "@/src/api";
import { localApi, serverMirror, rid } from "@/src/localStore";

export const TRIP_FILE_SCHEMA = "travelspace.trip.v1";

export type TripBundle = {
  schema: typeof TRIP_FILE_SCHEMA;
  exported_at: string;
  trip: any;
  flights: any[];
  transport: any[];
  stays: any[];
  attractions: any[];
  tickets: any[];
  documents: any[];
};

// Build the bundle. Uses whichever data source api.* resolves — that's
// localApi in guest mode, serverMirror when offline, or the real server
// otherwise. All three shapes are identical.
export async function buildTripBundle(tripId: string): Promise<TripBundle> {
  const [trip, flights, transport, stays, attractions, tickets, documents] = await Promise.all([
    api.getTrip(tripId),
    api.list("flights", tripId),
    api.list("transport", tripId),
    api.list("stays", tripId),
    api.list("attractions", tripId),
    api.list("tickets", tripId),
    api.list("documents", tripId),
  ]);

  // Documents' list response strips the blob. To make offline sharing
  // actually useful we re-fetch each document one-by-one (worst-case a few
  // MB total, capped by MAX_DOCUMENT_BYTES on the server).
  const fullDocs = await Promise.all(
    (documents as any[]).map(async (d: any) => {
      try {
        return await api.getDocument(d.id);
      } catch {
        return d; // fallback: keep the stripped record
      }
    }),
  );

  return {
    schema: TRIP_FILE_SCHEMA,
    exported_at: new Date().toISOString(),
    trip: trip as any,
    flights: flights as any[],
    transport: transport as any[],
    stays: stays as any[],
    attractions: attractions as any[],
    tickets: tickets as any[],
    documents: fullDocs as any[],
  };
}

// Share the bundle as a downloadable / shareable file. Native uses the
// system share sheet; web triggers a browser download.
export async function shareTripBundle(bundle: TripBundle): Promise<void> {
  const json = JSON.stringify(bundle, null, 2);
  const safeName = (bundle.trip?.name || "trip").replace(/[^\w\-]+/g, "_").slice(0, 40) || "trip";
  const fileName = `${safeName}-travelspace.json`;

  if (Platform.OS === "web") {
    // Browser: create a blob and click-download.
    if (typeof document !== "undefined") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    return;
  }

  // Native: write to cache then open the system share sheet.
  const path = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: bundle.trip?.name || "Trip" });
  }
}

// Pick a bundle from disk and parse it. Throws on invalid content.
export async function pickTripBundle(): Promise<TripBundle> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) throw new Error("cancelled");
  const a = res.assets[0];
  const raw = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.UTF8 });
  return parseBundle(raw);
}

export function parseBundle(raw: string): TripBundle {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }
  if (!parsed || parsed.schema !== TRIP_FILE_SCHEMA || !parsed.trip) {
    throw new Error("invalid_schema");
  }
  return parsed as TripBundle;
}

// Store into local store as a fresh trip (new id) — always safe.
export async function importAsNewTrip(bundle: TripBundle): Promise<string> {
  const newTripId = rid();
  const idMap: Record<string, string> = {};
  const collect = (arr: any[]) => arr.forEach((r: any) => { if (r?.id) idMap[r.id] = rid(); });
  collect(bundle.flights || []);
  collect(bundle.transport || []);
  collect(bundle.stays || []);
  collect(bundle.attractions || []);
  collect(bundle.tickets || []);
  collect(bundle.documents || []);

  await localApi.createTrip({
    ...bundle.trip,
    id: newTripId,
    name: bundle.trip?.name?.toLowerCase().startsWith("copy of ") ? bundle.trip.name : `Copy of ${bundle.trip?.name || "Trip"}`,
    collaborators: [],
    share_id: `local_${rid()}`,
    user_id: "local",
  });

  const remap = (r: any, kind: string) => {
    const copy = { ...r, id: idMap[r.id], trip_id: newTripId };
    if (copy.ticket_id) copy.ticket_id = idMap[copy.ticket_id] || "";
    if (copy.linked_item_id) copy.linked_item_id = idMap[copy.linked_item_id] || "";
    return copy;
  };

  for (const r of bundle.flights || []) await localApi.create("flights", newTripId, remap(r, "flights"));
  for (const r of bundle.transport || []) await localApi.create("transport", newTripId, remap(r, "transport"));
  for (const r of bundle.stays || []) await localApi.create("stays", newTripId, remap(r, "stays"));
  for (const r of bundle.attractions || []) await localApi.create("attractions", newTripId, remap(r, "attractions"));
  for (const r of bundle.tickets || []) await localApi.create("tickets", newTripId, remap(r, "tickets"));
  for (const r of bundle.documents || []) await localApi.create("documents", newTripId, remap(r, "documents"));

  return newTripId;
}

// Merge: ADDS or UPDATES sub-items by id into an existing trip. It NEVER
// deletes anything the target has that the incoming bundle doesn't — this
// is intentional so travellers can safely accept a partial update from
// someone without losing their own items. The trip's top-level fields
// aren't touched either (avoid clobbering the current traveller's edits).
// Returns the number of items added / updated.
export async function mergeBundleIntoTrip(bundle: TripBundle, targetTripId: string): Promise<number> {
  let touched = 0;

  const merge = async (kind: string, rows: any[]) => {
    for (const r of rows) {
      const local = { ...r, trip_id: targetTripId };
      try {
        // additive upsert: create if new, update-in-place if the id
        // already exists. We never remove target items that aren't in
        // the incoming bundle.
        const list: any[] = await localApi.list(kind, targetTripId);
        const existing = list.find((x) => x.id === local.id);
        if (existing) {
          await localApi.update(kind, local.id, local);
        } else {
          await localApi.create(kind, targetTripId, local);
        }
        touched += 1;
      } catch {
        /* skip broken row */
      }
    }
  };

  await merge("flights", bundle.flights || []);
  await merge("transport", bundle.transport || []);
  await merge("stays", bundle.stays || []);
  await merge("attractions", bundle.attractions || []);
  await merge("tickets", bundle.tickets || []);
  await merge("documents", bundle.documents || []);
  return touched;
}

// Attempts to find the trip in either the local store or the server
// mirror that matches this bundle's `trip.id`. Used to offer a merge
// vs. new-trip choice.
export async function findMergeCandidate(bundle: TripBundle): Promise<{ trip: any; source: "local" | "mirror" } | null> {
  const tid = bundle.trip?.id;
  if (!tid) return null;
  try {
    const t = await localApi.getTrip(tid);
    if (t) return { trip: t, source: "local" };
  } catch {}
  try {
    const t = await serverMirror.getTrip(tid);
    if (t) return { trip: t, source: "mirror" };
  } catch {}
  return null;
}
