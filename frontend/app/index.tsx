import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { niceDate } from "@/src/components/form";
import { useAuth } from "@/src/auth";
import { useSync } from "@/src/syncWorker";
import { ImportGuestModal, shouldPromptImport } from "@/src/components/ImportGuestModal";

const TABS: { key: Trip["category"]; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "wishlist", label: "Wishlist" },
];

const PLACEHOLDER = require("../assets/images/travel-space-cover.png");

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLocal, signIn, signOut } = useAuth();
  const sync = useSync();
  const [tab, setTab] = React.useState<Trip["category"]>("upcoming");
  const [importOpen, setImportOpen] = React.useState(false);
  const { data, isLoading, refetch, isRefetching } = useQuery<Trip[]>({
    queryKey: ["trips", isLocal ? "local" : "remote"],
    queryFn: api.listTrips,
  });

  // First-time import prompt for freshly signed-in users who still have guest data
  React.useEffect(() => {
    if (isLocal) return;
    if (!user) return;
    shouldPromptImport().then((yes) => {
      if (yes) setImportOpen(true);
    });
  }, [user, isLocal]);

  const trips = React.useMemo(() => {
    return (data || []).filter((t) => t.category === tab);
  }, [data, tab]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>Travel Space</Text>
            <Text style={s.subtitle}>Travel itinerary made easy — bring all your bookings to one Travel Space.</Text>
          </View>
          <Pressable
            testID="help-btn"
            onPress={() => router.push("/help")}
            style={s.helpBtn}
          >
            <Icon name="help-circle-outline" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable
            testID="logout-btn"
            onPress={isLocal ? signIn : signOut}
            style={s.helpBtn}
          >
            <Icon name={isLocal ? "login" : "logout"} size={20} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <View style={s.segmentedWrap}>
        <View style={s.segmented}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                testID={`trip-tab-${t.key}`}
                onPress={() => setTab(t.key)}
                style={[s.segment, active && s.segmentActive]}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLocal ? (
        <View style={s.guestBanner} testID="guest-banner">
          <Icon name="cloud-off-outline" size={14} color={colors.onBrandTertiary} />
          <Text style={s.guestBannerTxt}>Guest mode · saved on this device only</Text>
          <Pressable onPress={signIn} testID="guest-signin-btn">
            <Text style={s.guestBannerLink}>Sign in</Text>
          </Pressable>
        </View>
      ) : !sync.online ? (
        <View style={[s.guestBanner, { backgroundColor: colors.surfaceTertiary }]} testID="offline-banner">
          <Icon name="cloud-off-outline" size={14} color={colors.muted} />
          <Text style={[s.guestBannerTxt, { color: colors.muted }]}>
            Offline · {sync.pending > 0 ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} queued` : "changes will sync when you're back online"}
          </Text>
        </View>
      ) : sync.syncing || sync.pending > 0 ? (
        <View style={s.syncBanner} testID="sync-banner">
          <Icon name="cloud-sync-outline" size={14} color={colors.onBrandTertiary} />
          <Text style={s.guestBannerTxt}>
            {sync.syncing ? `Syncing ${sync.pending} change${sync.pending === 1 ? "" : "s"}…` : `${sync.pending} change${sync.pending === 1 ? "" : "s"} waiting`}
          </Text>
          {!sync.syncing && (
            <Pressable onPress={sync.triggerSync}>
              <Text style={s.guestBannerLink}>Retry</Text>
            </Pressable>
          )}
        </View>
      ) : sync.failed.length > 0 ? (
        <View style={[s.guestBanner, { backgroundColor: colors.surfaceTertiary }]} testID="failed-banner">
          <Icon name="alert-circle-outline" size={14} color={colors.warning} />
          <Text style={[s.guestBannerTxt, { color: colors.muted }]}>
            {sync.failed.length} change{sync.failed.length === 1 ? "" : "s"} couldn't be applied
          </Text>
          <Pressable onPress={sync.dismissFailed} testID="failed-dismiss">
            <Text style={s.guestBannerLink}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: 120 + insets.bottom,
          gap: spacing.lg,
        }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={s.empty}>
              <Icon name="airplane" size={48} color={colors.muted} />
              <Text style={s.emptyTitle}>No {tab} trips yet</Text>
              <Text style={s.emptySub}>Tap the button below to plan your next escape.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <TripCard trip={item} currentUserId={user?.user_id} onPress={() => router.push(`/trip/${item.id}`)} />}
      />

      <Pressable
        testID="create-trip-fab"
        onPress={() => router.push("/trip/new")}
        style={[s.fab, { bottom: 24 + insets.bottom }]}
      >
        <Icon name="plus" size={26} color={colors.onBrandPrimary} />
      </Pressable>

      <ImportGuestModal visible={importOpen} onClose={() => setImportOpen(false)} />
    </View>
  );
}

function TripCard({ trip, onPress, currentUserId }: { trip: Trip; onPress: () => void; currentUserId?: string }) {
  const dateRange =
    trip.start_date && trip.end_date
      ? `${niceDate(trip.start_date)} – ${niceDate(trip.end_date)}`
      : "Dates to be planned";
  // Shared with you = current user is a collaborator but NOT the owner
  const sharedWithYou =
    !!currentUserId && trip.user_id !== currentUserId && Array.isArray(trip.collaborators) && trip.collaborators.includes(currentUserId);
  // Shared by you = owner AND has collaborators
  const sharedByYou =
    !!currentUserId && trip.user_id === currentUserId && Array.isArray(trip.collaborators) && trip.collaborators.length > 0;

  const countdown = React.useMemo(() => {
    if (!trip.start_date || trip.category !== "upcoming") return null;
    const start = new Date(trip.start_date);
    const now = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((startDay.getTime() - today.getTime()) / 86400000);
    if (days > 0) return `Leaves in ${days} day${days === 1 ? "" : "s"}`;
    if (days === 0) return "Today's the day!";
    if (trip.end_date) {
      const end = new Date(trip.end_date);
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      if (today <= endDay) return "On the trip";
    }
    return null;
  }, [trip.start_date, trip.end_date, trip.category]);

  return (
    <Pressable
      testID={`trip-card-${trip.id}`}
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}
    >
      <Image
        source={trip.cover_photo ? { uri: trip.cover_photo } : PLACEHOLDER}
        style={s.cardImage}
        contentFit="cover"
        transition={200}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.85)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {countdown ? (
        <View style={s.countdownBadge} testID={`countdown-${trip.id}`}>
          <Icon name="clock-outline" size={12} color={colors.onBrandPrimary} />
          <Text style={s.countdownTxt}>{countdown}</Text>
        </View>
      ) : null}
      {sharedWithYou ? (
        <View style={[s.sharedBadge, { top: countdown ? spacing.md + 32 : spacing.md }]}>
          <Icon name="account-multiple" size={11} color="#fff" />
          <Text style={s.sharedBadgeTxt}>Shared with you</Text>
        </View>
      ) : sharedByYou ? (
        <View style={[s.sharedBadge, { top: countdown ? spacing.md + 32 : spacing.md }]}>
          <Icon name="account-multiple-plus" size={11} color="#fff" />
          <Text style={s.sharedBadgeTxt}>{trip.collaborators!.length + 1} people</Text>
        </View>
      ) : null}
      <View style={s.cardOverlay}>
        <Text style={s.cardTitle} numberOfLines={2}>{trip.name}</Text>
        {!!trip.destination && <Text style={s.cardDest}>{trip.destination}</Text>}
        <Text style={s.cardDates}>{dateRange}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  helpBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
    marginLeft: spacing.md,
  },
  h1: { fontSize: 32, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4, lineHeight: 20 },
  segmentedWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.surfaceSecondary,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 14, color: colors.muted, fontWeight: "500" },
  segmentTextActive: { color: colors.onSurface, fontWeight: "600" },
  guestBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  guestBannerTxt: { flex: 1, color: colors.onBrandTertiary, fontSize: 12, fontWeight: "500" },
  guestBannerLink: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  syncBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  card: {
    height: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  cardImage: { width: "100%", height: "100%" },
  cardOverlay: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  cardDest: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 14,
    marginTop: 4,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardDates: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    marginTop: 6,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  countdownBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  countdownTxt: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "600" },
  sharedBadge: {
    position: "absolute",
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sharedBadgeTxt: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.onSurface, marginTop: spacing.md },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 6 },
  fab: {
    position: "absolute",
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
