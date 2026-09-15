import React from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";

type Action = {
  key: "new" | "import" | "qr";
  icon: string;
  title: string;
  body: string;
  onPress: () => void;
};

export function AddTripMenu({
  visible,
  onClose,
  onCreate,
  onImportFile,
  onScanQr,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: () => void;
  onImportFile: () => void;
  onScanQr: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const items: Action[] = [
    {
      key: "new",
      icon: "airplane-plus",
      title: t("addMenu.create") || "Create new trip",
      body: t("addMenu.createBody") || "Start from a blank trip and fill it in.",
      onPress: () => { onClose(); onCreate(); },
    },
    {
      key: "import",
      icon: "file-upload-outline",
      title: t("addMenu.importFile") || "Import trip file",
      body: t("addMenu.importFileBody") || "Open a .travelspace.json a friend shared.",
      onPress: () => { onClose(); onImportFile(); },
    },
    {
      key: "qr",
      icon: "qrcode-scan",
      title: t("addMenu.scanQr") || "Scan a trip QR",
      body: t("addMenu.scanQrBody") || "Point your camera at someone's trip QR.",
      onPress: () => { onClose(); onScanQr(); },
    },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{t("addMenu.title") || "Add a trip"}</Text>
          {items.map((it) => (
            <Pressable key={it.key} onPress={it.onPress} style={s.row} testID={`add-menu-${it.key}`}>
              <View style={s.iconBox}>
                <Icon name={it.icon as any} size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{it.title}</Text>
                <Text style={s.rowBody}>{it.body}</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: "center", width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.borderStrong, marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface, marginBottom: 2 },
  rowBody: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
