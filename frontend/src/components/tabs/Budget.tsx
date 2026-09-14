import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Attraction, type Flight, type Stay, type Ticket, type Transport, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { convert, formatMoney, useRates } from "@/src/currency";

export default function BudgetTab({ trip }: { trip: Trip }) {
  const insets = useSafeAreaInsets();
  const tripCur = trip.currency || "USD";
  const rates = useRates();

  const { data: flights = [] } = useQuery<Flight[]>({ queryKey: ["flights", trip.id], queryFn: () => api.list("flights", trip.id) });
  const { data: transport = [] } = useQuery<Transport[]>({ queryKey: ["transport", trip.id], queryFn: () => api.list("transport", trip.id) });
  const { data: stays = [] } = useQuery<Stay[]>({ queryKey: ["stays", trip.id], queryFn: () => api.list("stays", trip.id) });
  const { data: attractions = [] } = useQuery<Attraction[]>({ queryKey: ["attractions", trip.id], queryFn: () => api.list("attractions", trip.id) });
  const { data: tickets = [] } = useQuery<Ticket[]>({ queryKey: ["tickets", trip.id], queryFn: () => api.list("tickets", trip.id) });

  const sumConverted = (items: { cost: number; cost_currency?: string }[]) =>
    items.reduce((a, i) => a + convert(i.cost || 0, i.cost_currency || tripCur, tripCur, rates.data?.rates), 0);

  const cat = [
    { key: "flights", label: "Flights", icon: "airplane", items: flights as any[] },
    { key: "transport", label: "Transport", icon: "car", items: transport as any[] },
    { key: "stays", label: "Stays", icon: "bed-outline", items: stays as any[] },
    { key: "attractions", label: "Attractions", icon: "map-marker-outline", items: attractions as any[] },
    { key: "tickets", label: "Tickets", icon: "ticket-outline", items: tickets as any[] },
  ].map((c) => ({ ...c, total: sumConverted(c.items) }));

  const spent = cat.reduce((a, c) => a + c.total, 0);
  const planned = trip.budget_planned || 0;
  const remaining = planned - spent;
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : 0;
  const over = spent > planned && planned > 0;

  const hasMixedCurrencies = new Set(
    [...flights, ...transport, ...stays, ...attractions, ...tickets]
      .map((i: any) => (i.cost > 0 ? (i.cost_currency || tripCur) : null))
      .filter(Boolean)
  ).size > 1;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
      <View style={s.hero}>
        <Text style={s.heroLabel}>Total spent · in {tripCur}</Text>
        <Text style={s.heroAmt}>{formatMoney(spent, tripCur)}</Text>
        <Text style={s.heroPlanned}>of {formatMoney(planned, tripCur)} planned</Text>

        <View style={s.barBg}>
          <View style={[s.barFill, { width: `${pct}%`, backgroundColor: over ? colors.error : colors.brandPrimary }]} />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md }}>
          <View>
            <Text style={s.pillLabel}>Remaining</Text>
            <Text style={[s.pillVal, over && { color: colors.error }]}>
              {over ? "-" : ""}{formatMoney(Math.abs(remaining), tripCur)}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.pillLabel}>Used</Text>
            <Text style={s.pillVal}>{planned > 0 ? `${pct.toFixed(0)}%` : "—"}</Text>
          </View>
        </View>

        {hasMixedCurrencies && (
          <View style={s.fxNote}>
            <Icon name="swap-horizontal" size={12} color={colors.brandPrimary} />
            <Text style={s.fxNoteTxt}>Mixed currencies auto-converted at today's rate</Text>
          </View>
        )}
      </View>

      <Text style={s.sectionTitle}>Breakdown</Text>
      {cat.map((c) => (
        <View key={c.key} style={s.row}>
          <View style={s.iconWrap}>
            <Icon name={c.icon as any} size={18} color={colors.brandPrimary} />
          </View>
          <Text style={s.rowLabel}>{c.label}</Text>
          <Text style={s.rowAmt}>{formatMoney(c.total, tripCur)}</Text>
        </View>
      ))}

      <View style={[s.row, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.lg }]}>
        <View style={s.iconWrap}>
          <Icon name="cash-multiple" size={18} color={colors.brandPrimary} />
        </View>
        <Text style={[s.rowLabel, { fontWeight: "700" }]}>Total</Text>
        <Text style={[s.rowAmt, { fontWeight: "700" }]}>{formatMoney(spent, tripCur)}</Text>
      </View>

      {planned === 0 && (
          <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.xl }}>
            Set a planned budget in trip details to see remaining amount.
          </Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  heroLabel: { color: colors.muted, fontSize: 13 },
  heroAmt: { fontSize: 36, fontWeight: "700", color: colors.onSurface, letterSpacing: -1, marginTop: 4 },
  heroPlanned: { color: colors.muted, fontSize: 14, marginTop: 2 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, marginTop: spacing.lg, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  pillLabel: { color: colors.muted, fontSize: 12 },
  pillVal: { fontSize: 16, fontWeight: "600", color: colors.onSurface, marginTop: 2 },
  fxNote: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  fxNoteTxt: { color: colors.muted, fontSize: 11 },
  sectionTitle: { fontSize: 13, color: colors.muted, marginTop: spacing.lg, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, color: colors.onSurface },
  rowAmt: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
});
