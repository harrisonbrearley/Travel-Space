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
import { colors } from "@/src/theme";

// Prewarm icon font
Icon.getImageSource("home", 16, "#000").catch(() => {});

LogBox.ignoreAllLogs(true);

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, user, isLocal } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const inPublic = segments[0] === "share" || segments[0] === "invite";
  const onLogin = segments[0] === "login";
  const authed = !!user || isLocal;

  React.useEffect(() => {
    if (loading) return;
    if (inPublic) return;
    if (!authed && !onLogin) {
      router.replace("/login");
    } else if (authed && onLogin) {
      router.replace("/");
    }
  }, [loading, authed, inPublic, onLogin, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return <>{children}</>;
}

// Enables the offline sync worker only when the user is signed in.
// Guest / local mode never queues to the server.
function SyncGateway({ children }: { children: React.ReactNode }) {
  const { user, isLocal } = useAuth();
  return <SyncProvider enabled={!!user && !isLocal}>{children}</SyncProvider>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <AuthProvider>
              <AuthGate>
                <SyncGateway>
                  <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
                </SyncGateway>
              </AuthGate>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
