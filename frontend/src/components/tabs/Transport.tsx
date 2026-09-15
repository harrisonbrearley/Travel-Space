import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Transport, type Ticket, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { DateTimeInput, Field, Input, niceDate, niceTime } from "@/src/components/form";
import { StatusBadge, StatusPicker } from "@/src/components/status";
import { FormModal, ListWrapper } from "@/src/components/tab-shell";
import { LocationInput } from "@/src/components/LocationInput";
import { CostInput } from "@/src/components/CostInput";
import { formatMoney } from "@/src/currency";
import { sortByDate, dateKeys } from "@/src/utils/sort";
import type { TabNav } from "@/app/trip/[id]";

const TYPES: { key: Transport["transport_type"]; label: string; icon: string }[] = [
  { key: "car", label: "Car", icon: "car" },
  { key: "bus", label: "Bus", icon: "bus" },
  { key: "train", label: "Train", icon: "train" },
  { key: "ferry", label: "Ferry", icon: "ferry" },
  { key: "other", label: "Other", icon: "dots-horizontal" },
];

const empty = (trip_id: string, currency: string): Transport => ({
  id: "",
  trip_id,
  transport_type: "car",
  departure_location: "",
  departure_latitude: null,
  departure_longitude: null,
  departure_datetime: "",
  arrival_location: "",
  arrival_latitude: null,
  arrival_longitude: null,
  arrival_datetime: "",
  booking_status: "not_booked",
  ticket_id: "",
  cost: 0,
  cost_currency: currency,
  notes: "",
});

export default function TransportTab({ trip, nav }: { trip: Trip; nav: TabNav }) {
  const qc = useQueryClient();
  const [modal, setModal] = React.useState<Transport | null>(null);

  const { data: rawData = [] } = useQuery<Transport[]>({
    queryKey: ["transport", trip.id],
    queryFn: () => api.list("transport", trip.id),
  });
  const data = React.useMemo(() => sortByDate(rawData, [...dateKeys.transport]), [rawData]);
  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ["tickets", trip.id],
    queryFn: () => api.list("tickets", trip.id),
  });

  const save = useMutation({
    mutationFn: async (t: Transport) => (t.id ? api.update("transport", t.id, t) : api.create("transport", trip.id, t)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transport", trip.id] }); setModal(null); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.remove("transport", id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transport", trip.id] }); qc.invalidateQueries({ queryKey: ["tickets", trip.id] }); setModal(null); },
  });

  const iconFor = (t: Transport["transport_type"]) => TYPES.find((x) => x.key === t)?.icon || "car";

  return (
    <>
      <ListWrapper
        isEmpty={data.length === 0}
        emptyIcon="car"
        emptyText="No transport added yet."
        onAdd={() => setModal(empty(trip.id, trip.currency))}
        addLabel="Add transport"
        testID="add-transport-fab"
      >
        {data.map((t) => {
          const ticket = tickets.find((x) => x.id === t.ticket_id);
          const focused = nav.focusId === t.id;
          return (
            <Pressable key={t.id} onPress={() => setModal(t)} style={[s.card, focused && s.cardFocused]} testID={`transport-${t.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name={iconFor(t.transport_type) as any} size={18} color={colors.brandPrimary} />
                  <Text style={s.type}>{t.transport_type.charAt(0).toUpperCase() + t.transport_type.slice(1)}</Text>
                </View>
                <StatusBadge status={t.booking_status} />
              </View>
              <View style={s.routeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.city} numberOfLines={1}>{t.departure_location || "—"}</Text>
                  <Text style={s.time}>{niceDate(t.departure_datetime)} {niceTime(t.departure_datetime)}</Text>
                </View>
                <Icon name="arrow-right" size={16} color={colors.muted} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={s.city} numberOfLines={1}>{t.arrival_location || "—"}</Text>
                  <Text style={s.time}>{niceDate(t.arrival_datetime)} {niceTime(t.arrival_datetime)}</Text>
                </View>
              </View>
              <View style={s.footRow}>
                {t.cost > 0 && <Text style={s.cost}>{formatMoney(t.cost, t.cost_currency)}</Text>}
                {ticket ? (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); nav.goToTicket(ticket.id); }} style={s.linkChip} testID={`view-ticket-${t.id}`}>
                    <Icon name="ticket-outline" size={14} color={colors.brandPrimary} />
                    <Text style={s.linkChipTxt}>View ticket</Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        })}
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
                    <Pressable key={tp.key} onPress={() => setModal({ ...modal, transport_type: tp.key })} style={[s.typeChip, active && s.typeChipActive]}>
                      <Icon name={tp.icon as any} size={16} color={active ? colors.onBrandPrimary : colors.onSurface} />
                      <Text style={[s.typeText, active && { color: colors.onBrandPrimary }]}>{tp.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
            <Field label="Departure location">
              <LocationInput
                value={{ location: modal.departure_location, latitude: modal.departure_latitude, longitude: modal.departure_longitude }}
                onChange={(v) => setModal({ ...modal, departure_location: v.location, departure_latitude: v.latitude ?? null, departure_longitude: v.longitude ?? null })}
                placeholder="Start point"
              />
            </Field>
            <Field label="Departure date & time">
              <DateTimeInput testID="input-departure-datetime" value={modal.departure_datetime} onChange={(v) => setModal({ ...modal, departure_datetime: v })} />
            </Field>
            <Field label="Arrival location">
              <LocationInput
                value={{ location: modal.arrival_location, latitude: modal.arrival_latitude, longitude: modal.arrival_longitude }}
                onChange={(v) => setModal({ ...modal, arrival_location: v.location, arrival_latitude: v.latitude ?? null, arrival_longitude: v.longitude ?? null })}
                placeholder="Destination"
              />
            </Field>
            <Field label="Arrival date & time">
              <DateTimeInput testID="input-arrival-datetime" value={modal.arrival_datetime} onChange={(v) => setModal({ ...modal, arrival_datetime: v })} />
            </Field>
            <Field label="Cost">
              <CostInput
                amount={modal.cost}
                currency={modal.cost_currency || trip.currency}
                onChange={(amount, code) => setModal({ ...modal, cost: amount, cost_currency: code })}
              />
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
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  cardFocused: { borderColor: colors.brandPrimary, borderWidth: 2 },
  type: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  routeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  city: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  time: { fontSize: 12, color: colors.muted, marginTop: 2 },
  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  cost: { fontSize: 14, fontWeight: "600", color: colors.brandPrimary },
  linkChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  linkChipTxt: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "600" },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeText: { color: colors.onSurface, fontSize: 13, fontWeight: "500" },
});
