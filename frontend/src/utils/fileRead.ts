// Cross-platform "read a file URI as base64" helper.
//
// expo-file-system/legacy's `readAsStringAsync` works fine for real file://
// paths but throws on many DocumentPicker URIs — particularly content://
// URIs on Android under Expo Go, and blob: URLs on web where the legacy
// module isn't implemented at all.
//
// The fetch()/FileReader dance below works uniformly across web, native
// Expo Go, and prebuild native — DocumentPicker copies the file to the
// app cache (copyToCacheDirectory: true) before returning, so `fetch` can
// always resolve it.

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export async function readUriAsBase64(uri: string): Promise<string> {
  if (!uri) throw new Error("empty uri");

  // Web: no FileSystem, but blob: and data: are both fetch-able. Same for
  // http(s) URLs used by tests / dev builds.
  if (Platform.OS === "web") {
    return await fetchToBase64(uri);
  }

  // Native: try the legacy FileSystem call first; if it throws (common
  // for content:// URIs) fall back to fetch() which handles them fine.
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  } catch {
    return await fetchToBase64(uri);
  }
}

async function fetchToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  if (!res.ok && res.status !== 0) throw new Error(`fetch failed ${res.status}`);
  const blob = await res.blob();
  return await blobToBase64(blob);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const str = String(reader.result || "");
      // Strip the "data:...;base64," prefix if present.
      const idx = str.indexOf(",");
      resolve(idx >= 0 ? str.slice(idx + 1) : str);
    };
    reader.readAsDataURL(blob);
  });
}
