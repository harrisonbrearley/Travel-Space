import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Attraction, type Ticket, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { DateTimeInput, Field, Input, niceDate, niceTime } from "@/src/components/form";
import { StatusBadge, StatusPicker } from "@/src/components/status";
import { FormModal, ListWrapper } from "@/src/components/tab-shell";
import { LocationInput } from "@/src/components/LocationInput";
import { CostInput } from "@/src/components/CostInput";
import { formatMoney } from "@/src/currency";
import type { TabNav } from "@/app/trip/[id]";

const empty = (trip_id: string, currency: string): Attraction => ({
  id: "", trip_id, name: "", website_link: "",
  activity_datetime: "", location: "", latitude: null, longitude: null,
  booking_status: "not_booked", ticket_id: "", cost: 0, cost_currency: currency, notes: "",
});

export default function AttractionsTab({ trip, nav }: { trip: Trip; nav: TabNav }) {
  const qc = useQueryClient();
  const [modal, setModal] = React.useState<Attraction | null>(null);

  const { data = [] } = useQuery<Attraction[]>({ queryKey: ["attractions", trip.id], queryFn: () => api.list("attractions", trip.id) });
  const { data: tickets = [] } = useQuery<Ticket[]>({ queryKey: ["tickets", trip.id], queryFn: () => api.list("tickets", trip.id) });

  const save = useMutation({
    mutationFn: async (t: Attraction) => (t.id ? api.update("attractions", t.id, t) : api.create("attractions", trip.id, t)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attractions", trip.id] }); setModal(null); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.remove("attractions", id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attractions", trip.id] }); qc.invalidateQueries({ queryKey: ["tickets", trip.id] }); setModal(null); },
  });

  return (
    <>
      <ListWrapper
        isEmpty={data.length === 0}
        emptyIcon="map-marker-outline"
        emptyText="No attractions added yet."
        onAdd={() => setModal(empty(trip.id, trip.currency))}
        addLabel="Add attraction"
        testID="add-attraction-fab"
      >
        {data.map((t) => {
          const ticket = tickets.find((x) => x.id === t.ticket_id);
          const focused = nav.focusId === t.id;
          return (
            <Pressable key={t.id} onPress={() => setModal(t)} style={[s.card, focused && s.cardFocused]} testID={`attraction-${t.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <Icon name="map-marker-outline" size={18} color={colors.brandPrimary} />
                  <Text style={s.name} numberOfLines={1}>{t.name || "Activity"}</Text>
                </View>
                <StatusBadge status={t.booking_status} />
              </View>
              {!!t.location && <Text style={s.loc} numberOfLines={1}>{t.location}</Text>}
              {!!t.activity_datetime && (
                <Text style={s.time}>{niceDate(t.activity_datetime)} · {niceTime(t.activity_datetime)}</Text>
              )}
              {!!t.notes && <Text style={s.notes} numberOfLines={2}>{t.notes}</Text>}
              {!!t.website_link && (
                <Pressable onPress={() => Linking.openURL(t.website_link)} style={s.linkRow}>
                  <Icon name="open-in-new" size={14} color={colors.brandPrimary} />
                  <Text style={s.linkTxt} numberOfLines={1}>{t.website_link}</Text>
                </Pressable>
              )}
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
        title={modal?.id ? "Edit Attraction" : "New Attraction"}
        onClose={() => setModal(null)}
        onSave={() => modal && save.mutate(modal)}
        onDelete={modal?.id ? () => del.mutate(modal.id) : undefined}
        isSaving={save.isPending}
      >
        {modal && (
          <>
            <Field label="Name of activity">
              <Input value={modal.name} onChangeText={(v) => setModal({ ...modal, name: v })} placeholder="Louvre Museum tour" testID="input-attraction-name" />
            </Field>
            <Field label="Location">
              <LocationInput
                value={{ location: modal.location, latitude: modal.latitude, longitude: modal.longitude }}
                onChange={(v) => setModal({ ...modal, location: v.location, latitude: v.latitude ?? null, longitude: v.longitude ?? null })}
                placeholder="Location"
              />
            </Field>
            <Field label="Date & time">
              <DateTimeInput value={modal.activity_datetime} onChange={(v) => setModal({ ...modal, activity_datetime: v })} />
            </Field>
            <Field label="Website link">
              <Input value={modal.website_link} onChangeText={(v) => setModal({ ...modal, website_link: v })} placeholder="https://..." keyboardType="url" autoCapitalize="none" />
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
            <Field label="Notes / details">
              <Input
                testID="input-attraction-notes"
                value={modal.notes}
                onChangeText={(v) => setModal({ ...modal, notes: v })}
                multiline
                placeholder="Anything you want to remember — tips, dress code, meeting point, tour operator, etc."
              />
            </Field>
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardFocused: { borderColor: colors.brandPrimary, borderWidth: 2 },
  name: { fontSize: 16, fontWeight: "600", color: colors.onSurface, flex: 1 },
  loc: { fontSize: 13, color: colors.muted },
  time: { fontSize: 13, color: colors.onSurface, fontWeight: "500" },
  notes: { fontSize: 13, color: colors.muted, fontStyle: "italic" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkTxt: { color: colors.brandPrimary, fontSize: 12, flex: 1 },
  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginTop: 4 },
  cost: { fontSize: 14, fontWeight: "600", color: colors.brandPrimary },
  linkChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  linkChipTxt: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "600" },
});
