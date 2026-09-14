import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";

import { useAuth } from "@/src/auth";
import { colors, radius, spacing } from "@/src/theme";

const LOGO = require("../assets/images/travel-space-logo.png");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, useLocal } = useAuth();
  const [busy, setBusy] = React.useState(false);

  const doSignIn = async () => {
    setBusy(true);
    try {
      await signIn();
    } finally {
      setBusy(false);
    }
  };

  const doGuest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await useLocal();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
        <Image source={LOGO} style={s.logo} contentFit="contain" />
        <Text style={s.title}>Travel Space</Text>
        <Text style={s.blurb}>
          Travel itinerary made easy — bring all your bookings to one Travel Space.
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <Pressable
          testID="google-signin-btn"
          onPress={doSignIn}
          disabled={busy}
          style={[s.btn, busy && { opacity: 0.7 }]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="google" size={20} color="#fff" />
              <Text style={s.btnTxt}>Sign in with Google</Text>
            </>
          )}
        </Pressable>

        <Pressable
          testID="guest-btn"
          onPress={doGuest}
          disabled={busy}
          style={[s.btnGhost, busy && { opacity: 0.6 }]}
        >
          <Icon name="wifi-off" size={18} color={colors.onSurface} />
          <Text style={s.btnGhostTxt}>Continue without signing in</Text>
        </Pressable>

        <Text style={s.tos}>
          Guest trips are stored only on this device. Sign in to sync and share across devices.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  logo: { width: 140, height: 140, marginBottom: spacing.xl, borderRadius: 32 },
  title: { fontSize: 34, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  blurb: { fontSize: 15, color: colors.muted, textAlign: "center", marginTop: spacing.md, lineHeight: 22 },
  btn: {
    backgroundColor: colors.brandPrimary,
    paddingVertical: 16,
    borderRadius: radius.pill,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
  },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 14,
    borderRadius: radius.pill,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
  },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 14 },
  tos: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: spacing.sm },
});
