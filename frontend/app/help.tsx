import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";

import { colors, radius, spacing } from "@/src/theme";

const FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: "airplane-takeoff",
    title: "Trips",
    body: "Organise trips into Upcoming, Past, and Wishlist. Each card shows a live countdown so you always know how close your next adventure is.",
  },
  {
    icon: "calendar-blank-outline",
    title: "Itinerary",
    body: "Every dated flight, transport, stay, and attraction is auto-arranged into a day-by-day timeline. Use the chips at the top to hide any category you don't want to see.",
  },
  {
    icon: "map-outline",
    title: "Map",
    body: "Locations from all your items are plotted chronologically with a route line. Toggle categories on the map to focus on just flights, stays, etc.",
  },
  {
    icon: "airplane",
    title: "Flights",
    body: "Airline, flight number, departure and arrival with dates, times, and airports. Add multiple layovers with their own coordinates.",
  },
  {
    icon: "car",
    title: "Transport",
    body: "Cars, buses, trains, ferries — anything that moves you between places. Includes route, times, cost, and booking status.",
  },
  {
    icon: "bed-outline",
    title: "Stay",
    body: "Hotels and accommodation with check-in / check-out times, breakfast and dinner switches, and links back to your booking site.",
  },
  {
    icon: "map-marker-outline",
    title: "Attractions",
    body: "Tours, museum tickets, activities. Includes a notes field for extra details like dress code, meeting point, or tour operator.",
  },
  {
    icon: "ticket-outline",
    title: "Tickets",
    body: "One place for every ticket. Upload a photo (portrait or landscape), attach a link, and link the ticket to a flight, stay, transport or attraction.",
  },
  {
    icon: "cash-multiple",
    title: "Budget",
    body: "Pick a currency for your trip. Every item can have its own currency (like 5400 NOK) — the Budget tab auto-converts everything to your trip currency at today's exchange rate.",
  },
  {
    icon: "auto-fix",
    title: "Auto-import booking",
    body: "The wand icon on any trip lets you paste booking confirmation text or upload a screenshot. It's automatically classified into flight, stay, transport, or attraction and added to the right tab with a linked ticket.",
  },
  {
    icon: "map-marker-radius",
    title: "Address autocomplete",
    body: "Every location field suggests real addresses as you type. If nothing matches, tap the pin icon to drop a marker on a live map.",
  },
  {
    icon: "share-variant-outline",
    title: "Share Trip",
    body: "Generate a read-only web link for anyone. Choose exactly what to include: flights, transport, stays, attractions, tickets, costs, or the route map.",
  },
  {
    icon: "file-pdf-box",
    title: "Export as PDF",
    body: "Save your itinerary as an A4 PDF — perfect for printing or sharing without the app. Uses the same inclusions you picked in the Share sheet.",
  },
];

export default function HelpPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.top, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={s.back} testID="help-back">
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={s.topTitle}>How Travel Space works</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <View style={s.intro}>
          <Icon name="airplane-marker" size={22} color={colors.brandPrimary} />
          <Text style={s.introTxt}>
            Travel Space keeps every part of a trip in one place — flights, stays, activities, tickets, budgets, and a live map — so you can plan without juggling ten apps and emails.
          </Text>
        </View>

        {FEATURES.map((f) => (
          <View key={f.title} style={s.card}>
            <View style={s.iconWrap}>
              <Icon name={f.icon as any} size={20} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{f.title}</Text>
              <Text style={s.cardBody}>{f.body}</Text>
            </View>
          </View>
        ))}

        <Text style={s.footer}>Happy travels ✈</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { padding: spacing.sm },
  topTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.onSurface },
  intro: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    marginBottom: spacing.xl,
  },
  introTxt: { flex: 1, color: colors.onBrandTertiary, fontSize: 13, lineHeight: 18 },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, marginBottom: 4 },
  cardBody: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  footer: { color: colors.muted, textAlign: "center", marginTop: spacing.xl, fontSize: 13 },
});
