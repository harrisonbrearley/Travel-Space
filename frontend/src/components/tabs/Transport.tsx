import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Transport, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { DateTimeInput, Field, Input, niceDate, niceTime } from "@/src/components/form";
import { StatusBadge, StatusPicker } from "@/src/components/status";
import { FormModal, ListWrapper } from "@/src/components/tab-shell";

const TYPES: { key: Transport["transport_type"]; label: string; icon: string }[] = [
  { key: "car", label: "Car", icon: "car" },
  { key: "bus", label: "Bus", icon: "bus" },
  { key: "train", label: "Train", icon: "train" },
  { key: "ferry", label: "Ferry", icon: "ferry" },
  { key: "other", label: "Other", icon: "dots-horizontal" },
];

const empty = (trip_id: string): Transport => ({
  id: "",
  trip_id,
  transport_type: "car",
  departure_location: "",
  departure_datetime: "",
  arrival_location: "",
  arrival_datetime: "",
  booking_status: "not_booked",
  ticket_id: "",
  cost: 0,
  notes: "",
});

export default function TransportTab({ trip }: { trip: Trip }) {
  const qc = useQueryClient();
  const [modal, setModal] = React.useState<Transport | null>(null);

  const { data = [] } = useQuery<Transport[]>({
    queryKey: ["transport", trip.id],
    queryFn: () => api.list("transport", trip.id),
  });

  const save = useMutation({
    mutationFn: async (t: Transport) => (t.id ? api.update("transport", t.id, t) : api.create("transport", trip.id, t)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport", trip.id] });
      setModal(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.remove("transport", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport", trip.id] });
      setModal(null);
    },
  });

  const iconFor = (t: Transport["transport_type"]) => TYPES.find((x) => x.key === t)?.icon || "car";

  return (
    <>
      <ListWrapper
        isEmpty={data.length === 0}
        emptyIcon="car"
        emptyText="No transport added yet."
        onAdd={() => setModal(empty(trip.id))}
        addLabel="Add transport"
        testID="add-transport-fab"
      >
        {data.map((t) => (
          <Pressable key={t.id} onPress={() => setModal(t)} style={s.card} testID={`transport-${t.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name={iconFor(t.transport_type) as any} size={18} color={colors.brandPrimary} />
                <Text style={s.type}>{t.transport_type.charAt(0).toUpperCase() + t.transport_type.slice(1)}</Text>
              </View>
              <StatusBadge status={t.booking_status} />
            </View>
            <View style={s.routeRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.city}>{t.departure_location || "—"}</Text>
                <Text style={s.time}>{niceDate(t.departure_datetime)} {niceTime(t.departure_datetime)}</Text>
              </View>
              <Icon name="arrow-right" size={16} color={colors.muted} />
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={s.city}>{t.arrival_location || "—"}</Text>
                <Text style={s.time}>{niceDate(t.arrival_datetime)} {niceTime(t.arrival_datetime)}</Text>
              </View>
            </View>
            {t.cost > 0 && <Text style={s.cost}>${t.cost.toFixed(2)}</Text>}
          </Pressable>
        ))}
      </ListWrapper>

      <FormModal
        visible={!!modal}
        title={modal?.id ? "Edit Transport" : "New Transport"}
        onClose={() => setModal(null)}
        onSave={() => modal && save.mutate(modal)}
        onDelete={modal?.id ? () => del.mutate(modal.id) : undefined}
        isSaving={save.isPending}
      >
        {modal && (
          <>
            <Field label="Type">
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {TYPES.map((tp) => {
                  const active = modal.transport_type === tp.key;
                  return (
                    <Pressable
                      key={tp.key}
                      onPress={() => setModal({ ...modal, transport_type: tp.key })}
                      style={[s.typeChip, active && s.typeChipActive]}
                    >
                      <Icon name={tp.icon as any} size={16} color={active ? colors.onBrandPrimary : colors.onSurface} />
                      <Text style={[s.typeText, active && { color: colors.onBrandPrimary }]}>{tp.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
            <Field label="Departure location">
              <Input value={modal.departure_location} onChangeText={(v) => setModal({ ...modal, departure_location: v })} placeholder="Start point" />
            </Field>
            <Field label="Departure date & time">
              <DateTimeInput value={modal.departure_datetime} onChange={(v) => setModal({ ...modal, departure_datetime: v })} />
            </Field>
            <Field label="Arrival location">
              <Input value={modal.arrival_location} onChangeText={(v) => setModal({ ...modal, arrival_location: v })} placeholder="Destination" />
            </Field>
            <Field label="Arrival date & time">
              <DateTimeInput value={modal.arrival_datetime} onChange={(v) => setModal({ ...modal, arrival_datetime: v })} />
            </Field>
            <Field label="Cost">
              <Input value={String(modal.cost || "")} onChangeText={(v) => setModal({ ...modal, cost: parseFloat(v) || 0 })} keyboardType="numeric" placeholder="0" />
            </Field>
            <Field label="Booking status">
              <StatusPicker value={modal.booking_status} onChange={(v) => setModal({ ...modal, booking_status: v })} />
            </Field>
            <Field label="Notes">
              <Input value={modal.notes} onChangeText={(v) => setModal({ ...modal, notes: v })} multiline placeholder="Additional details" />
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
    gap: spacing.md,
  },
  type: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  routeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  city: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  time: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cost: { fontSize: 14, fontWeight: "600", color: colors.brandPrimary },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeText: { color: colors.onSurface, fontSize: 13, fontWeight: "500" },
});
