import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, radius, spacing } from "@/src/theme";
import type { BookingStatus } from "@/src/api";

const OPTIONS: { key: BookingStatus; label: string }[] = [
  { key: "booked", label: "Booked" },
  { key: "not_booked", label: "Not Booked" },
  { key: "pay_on_arrival", label: "Pay on Arrival" },
];

export function StatusBadge({ status }: { status: BookingStatus }) {
  const map = {
    booked: { bg: colors.brandTertiary, fg: colors.onBrandTertiary, label: "Booked" },
    not_booked: { bg: "#F5E9E7", fg: colors.error, label: "Not Booked" },
    pay_on_arrival: { bg: "#F7EBD8", fg: colors.warning, label: "Pay on Arrival" },
  } as const;
  // Fall back to `not_booked` styling when the API hands us an unexpected /
  // missing status (older records, offline optimistic writes, imports).
  const cfg = map[status] ?? map.not_booked;
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg }]} testID={`status-badge-${status || "unknown"}`}>
      <Text style={[s.badgeText, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

export function StatusPicker({
  value,
  onChange,
}: {
  value: BookingStatus;
  onChange: (v: BookingStatus) => void;
}) {
  return (
    <View style={s.pickerRow}>
      {OPTIONS.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`status-option-${o.key}`}
            onPress={() => onChange(o.key)}
            style={[s.pickerChip, active && s.pickerChipActive]}
          >
            <Text style={[s.pickerText, active && s.pickerTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  pickerRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  pickerChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  pickerChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  pickerText: { fontSize: 13, color: colors.onSurface, fontWeight: "500" },
  pickerTextActive: { color: colors.onBrandPrimary },
});
