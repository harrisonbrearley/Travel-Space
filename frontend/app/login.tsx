import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";

import { useAuth } from "@/src/auth";
import { useI18n } from "@/src/i18n";
import { colors, radius, spacing } from "@/src/theme";

const LOGO = require("../assets/images/travel-space-logo.png");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, useLocal } = useAuth();
  const { t } = useI18n();
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
      // eslint-disable-next-line react-hooks/rules-of-hooks
      await useLocal();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
        <Image source={LOGO} style={s.logo} contentFit="contain" />
        <Text style={s.title}>{t("home.title")}</Text>
        <Text style={s.blurb}>{t("login.subtitle")}</Text>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        {/* Guest mode is the recommended path — put it first, big. */}
        <Pressable
          testID="guest-btn"
          onPress={doGuest}
          disabled={busy}
          style={[s.btn, busy && { opacity: 0.7 }]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="rocket-launch-outline" size={20} color="#fff" />
              <Text style={s.btnTxt}>{t("login.guest")}</Text>
            </>
          )}
        </Pressable>

        <Pressable
          testID="google-signin-btn"
          onPress={doSignIn}
          disabled={busy}
          style={[s.btnGhost, busy && { opacity: 0.6 }]}
        >
          <Icon name="google" size={18} color={colors.onSurface} />
          <Text style={s.btnGhostTxt}>{t("login.signInGoogle")}</Text>
        </Pressable>

        <Text style={s.tos}>{t("login.tos")}</Text>
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
