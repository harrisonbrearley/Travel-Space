import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import React from "react";
import { ActivityIndicator, LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Icon from "@react-native-vector-icons/material-design-icons";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth";
import { SyncProvider } from "@/src/syncWorker";
import { LanguageProvider } from "@/src/i18n";
import { setupPwa } from "@/src/pwa";
import { colors } from "@/src/theme";

// Prewarm icon font
Icon.getImageSource("home", 16, "#000").catch(() => {});

// Register the PWA manifest, meta tags and service worker as early as
// possible on web. No-op on native.
setupPwa();

LogBox.ignoreAllLogs(true);

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, isLocal, useLocal } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const inPublic = segments[0] === "share" || segments[0] === "invite";

  // Auto-enter local mode on first launch — the app is 100% local now,
  // there's no sign-in step and no cloud sync.
  React.useEffect(() => {
    if (!loading && !isLocal) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useLocal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLocal]);

  React.useEffect(() => {
    // If a stale /login route is on the stack, bounce back home.
    if (segments[0] === "login") router.replace("/");
  }, [segments, router]);

  if (loading || (!isLocal && !inPublic)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return <>{children}</>;
}

// SyncProvider is a no-op now (no server sync), but kept around so the
// hook `useSync()` still returns something callers can read.
function SyncGateway({ children }: { children: React.ReactNode }) {
  return <SyncProvider enabled={false}>{children}</SyncProvider>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <AuthProvider>
              <LanguageProvider>
                <AuthGate>
                  <SyncGateway>
                    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
                  </SyncGateway>
                </AuthGate>
              </LanguageProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
