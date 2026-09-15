// Helpers used by the AI Auto-add flow to (a) automatically pick the
// closest geocoder hit for a raw address string extracted from a photo/PDF,
// and (b) surface a small "no match" hint when the guess is too weak.
//
// The scoring is intentionally simple — Nominatim already ranks by
// relevance, but we insist on a minimum overlap with the raw string so
// we don't silently pin a booking to a wrong city.

import { api } from "@/src/api";
import { currentLang, nominatimLang } from "@/src/i18n";

export type Geo = { location: string; latitude: number | null; longitude: number | null };

// Normalise for comparison: lower-case, strip diacritics, collapse whitespace.
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Very small token-overlap score. 0..1.
function tokenScore(query: string, candidate: string): number {
  const q = norm(query);
  const c = norm(candidate);
  if (!q || !c) return 0;
  if (c.includes(q)) return 1;
  const qt = new Set(q.split(" ").filter((t) => t.length > 1));
  const ct = new Set(c.split(" ").filter((t) => t.length > 1));
  if (qt.size === 0) return 0;
  let hit = 0;
  qt.forEach((t) => { if (ct.has(t)) hit++; });
  return hit / qt.size;
}

// Auto-match: geocode the raw address in the current app language and
// return the top hit if it's above the confidence threshold. Otherwise
// return { unresolved: true }.
export async function autoMatchAddress(raw: string, threshold = 0.5): Promise<
  | { unresolved: true; original: string }
  | { unresolved: false; geo: Geo }
> {
  const input = (raw || "").trim();
  if (!input) return { unresolved: true, original: "" };

  try {
    const r = await api.geocode(input, nominatimLang(currentLang()));
    const results: { display_name: string; latitude: number; longitude: number }[] = r?.results || [];
    if (!results.length) return { unresolved: true, original: input };

    // Score by token overlap against the raw string. Nominatim's top hit
    // is usually best but occasionally lat/lon-first candidates rank
    // above a better textual match; scoring smooths that out.
    let best = results[0];
    let bestScore = tokenScore(input, best.display_name);
    for (const r of results.slice(1)) {
      const s = tokenScore(input, r.display_name);
      if (s > bestScore) { best = r; bestScore = s; }
    }

    if (bestScore < threshold) {
      return { unresolved: true, original: input };
    }
    return {
      unresolved: false,
      geo: { location: best.display_name, latitude: best.latitude, longitude: best.longitude },
    };
  } catch {
    return { unresolved: true, original: input };
  }
}
