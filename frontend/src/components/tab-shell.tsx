import React from "react";
import { View, Text, StyleSheet, Pressable, Modal, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";

export function ListWrapper({
  onAdd,
  addLabel,
  children,
  emptyIcon,
  emptyText,
  isEmpty,
  testID,
}: {
  onAdd: () => void;
  addLabel: string;
  children: React.ReactNode;
  emptyIcon: string;
  emptyText: string;
  isEmpty: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: 100 + insets.bottom,
          gap: spacing.md,
        }}
      >
        {isEmpty ? (
          <View style={s.empty}>
            <Icon name={emptyIcon as any} size={44} color={colors.muted} />
            <Text style={s.emptyText}>{emptyText}</Text>
          </View>
        ) : (
          children
        )}
      </ScrollView>
      <Pressable
        testID={testID || "add-fab"}
        onPress={onAdd}
        style={[s.fab, { bottom: 20 + insets.bottom }]}
      >
        <Icon name="plus" size={20} color={colors.onBrandPrimary} />
        <Text style={s.fabTxt}>{addLabel}</Text>
      </Pressable>
    </View>
  );
}

export function FormModal({
  visible,
  title,
  onClose,
  onSave,
  onDelete,
  children,
  isSaving,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
  isSaving?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.surface }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[s.modalHeader, { paddingTop: Platform.OS === "android" ? insets.top + spacing.sm : spacing.md }]}>
          <Pressable testID="modal-close" onPress={onClose} style={{ padding: spacing.sm }}>
            <Icon name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={s.modalTitle}>{title}</Text>
          <Pressable
            testID="modal-save"
            onPress={onSave}
            disabled={isSaving}
            style={s.saveBtn}
          >
            <Text style={s.saveTxt}>{isSaving ? "..." : "Save"}</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          {onDelete && (
            <Pressable testID="modal-delete" onPress={onDelete} style={s.dangerBtn}>
              <Icon name="trash-can-outline" size={18} color={colors.error} />
              <Text style={s.dangerTxt}>Delete</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { color: colors.muted, marginTop: spacing.md, fontSize: 14 },
  fab: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabTxt: { color: colors.onBrandPrimary, fontWeight: "600" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.onSurface, textAlign: "center" },
  saveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  saveTxt: { color: colors.onBrandPrimary, fontWeight: "600" },
  dangerBtn: {
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  dangerTxt: { color: colors.error, fontWeight: "600" },
});
