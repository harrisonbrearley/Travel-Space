// Cross-platform WebView adapter.
//
// `react-native-webview` on web throws "React Native WebView does not
// support this platform". For a PWA build (Vercel, Netlify, plain
// static hosting) we need a web-safe alternative that still exposes the
// same surface — HTML `source`, `onMessage` bridge, and a ref.
//
// This module re-exports the native WebView on iOS/Android and provides
// an <iframe srcDoc> shim on web that wires a window.postMessage bridge
// so `window.ReactNativeWebView.postMessage(...)` inside the HTML keeps
// working (the map picker uses that).

import React from "react";
import { Platform } from "react-native";

// Web implementation: iframe with a postMessage bridge.
function WebViewWeb(props: any) {
  const html: string = props.source?.html || "";
  const onMessage = props.onMessage;
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const patched = React.useMemo(() => injectBridge(html), [html]);

  React.useEffect(() => {
    if (!onMessage) return;
    const handler = (evt: MessageEvent) => {
      if (iframeRef.current && evt.source !== iframeRef.current.contentWindow) return;
      onMessage({ nativeEvent: { data: typeof evt.data === "string" ? evt.data : JSON.stringify(evt.data) } });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMessage]);

  const style = { border: 0, width: "100%", height: "100%", ...(props.style || {}) };
  return (
    // @ts-ignore React DOM iframe is fine inside React Native Web.
    <iframe
      ref={iframeRef}
      srcDoc={patched}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      style={style}
      title={props.testID || "webview"}
      data-testid={props.testID}
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}

// Injects a small shim so pages that call
// `window.ReactNativeWebView.postMessage(...)` inside their HTML keep
// working when embedded in an iframe.
function injectBridge(html: string): string {
  const bridge = `
    <script>
      (function () {
        try {
          if (!window.ReactNativeWebView) {
            window.ReactNativeWebView = {
              postMessage: function (data) {
                try { window.parent.postMessage(data, '*'); } catch (e) {}
              }
            };
          }
        } catch (e) {}
      })();
    </script>
  `;
  // Insert right after <head> if present, otherwise prepend.
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
  }
  return bridge + html;
}

let ImplWebView: React.ComponentType<any> = WebViewWeb;

if (Platform.OS !== "web") {
  // On native, use the real thing. Requiring dynamically stops web bundles
  // from trying to include native code that would fail at import time.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ImplWebView = require("react-native-webview").WebView;
  } catch {
    ImplWebView = WebViewWeb;
  }
}

export const WebView = ImplWebView;
export default WebView;
