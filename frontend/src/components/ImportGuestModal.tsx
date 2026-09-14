// One-time modal that appears the first time a user signs in with an account
// while they have guest data on the device. Offers three choices:
//   • Import — copy every trip + sub-item into the account. Guest data is
//     then cleared so the app can't get confused about two mirrors.
//   • Keep locally — dismiss for now, keep the guest data untouched. We
//     still surface a small pill later so the user can trigger the import.
//   • Discard — wipe the guest data entirely.

import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { localApi } from "@/src/localStore";
import { storage } from "@/src/utils/storage";
import { colors, radius, spacing } from "@/src/theme";

const DISMISS_KEY = "ts_guest_import_dismissed";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ImportGuestModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState<"idle" | "importing" | "discarding">("idle");
  const [tripCount, setTripCount] = React.useState(0);

  React.useEffect(() => {
    if (!visible) return;
    localApi.tripCount().then(setTripCount).catch(() => setTripCount(0));
  }, [visible]);

  const runImport = async () => {
    if (busy !== "idle") return;
    setBusy("importing");
    try {
      const snap = await localApi.snapshot();
      const importedTripIds: string[] = [];
      let skipped = 0;

      for (const t of snap.trips) {
        try {
          const created: any = await api.createTrip({
            id: t.id,
            name: t.name,
            destination: t.destination,
            start_date: t.start_date,
            end_date: t.end_date,
            category: t.category,
            cover_photo: t.cover_photo,
            budget_planned: t.budget_planned,
            currency: t.currency,
          });
          if (created?.id) importedTripIds.push(created.id);
        } catch {
          skipped += 1;
          continue;
        }

        for (const kind of ["flights", "transport", "stays", "attractions", "tickets"] as const) {
          const rows = (snap as any)[kind].filter((r: any) => r.trip_id === t.id);
          for (const row of rows) {
            try {
              await api.create(kind, t.id, row);
            } catch {
              skipped += 1;
            }
          }
        }
        // Documents last (may be biggest)
        const docs = snap.documents.filter((r: any) => r.trip_id === t.id);
        for (const d of docs) {
          try {
            await api.create("documents", t.id, d);
          } catch {
            skipped += 1;
          }
        }
      }

      await localApi.clearAll();
      await storage.setItem(DISMISS_KEY, "done");
      await qc.invalidateQueries({ queryKey: ["trips"] });
      onClose();
      if (skipped > 0) {
        Alert.alert(
          "Imported with warnings",
          `${importedTripIds.length} trip${importedTripIds.length === 1 ? "" : "s"} imported. ${skipped} item${skipped === 1 ? "" : "s"} could not be uploaded.`,
        );
      } else {
        Alert.alert("All set", `${importedTripIds.length} trip${importedTripIds.length === 1 ? "" : "s"} moved to your account.`);
      }
    } catch (e: any) {
      Alert.alert("Import failed", e.message || "Please try again in a moment.");
    } finally {
      setBusy("idle");
    }
  };

  const keepLocal = async () => {
    await storage.setItem(DISMISS_KEY, "keep");
    onClose();
  };

  const discard = async () => {
    Alert.alert(
      "Discard guest trips?",
      "This will permanently delete every trip you created before signing in. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy("discarding");
            try {
              await localApi.clearAll();
              await storage.setItem(DISMISS_KEY, "done");
              onClose();
            } finally {
              setBusy("idle");
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={keepLocal}>
      <View style={s.backdrop}>
        <View style={[s.card, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={s.iconRow}>
            <View style={s.iconWrap}>
              <Icon name="cloud-upload-outline" size={30} color={colors.brandPrimary} />
            </View>
          </View>

          <Text style={s.title}>Bring your guest trips along?</Text>
          <Text style={s.body}>
            We found {tripCount} trip{tripCount === 1 ? "" : "s"} on this device from when you were using Travel Space without an account. Import them to your Travel Space account so they sync across devices.
          </Text>

          <ScrollView style={{ maxHeight: 260 }}>
            <View style={s.bulletRow}>
              <Icon name="check-circle" size={16} color={colors.brandPrimary} />
              <Text style={s.bullet}>Every trip, tab item, ticket, and document moves over</Text>
            </View>
            <View style={s.bulletRow}>
              <Icon name="check-circle" size={16} color={colors.brandPrimary} />
              <Text style={s.bullet}>Your original ids are preserved — no broken links</Text>
            </View>
            <View style={s.bulletRow}>
              <Icon name="check-circle" size={16} color={colors.brandPrimary} />
              <Text style={s.bullet}>Guest storage is cleared once the import is done</Text>
            </View>
          </ScrollView>

          <Pressable onPress={runImport} disabled={busy !== "idle"} style={[s.primary, busy !== "idle" && { opacity: 0.6 }]} testID="import-run">
            {busy === "importing" ? <ActivityIndicator color="#fff" /> : <Icon name="download" size={18} color="#fff" />}
            <Text style={s.primaryTxt}>{busy === "importing" ? "Importing…" : `Import ${tripCount} trip${tripCount === 1 ? "" : "s"}`}</Text>
          </Pressable>

          <Pressable onPress={keepLocal} disabled={busy !== "idle"} style={s.ghost} testID="import-keep">
            <Text style={s.ghostTxt}>Keep on this device for now</Text>
          </Pressable>

          <Pressable onPress={discard} disabled={busy !== "idle"} style={s.danger} testID="import-discard">
            <Icon name="trash-can-outline" size={14} color={colors.error} />
            <Text style={s.dangerTxt}>Discard guest trips</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export async function shouldPromptImport(): Promise<boolean> {
  const dismissed = await storage.getItem<string | null>(DISMISS_KEY, null);
  if (dismissed === "done") return false;
  const has = await localApi.hasData();
  return has;
}

export async function resetImportDismissal() {
  await storage.removeItem(DISMISS_KEY);
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  iconRow: { alignItems: "center" },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  body: { fontSize: 14, color: colors.muted, lineHeight: 20, textAlign: "center" },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  bullet: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13 },
  primary: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 14,
    borderRadius: radius.pill,
  },
  primaryTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  ghost: { paddingVertical: 12, alignItems: "center" },
  ghostTxt: { color: colors.onSurfaceSecondary, fontWeight: "600" },
  danger: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10 },
  dangerTxt: { color: colors.error, fontSize: 12, fontWeight: "600" },
});
