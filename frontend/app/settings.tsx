import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";

import { colors, radius, spacing } from "@/src/theme";
import { LANGUAGES, useI18n, type Lang } from "@/src/i18n";
import { localApi } from "@/src/localStore";

export default function SettingsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useI18n();

  const clearLocal = () => {
    Alert.alert(
      t("settings.clearLocal"),
      t("settings.clearLocalBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await localApi.clearAll();
            if (Platform.OS === "web" && typeof window !== "undefined") {
              window.location.reload();
            } else {
              router.replace("/");
            }
          },
        },
      ],
    );
  };

  const pick = (l: Lang) => setLang(l);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.top, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={s.back} testID="settings-back">
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={s.topTitle}>{t("settings.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <Text style={s.sectionLabel}>{t("settings.language")}</Text>
        <Text style={s.sectionHint}>{t("settings.languageHint")}</Text>
        <View style={s.card}>
          {LANGUAGES.map((l, i) => {
            const active = l.code === lang;
            return (
              <Pressable
                key={l.code}
                onPress={() => pick(l.code)}
                style={[s.row, i < LANGUAGES.length - 1 && s.rowDivider]}
                testID={`lang-${l.code}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{l.native}</Text>
                  {l.native !== l.label && <Text style={s.rowSub}>{l.label}</Text>}
                </View>
                <Icon
                  name={active ? "check-circle" : "circle-outline"}
                  size={22}
                  color={active ? colors.brandPrimary : colors.muted}
                />
              </Pressable>
            );
          })}
        </View>

        <Text style={s.sectionLabel}>{t("settings.localData")}</Text>
        <Pressable style={s.dangerBtn} onPress={clearLocal} testID="clear-local-btn">
          <Icon name="delete-sweep-outline" size={18} color={colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={s.dangerTitle}>{t("settings.clearLocal")}</Text>
            <Text style={s.dangerBody}>{t("settings.clearLocalBody")}</Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { padding: spacing.sm },
  topTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.onSurface },
  sectionLabel: {
    color: colors.muted,
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHint: { color: colors.muted, fontSize: 12, marginBottom: spacing.md, lineHeight: 17 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  rowSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  actionTitle: { color: colors.onSurface, fontWeight: "600", fontSize: 14 },
  actionBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.surfaceSecondary,
  },
  dangerTitle: { color: colors.error, fontWeight: "700", fontSize: 14, marginBottom: 2 },
  dangerBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
