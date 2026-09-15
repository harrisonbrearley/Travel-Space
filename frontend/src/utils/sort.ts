// Sorting helpers used across every tab so items are always shown in
// chronological order (earliest first). Items with no date bubble to the
// bottom so users still see them but they don't compete with dated items.

type WithDate = Record<string, any>;

function ts(v?: string | null): number {
  if (!v) return Number.POSITIVE_INFINITY;
  const t = new Date(v).getTime();
  return isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function sortByDate<T extends WithDate>(rows: T[], keys: string[]): T[] {
  // Pick the earliest defined key present on each row.
  const value = (r: T) => {
    for (const k of keys) {
      if (r[k]) return ts(r[k]);
    }
    return Number.POSITIVE_INFINITY;
  };
  return [...rows].sort((a, b) => value(a) - value(b));
}

export const dateKeys = {
  flights: ["departure_datetime", "arrival_datetime"],
  transport: ["departure_datetime", "arrival_datetime"],
  stays: ["checkin_datetime", "checkout_datetime"],
  attractions: ["activity_datetime"],
  tickets: ["created_at"],
  documents: ["created_at"],
} as const;
