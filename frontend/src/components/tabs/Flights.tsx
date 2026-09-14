import React from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, Linking } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Flight, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { DateTimeInput, Field, Input, niceDate, niceTime } from "@/src/components/form";
import { StatusBadge, StatusPicker } from "@/src/components/status";
import { FormModal, ListWrapper } from "@/src/components/tab-shell";

const empty = (trip_id: string): Flight => ({
  id: "",
  trip_id,
  flight_number: "",
  airline: "",
  departure_location: "",
  departure_datetime: "",
  arrival_location: "",
  arrival_datetime: "",
  layovers: [],
  booking_status: "not_booked",
  ticket_id: "",
  cost: 0,
  notes: "",
});

export default function FlightsTab({ trip }: { trip: Trip }) {
  const qc = useQueryClient();
  const [modal, setModal] = React.useState<Flight | null>(null);
  const [aiText, setAiText] = React.useState("");
  const [showAI, setShowAI] = React.useState(false);

  const { data: flights = [] } = useQuery<Flight[]>({
    queryKey: ["flights", trip.id],
    queryFn: () => api.list("flights", trip.id),
  });

  const save = useMutation({
    mutationFn: async (f: Flight) => {
      if (f.id) return api.update("flights", f.id, f);
      return api.create("flights", trip.id, f);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flights", trip.id] });
      setModal(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.remove("flights", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flights", trip.id] });
      setModal(null);
    },
  });
  const parseAI = useMutation({
    mutationFn: (text: string) => api.parseFlight(text),
    onSuccess: (parsed: any) => {
      setModal((m) => ({ ...(m || empty(trip.id)), ...parsed }));
      setShowAI(false);
      setAiText("");
    },
    onError: (e: any) => {
      Alert.alert("Parse failed", "Could not extract flight details. Try again or fill manually.");
    },
  });

  return (
    <>
      <ListWrapper
        isEmpty={flights.length === 0}
        emptyIcon="airplane"
        emptyText="No flights yet. Add one to build your itinerary."
        onAdd={() => setModal(empty(trip.id))}
        addLabel="Add flight"
        testID="add-flight-fab"
      >
        {flights.map((f) => (
          <Pressable
            key={f.id}
            testID={`flight-${f.id}`}
            onPress={() => setModal(f)}
            style={s.card}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="airplane" size={18} color={colors.brandPrimary} />
                <Text style={s.flightNum}>{f.airline || "Flight"} {f.flight_number}</Text>
              </View>
              <StatusBadge status={f.booking_status} />
            </View>
            <View style={s.routeRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.city}>{f.departure_location || "—"}</Text>
                <Text style={s.time}>{niceDate(f.departure_datetime)}</Text>
                <Text style={s.time}>{niceTime(f.departure_datetime)}</Text>
              </View>
              <Icon name="arrow-right" size={18} color={colors.muted} />
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={s.city}>{f.arrival_location || "—"}</Text>
                <Text style={s.time}>{niceDate(f.arrival_datetime)}</Text>
                <Text style={s.time}>{niceTime(f.arrival_datetime)}</Text>
              </View>
            </View>
            {f.layovers.length > 0 && (
              <Text style={s.layoverText}>
                {f.layovers.length} layover{f.layovers.length > 1 ? "s" : ""}: {f.layovers.map((l) => l.location).join(", ")}
              </Text>
            )}
            {f.cost > 0 && <Text style={s.cost}>${f.cost.toFixed(2)}</Text>}
          </Pressable>
        ))}
      </ListWrapper>

      <FormModal
        visible={!!modal}
        title={modal?.id ? "Edit Flight" : "New Flight"}
        onClose={() => setModal(null)}
        onSave={() => modal && save.mutate(modal)}
        onDelete={modal?.id ? () => del.mutate(modal.id) : undefined}
        isSaving={save.isPending}
      >
        {modal && (
          <>
            <Pressable
              testID="ai-parse-btn"
              onPress={() => setShowAI(true)}
              style={s.aiBtn}
            >
              <Icon name="auto-fix" size={18} color={colors.brandPrimary} />
              <Text style={s.aiTxt}>Auto-fill from booking confirmation</Text>
            </Pressable>

            {showAI && (
              <View style={s.aiBox}>
                <Text style={s.aiLabel}>Paste your flight booking confirmation:</Text>
                <Input
                  testID="ai-input"
                  value={aiText}
                  onChangeText={setAiText}
                  multiline
                  placeholder="Paste confirmation email text..."
                />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Pressable
                    onPress={() => {
                      setShowAI(false);
                      setAiText("");
                    }}
                    style={[s.aiActionBtn, { backgroundColor: colors.surfaceTertiary }]}
                  >
                    <Text style={{ color: colors.onSurface }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    testID="ai-extract-btn"
                    onPress={() => parseAI.mutate(aiText)}
                    disabled={!aiText.trim() || parseAI.isPending}
                    style={[s.aiActionBtn, { backgroundColor: colors.brandPrimary }]}
                  >
                    {parseAI.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={{ color: colors.onBrandPrimary, fontWeight: "600" }}>Extract</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            <Field label="Airline">
              <Input value={modal.airline} onChangeText={(v) => setModal({ ...modal, airline: v })} placeholder="Delta" testID="input-airline" />
            </Field>
            <Field label="Flight number">
              <Input value={modal.flight_number} onChangeText={(v) => setModal({ ...modal, flight_number: v })} placeholder="DL 456" testID="input-flight-number" />
            </Field>
            <Field label="Departure location">
              <Input value={modal.departure_location} onChangeText={(v) => setModal({ ...modal, departure_location: v })} placeholder="JFK, New York" />
            </Field>
            <Field label="Departure date & time">
              <DateTimeInput value={modal.departure_datetime} onChange={(v) => setModal({ ...modal, departure_datetime: v })} />
            </Field>
            <Field label="Arrival location">
              <Input value={modal.arrival_location} onChangeText={(v) => setModal({ ...modal, arrival_location: v })} placeholder="CDG, Paris" />
            </Field>
            <Field label="Arrival date & time">
              <DateTimeInput value={modal.arrival_datetime} onChange={(v) => setModal({ ...modal, arrival_datetime: v })} />
            </Field>

            <Field label="Layovers">
              {modal.layovers.map((l, i) => (
                <View key={i} style={s.layoverCard}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontWeight: "600", color: colors.onSurface }}>Layover {i + 1}</Text>
                    <Pressable onPress={() => setModal({ ...modal, layovers: modal.layovers.filter((_, j) => j !== i) })}>
                      <Icon name="close" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                  <Input
                    value={l.location}
                    onChangeText={(v) => {
                      const next = [...modal.layovers];
                      next[i] = { ...l, location: v };
                      setModal({ ...modal, layovers: next });
                    }}
                    placeholder="City / Airport"
                  />
                  <View style={{ height: 8 }} />
                  <DateTimeInput
                    value={l.arrival_datetime}
                    onChange={(v) => {
                      const next = [...modal.layovers];
                      next[i] = { ...l, arrival_datetime: v };
                      setModal({ ...modal, layovers: next });
                    }}
                    placeholder="Arrival"
                  />
                  <View style={{ height: 8 }} />
                  <DateTimeInput
                    value={l.departure_datetime}
                    onChange={(v) => {
                      const next = [...modal.layovers];
                      next[i] = { ...l, departure_datetime: v };
                      setModal({ ...modal, layovers: next });
                    }}
                    placeholder="Departure"
                  />
                </View>
              ))}
              <Pressable
                testID="add-layover-btn"
                onPress={() =>
                  setModal({
                    ...modal,
                    layovers: [...modal.layovers, { location: "", arrival_datetime: "", departure_datetime: "" }],
                  })
                }
                style={s.addLayoverBtn}
              >
                <Icon name="plus" size={16} color={colors.brandPrimary} />
                <Text style={{ color: colors.brandPrimary, fontWeight: "500" }}>Add layover</Text>
              </Pressable>
            </Field>

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
    gap: spacing.md,
  },
  flightNum: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  routeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  city: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  time: { fontSize: 12, color: colors.muted, marginTop: 2 },
  layoverText: { fontSize: 12, color: colors.muted },
  cost: { fontSize: 14, fontWeight: "600", color: colors.brandPrimary },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  aiTxt: { color: colors.onBrandTertiary, fontWeight: "500" },
  aiBox: {
    padding: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  aiLabel: { color: colors.muted, marginBottom: 8, fontSize: 13 },
  aiActionBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  layoverCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    marginBottom: spacing.sm,
  },
  addLayoverBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    borderStyle: "dashed",
    justifyContent: "center",
  },
});
