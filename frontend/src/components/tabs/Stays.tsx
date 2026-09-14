import React from "react";
import { View, Text, StyleSheet, Pressable, Switch, Linking } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Stay, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { DateTimeInput, Field, Input, niceDate } from "@/src/components/form";
import { StatusBadge, StatusPicker } from "@/src/components/status";
import { FormModal, ListWrapper } from "@/src/components/tab-shell";

const empty = (trip_id: string): Stay => ({
  id: "",
  trip_id,
  accommodation_name: "",
  location: "",
  checkin_datetime: "",
  checkout_datetime: "",
  booking_link: "",
  breakfast_included: false,
  dinner_included: false,
  booking_status: "not_booked",
  ticket_id: "",
  cost: 0,
});

export default function StaysTab({ trip }: { trip: Trip }) {
  const qc = useQueryClient();
  const [modal, setModal] = React.useState<Stay | null>(null);

  const { data = [] } = useQuery<Stay[]>({
    queryKey: ["stays", trip.id],
    queryFn: () => api.list("stays", trip.id),
  });

  const save = useMutation({
    mutationFn: async (t: Stay) => (t.id ? api.update("stays", t.id, t) : api.create("stays", trip.id, t)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stays", trip.id] });
      setModal(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.remove("stays", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stays", trip.id] });
      setModal(null);
    },
  });

  return (
    <>
      <ListWrapper
        isEmpty={data.length === 0}
        emptyIcon="bed-outline"
        emptyText="No accommodation added yet."
        onAdd={() => setModal(empty(trip.id))}
        addLabel="Add stay"
        testID="add-stay-fab"
      >
        {data.map((t) => (
          <Pressable key={t.id} onPress={() => setModal(t)} style={s.card} testID={`stay-${t.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Icon name="bed-outline" size={18} color={colors.brandPrimary} />
                <Text style={s.name} numberOfLines={1}>{t.accommodation_name || "Accommodation"}</Text>
              </View>
              <StatusBadge status={t.booking_status} />
            </View>
            {!!t.location && <Text style={s.loc}>{t.location}</Text>}
            <View style={{ flexDirection: "row", gap: spacing.lg }}>
              <View>
                <Text style={s.smallLabel}>Check-in</Text>
                <Text style={s.smallVal}>{niceDate(t.checkin_datetime) || "—"}</Text>
              </View>
              <View>
                <Text style={s.smallLabel}>Check-out</Text>
                <Text style={s.smallVal}>{niceDate(t.checkout_datetime) || "—"}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {t.breakfast_included && <View style={s.mealTag}><Text style={s.mealTxt}>Breakfast</Text></View>}
              {t.dinner_included && <View style={s.mealTag}><Text style={s.mealTxt}>Dinner</Text></View>}
            </View>
            {t.cost > 0 && <Text style={s.cost}>${t.cost.toFixed(2)}</Text>}
          </Pressable>
        ))}
      </ListWrapper>

      <FormModal
        visible={!!modal}
        title={modal?.id ? "Edit Stay" : "New Stay"}
        onClose={() => setModal(null)}
        onSave={() => modal && save.mutate(modal)}
        onDelete={modal?.id ? () => del.mutate(modal.id) : undefined}
        isSaving={save.isPending}
      >
        {modal && (
          <>
            <Field label="Accommodation name">
              <Input value={modal.accommodation_name} onChangeText={(v) => setModal({ ...modal, accommodation_name: v })} placeholder="Hotel du Louvre" testID="input-stay-name" />
            </Field>
            <Field label="Location">
              <Input value={modal.location} onChangeText={(v) => setModal({ ...modal, location: v })} placeholder="Paris, France" />
            </Field>
            <Field label="Check-in">
              <DateTimeInput value={modal.checkin_datetime} onChange={(v) => setModal({ ...modal, checkin_datetime: v })} />
            </Field>
            <Field label="Check-out">
              <DateTimeInput value={modal.checkout_datetime} onChange={(v) => setModal({ ...modal, checkout_datetime: v })} />
            </Field>
            <Field label="Booking link">
              <Input value={modal.booking_link} onChangeText={(v) => setModal({ ...modal, booking_link: v })} placeholder="https://..." keyboardType="url" autoCapitalize="none" />
            </Field>
            <View style={s.mealRow}>
              <Text style={s.mealLabel}>Breakfast included</Text>
              <Switch value={modal.breakfast_included} onValueChange={(v) => setModal({ ...modal, breakfast_included: v })} />
            </View>
            <View style={s.mealRow}>
              <Text style={s.mealLabel}>Dinner included</Text>
              <Switch value={modal.dinner_included} onValueChange={(v) => setModal({ ...modal, dinner_included: v })} />
            </View>
            <Field label="Cost">
              <Input value={String(modal.cost || "")} onChangeText={(v) => setModal({ ...modal, cost: parseFloat(v) || 0 })} keyboardType="numeric" placeholder="0" />
            </Field>
            <Field label="Booking status">
              <StatusPicker value={modal.booking_status} onChange={(v) => setModal({ ...modal, booking_status: v })} />
            </Field>
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  name: { fontSize: 16, fontWeight: "600", color: colors.onSurface, flex: 1 },
  loc: { fontSize: 13, color: colors.muted },
  smallLabel: { fontSize: 11, color: colors.muted, marginBottom: 2 },
  smallVal: { fontSize: 13, fontWeight: "500", color: colors.onSurface },
  mealTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.brandTertiary },
  mealTxt: { fontSize: 11, color: colors.onBrandTertiary, fontWeight: "500" },
  cost: { fontSize: 14, fontWeight: "600", color: colors.brandPrimary },
  mealRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  mealLabel: { color: colors.onSurface, fontSize: 15 },
});
