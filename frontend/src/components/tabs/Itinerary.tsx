import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Attraction, type Flight, type Stay, type Trip, type Transport } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { niceTime } from "@/src/components/form";

type Item = {
  id: string;
  category: "flights" | "transport" | "stay" | "attractions";
  when: string;
  endWhen?: string;
  title: string;
  subtitle?: string;
  icon: string;
};

const FILTERS: { key: keyof Trip["itinerary_filters"]; label: string; icon: string }[] = [
  { key: "flights", label: "Flights", icon: "airplane" },
  { key: "transport", label: "Transport", icon: "car" },
  { key: "stay", label: "Stay", icon: "bed-outline" },
  { key: "attractions", label: "Attractions", icon: "map-marker-outline" },
];

export default function ItineraryTab({ trip }: { trip: Trip }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: flights = [] } = useQuery<Flight[]>({ queryKey: ["flights", trip.id], queryFn: () => api.list("flights", trip.id) });
  const { data: transport = [] } = useQuery<Transport[]>({ queryKey: ["transport", trip.id], queryFn: () => api.list("transport", trip.id) });
  const { data: stays = [] } = useQuery<Stay[]>({ queryKey: ["stays", trip.id], queryFn: () => api.list("stays", trip.id) });
  const { data: attractions = [] } = useQuery<Attraction[]>({ queryKey: ["attractions", trip.id], queryFn: () => api.list("attractions", trip.id) });

  const updateFilters = useMutation({
    mutationFn: (filters: any) => api.updateTrip(trip.id, { itinerary_filters: filters }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", trip.id] }),
  });

  const filters = trip.itinerary_filters || {};

  const items: Item[] = React.useMemo(() => {
    const list: Item[] = [];
    if (filters.flights) {
      flights.forEach((f) => {
        if (f.departure_datetime) {
          list.push({
            id: f.id,
            category: "flights",
            when: f.departure_datetime,
            endWhen: f.arrival_datetime,
            title: `${f.airline || "Flight"} ${f.flight_number}`.trim(),
            subtitle: `${f.departure_location} → ${f.arrival_location}`,
            icon: "airplane",
          });
        }
      });
    }
    if (filters.transport) {
      transport.forEach((t) => {
        if (t.departure_datetime) {
          list.push({
            id: t.id,
            category: "transport",
            when: t.departure_datetime,
            endWhen: t.arrival_datetime,
            title: `${t.transport_type.charAt(0).toUpperCase() + t.transport_type.slice(1)}`,
            subtitle: `${t.departure_location} → ${t.arrival_location}`,
            icon: iconFor(t.transport_type),
          });
        }
      });
    }
    if (filters.stay) {
      stays.forEach((sItem) => {
        if (sItem.checkin_datetime) {
          list.push({
            id: sItem.id + "-in",
            category: "stay",
            when: sItem.checkin_datetime,
            title: `Check in: ${sItem.accommodation_name}`,
            subtitle: sItem.location,
            icon: "bed-outline",
          });
        }
        if (sItem.checkout_datetime) {
          list.push({
            id: sItem.id + "-out",
            category: "stay",
            when: sItem.checkout_datetime,
            title: `Check out: ${sItem.accommodation_name}`,
            subtitle: sItem.location,
            icon: "logout",
          });
        }
      });
    }
    if (filters.attractions) {
      attractions.forEach((a) => {
        if (a.activity_datetime) {
          list.push({
            id: a.id,
            category: "attractions",
            when: a.activity_datetime,
            title: a.name || "Activity",
            subtitle: a.location,
            icon: "map-marker-outline",
          });
        }
      });
    }
    return list.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  }, [filters, flights, transport, stays, attractions]);

  // Group by day
  const groups: { day: string; label: string; items: Item[] }[] = React.useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach((i) => {
      const d = new Date(i.when);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return Array.from(map.entries()).map(([day, list]) => ({
      day,
      label: dayLabel(day, trip.start_date),
      items: list,
    }));
  }, [items, trip.start_date]);

  const toggle = (key: string) => {
    const next = { ...filters, [key]: !filters[key] };
    updateFilters.mutate(next);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.filtersWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}
        >
          {FILTERS.map((f) => {
            const on = filters[f.key] !== false;
            return (
              <Pressable
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => toggle(f.key)}
                style={[s.filterChip, on && s.filterChipActive]}
              >
                <Icon
                  name={on ? "check" : (f.icon as any)}
                  size={14}
                  color={on ? colors.onBrandPrimary : colors.onSurface}
                />
                <Text style={[s.filterTxt, on && { color: colors.onBrandPrimary }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}>
        {groups.length === 0 ? (
          <View style={s.empty}>
            <Icon name="calendar-blank-outline" size={44} color={colors.muted} />
            <Text style={s.emptyTitle}>Your itinerary will build itself</Text>
            <Text style={s.emptySub}>
              Add flights, stays, transport, or attractions with dates, and they will appear here automatically.
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.day}>
              <View style={s.dayHeader}>
                <Text style={s.dayLabel}>{g.label}</Text>
                <Text style={s.dayDate}>{formatDayHeader(g.day)}</Text>
              </View>
              <View style={{ gap: spacing.sm }}>
                {g.items.map((i, idx) => (
                  <View key={i.id} style={s.tlRow}>
                    <View style={s.tlLine}>
                      <View style={s.tlDot}>
                        <Icon name={i.icon as any} size={12} color={colors.onBrandPrimary} />
                      </View>
                      {idx < g.items.length - 1 && <View style={s.tlBar} />}
                    </View>
                    <View style={s.tlCard}>
                      <Text style={s.tlTime}>
                        {niceTime(i.when)}
                        {i.endWhen ? ` – ${niceTime(i.endWhen)}` : ""}
                      </Text>
                      <Text style={s.tlTitle}>{i.title}</Text>
                      {!!i.subtitle && <Text style={s.tlSub}>{i.subtitle}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function iconFor(t: string) {
  return { car: "car", bus: "bus", train: "train", ferry: "ferry", other: "dots-horizontal" }[t] || "car";
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dayLabel(day: string, tripStart: string) {
  if (!tripStart) return `Day`;
  const start = new Date(tripStart);
  const cur = new Date(day);
  const diff = Math.floor((cur.getTime() - new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? `Day ${diff + 1}` : "Before Trip";
}

function formatDayHeader(day: string) {
  const d = new Date(day);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const s = StyleSheet.create({
  filtersWrap: {
    height: 56,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChip: {
    height: 36,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  filterChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  filterTxt: { fontSize: 13, color: colors.onSurface, fontWeight: "500" },
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface, marginTop: spacing.md },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 6 },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.md,
  },
  dayLabel: { fontSize: 18, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.3 },
  dayDate: { fontSize: 13, color: colors.muted },
  tlRow: { flexDirection: "row", gap: spacing.md },
  tlLine: { alignItems: "center", width: 24, paddingTop: 8 },
  tlDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  tlBar: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2, minHeight: 20 },
  tlCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  tlTime: { color: colors.brandPrimary, fontWeight: "600", fontSize: 12 },
  tlTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  tlSub: { color: colors.muted, fontSize: 13 },
});
