// Runtime PWA bootstrap for the web build.
//
// Expo Router with `web.output: "single"` serves a static template
// `index.html` and doesn't honour our `app/+html.tsx`, so we install the
// manifest link, PWA meta tags, and the service worker imperatively on
// mount. Chrome/Edge accept a dynamically-added `<link rel="manifest">`
// for install eligibility, and iOS only needs `apple-*` meta tags which
// we inject the same way.
//
// This module is a no-op on native and on server-side rendering.

import { Platform } from "react-native";

const HEAD_TAGS: Array<{
  tag: "link" | "meta";
  attrs: Record<string, string>;
  key: string;
}> = [
  { tag: "link",  attrs: { rel: "manifest", href: "/manifest.json" }, key: "manifest" },
  { tag: "meta",  attrs: { name: "theme-color", content: "#6B8E7A" }, key: "theme-color" },
  { tag: "meta",  attrs: { name: "application-name", content: "Travel Space" }, key: "application-name" },
  { tag: "meta",  attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, key: "apple-cap" },
  { tag: "meta",  attrs: { name: "apple-mobile-web-app-title", content: "Travel Space" }, key: "apple-title" },
  { tag: "meta",  attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" }, key: "apple-status" },
  { tag: "meta",  attrs: { name: "mobile-web-app-capable", content: "yes" }, key: "mobile-cap" },
  { tag: "link",  attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }, key: "apple-icon" },
  { tag: "link",  attrs: { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" }, key: "favicon-32" },
  // Better viewport for notched devices in installed mode
  { tag: "meta",  attrs: { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" }, key: "viewport" },
];

function upsertHead() {
  if (typeof document === "undefined") return;
  const head = document.head;
  for (const item of HEAD_TAGS) {
    // For known singletons we look up by name / rel to replace any existing
    // node so we don't leave two viewport metas around.
    let selector = "";
    if (item.tag === "link") selector = `link[rel="${item.attrs.rel}"]`;
    if (item.tag === "meta") selector = item.attrs.name ? `meta[name="${item.attrs.name}"]` : "";
    if (selector) {
      const existing = head.querySelector(selector);
      if (existing) existing.remove();
    }
    const el = document.createElement(item.tag);
    for (const [k, v] of Object.entries(item.attrs)) el.setAttribute(k, v);
    head.appendChild(el);
  }
}

function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Don't register on Metro dev origin — hot reload swaps chunks aggressively
  // and a stale SW cache would break dev.
  const host = window.location.hostname;
  const port = window.location.port;
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  const isDevPort = port === "3000" || port === "19006";
  if (isLocalHost && isDevPort) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    /* silent — install / offline still work via localStore */
  });
}

let installed = false;

export function setupPwa() {
  if (installed) return;
  if (Platform.OS !== "web") return;
  installed = true;
  upsertHead();
  // Delay SW registration until after the first paint so it doesn't compete
  // with the initial JS bundle.
  if (typeof window !== "undefined") {
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });
  }
}
