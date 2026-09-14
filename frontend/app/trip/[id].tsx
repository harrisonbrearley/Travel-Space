import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { niceDate } from "@/src/components/form";
import { AutoAddSheet } from "@/src/components/AutoAddSheet";
import { ShareOptionsSheet } from "@/src/components/ShareOptionsSheet";

import ItineraryTab from "@/src/components/tabs/Itinerary";
import MapTab from "@/src/components/tabs/Map";
import FlightsTab from "@/src/components/tabs/Flights";
import TransportTab from "@/src/components/tabs/Transport";
import StaysTab from "@/src/components/tabs/Stays";
import AttractionsTab from "@/src/components/tabs/Attractions";
import TicketsTab from "@/src/components/tabs/Tickets";
import BudgetTab from "@/src/components/tabs/Budget";
import DocumentsTab from "@/src/components/tabs/Documents";

const TABS = [
  { key: "itinerary", label: "Itinerary", icon: "calendar-blank-outline" },
  { key: "map", label: "Map", icon: "map-outline" },
  { key: "flights", label: "Flights", icon: "airplane" },
  { key: "transport", label: "Transport", icon: "car" },
  { key: "stays", label: "Stay", icon: "bed-outline" },
  { key: "attractions", label: "Attractions", icon: "map-marker-outline" },
  { key: "tickets", label: "Tickets", icon: "ticket-outline" },
  { key: "documents", label: "Docs", icon: "file-multiple-outline" },
  { key: "budget", label: "Budget", icon: "cash-multiple" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PLACEHOLDER = require("../../assets/images/travel-space-cover.png");

export type TabNav = {
  goToTicket: (ticketId: string) => void;
  goToItem: (category: "flight" | "transport" | "stay" | "attraction", itemId: string) => void;
  focusId: string;
};

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<TabKey>("itinerary");
  const [focusId, setFocusId] = React.useState<string>("");
  const [autoAdd, setAutoAdd] = React.useState(false);
  const [shareSheet, setShareSheet] = React.useState(false);

  const { data: trip } = useQuery<Trip>({
    queryKey: ["trip", id],
    queryFn: () => api.getTrip(id),
  });

  const categoryToTab: Record<string, TabKey> = {
    flight: "flights",
    transport: "transport",
    stay: "stays",
    attraction: "attractions",
  };

  const goToTicket = (ticketId: string) => {
    setFocusId(ticketId);
    setTab("tickets");
  };
  const goToItem = (category: "flight" | "transport" | "stay" | "attraction", itemId: string) => {
    setFocusId(itemId);
    setTab(categoryToTab[category]);
  };

  const share = () => setShareSheet(true);

  if (!trip) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <Pressable onPress={() => router.back()} style={s.iconBtn} testID="back-btn">
            <Icon name="chevron-left" size={26} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  const dateRange =
    trip.start_date && trip.end_date
      ? `${niceDate(trip.start_date)} – ${niceDate(trip.end_date)}`
      : "Dates to be planned";

  const nav: TabNav = { goToTicket, goToItem, focusId };

  return (
    <View style={s.root}>
      <View style={s.cover}>
        <Image
          source={trip.cover_photo ? { uri: trip.cover_photo } : PLACEHOLDER}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.9)"]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[s.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={() => router.back()} style={s.iconBtn} testID="back-btn">
            <Icon name="chevron-left" size={26} color="#fff" />
          </Pressable>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable onPress={() => setAutoAdd(true)} style={s.iconBtn} testID="auto-add-btn">
              <Icon name="auto-fix" size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={share} style={s.iconBtn} testID="share-trip-btn">
              <Icon name="share-variant-outline" size={20} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: "/trip/edit", params: { id: trip.id } })}
              style={s.iconBtn}
              testID="edit-trip-btn"
            >
              <Icon name="pencil-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
        <View style={s.coverBottom}>
          <Text style={s.coverTitle} numberOfLines={2}>{trip.name}</Text>
          {!!trip.destination && <Text style={s.coverDest}>{trip.destination}</Text>}
          <Text style={s.coverDates}>{dateRange}</Text>
        </View>
      </View>

      <View style={s.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                testID={`tab-${t.key}`}
                onPress={() => {
                  setTab(t.key);
                  setFocusId("");
                }}
                style={[s.tabChip, active && s.tabChipActive]}
              >
                <Icon
                  name={t.icon as any}
                  size={16}
                  color={active ? colors.onBrandPrimary : colors.onSurface}
                />
                <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "itinerary" && <ItineraryTab trip={trip} />}
        {tab === "map" && <MapTab trip={trip} />}
        {tab === "flights" && <FlightsTab trip={trip} nav={nav} />}
        {tab === "transport" && <TransportTab trip={trip} nav={nav} />}
        {tab === "stays" && <StaysTab trip={trip} nav={nav} />}
        {tab === "attractions" && <AttractionsTab trip={trip} nav={nav} />}
        {tab === "tickets" && <TicketsTab trip={trip} nav={nav} />}
        {tab === "documents" && <DocumentsTab trip={trip} nav={nav} />}
        {tab === "budget" && <BudgetTab trip={trip} />}
      </View>

      <AutoAddSheet
        visible={autoAdd}
        onClose={() => setAutoAdd(false)}
        trip={trip}
        onDone={(cat) => {
          setAutoAdd(false);
          const mapped = categoryToTab[cat];
          if (mapped) setTab(mapped);
        }}
      />

      <ShareOptionsSheet
        visible={shareSheet}
        onClose={() => setShareSheet(false)}
        trip={trip}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  cover: {
    height: 260,
    backgroundColor: colors.surfaceInverse,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverBottom: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  coverTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  coverDest: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    marginTop: 4,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  coverDates: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    marginTop: 6,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tabsWrap: {
    height: 56,
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabChip: {
    height: 36,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontSize: 13, color: colors.onSurface, fontWeight: "500" },
  tabTextActive: { color: colors.onBrandPrimary, fontWeight: "600" },
});
