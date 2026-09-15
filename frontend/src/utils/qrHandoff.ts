// QR-code handoff for compact trips.
//
// QR codes have hard capacity limits (~2953 alphanumeric / ~1817 bytes in
// byte mode at version 40 with L error correction). To fit a trip we:
//   1. Strip attachments (document + ticket blobs).
//   2. Serialize with the shortest keys / no whitespace.
//   3. Deflate with pako, then base64url-encode so it's QR-safe.
// If the resulting payload still exceeds a safe QR threshold we surface an
// error so the caller can fall back to file export.

import { deflate, inflate } from "pako";
import { parseBundle, TRIP_FILE_SCHEMA, type TripBundle } from "./tripExport";

const QR_MAX = 2200; // conservative to keep density readable

// Base64URL codec (browser-safe, no padding).
function toBase64Url(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== "undefined"
    ? btoa(str)
    : Buffer.from(str, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const raw = typeof atob !== "undefined"
    ? atob(b64)
    : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Trim heavy fields to squeeze the trip into a QR payload.
function shrinkBundle(bundle: TripBundle): TripBundle {
  const stripBlob = <T extends Record<string, any>>(r: T): T => {
    const { file_base64, ...rest } = r as any;
    return { ...rest, file_base64: "" } as T;
  };
  return {
    ...bundle,
    tickets: (bundle.tickets || []).map(stripBlob),
    documents: (bundle.documents || []).map(stripBlob),
  };
}

export function encodeTripToQr(bundle: TripBundle): { payload: string; bytes: number; withinLimit: boolean } {
  const shrunk = shrinkBundle(bundle);
  const json = JSON.stringify(shrunk);
  const deflated = deflate(json);
  const payload = "TSQR1:" + toBase64Url(deflated);
  return { payload, bytes: payload.length, withinLimit: payload.length <= QR_MAX };
}

export function decodeQrToBundle(raw: string): TripBundle {
  const trimmed = (raw || "").trim();
  if (!trimmed.startsWith("TSQR1:")) throw new Error("invalid_qr");
  const body = trimmed.slice(6);
  let bytes: Uint8Array;
  try { bytes = fromBase64Url(body); } catch { throw new Error("invalid_qr"); }
  let json: string;
  try {
    json = inflate(bytes, { to: "string" });
  } catch {
    throw new Error("invalid_qr");
  }
  const parsed = parseBundle(json);
  if (parsed.schema !== TRIP_FILE_SCHEMA) throw new Error("invalid_schema");
  return parsed;
}
