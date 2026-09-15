import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, Share, Switch, ScrollView, Platform, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";
import { api, isLocalMode, type Trip } from "@/src/api";
import { exportTripPdf } from "@/src/exportPdf";
import { useRates } from "@/src/currency";
import {
  buildTripBundle,
  shareTripBundle,
  pickTripBundle,
  findMergeCandidate,
  importAsNewTrip,
  mergeBundleIntoTrip,
} from "@/src/utils/tripExport";
import { useQueryClient } from "@tanstack/react-query";

type Opt = { key: string; label: string; icon: string; description?: string };

const OPTS: Opt[] = [
  { key: "flights", label: "Flights", icon: "airplane", description: "Airlines, routes, times" },
  { key: "transport", label: "Transport", icon: "car", description: "Cars, trains, ferries" },
  { key: "stays", label: "Stays", icon: "bed-outline", description: "Hotels, check-in / out" },
  { key: "attractions", label: "Attractions", icon: "map-marker-outline", description: "Activities & tours" },
  { key: "tickets", label: "Tickets", icon: "ticket-outline", description: "Photos & booking refs" },
  { key: "cost", label: "Costs", icon: "cash-multiple", description: "Prices next to each item" },
  { key: "map", label: "Route map", icon: "map-outline", description: "Locations plotted on a map" },
];

const DEFAULTS: Record<string, boolean> = {
  flights: true, transport: true, stays: true, attractions: true,
  tickets: false, cost: false, map: true,
};

const STORAGE_KEY = "share_opts_v1";

type Mode = "public" | "collab" | "copy";

const MODES: { key: Mode; label: string; icon: string; description: string }[] = [
  {
    key: "public",
    label: "Read-only link",
    icon: "link-variant",
    description: "Anyone with the link sees a beautiful web view. They can't edit anything.",
  },
  {
    key: "collab",
    label: "Invite to trip",
    icon: "account-multiple-plus",
    description: "They join the same trip. Their edits sync with yours in real time.",
  },
  {
    key: "copy",
    label: "Send a copy",
    icon: "content-duplicate",
    description: "They get their own private copy. Your trip stays untouched.",
  },
];

export function ShareOptionsSheet({
  visible,
  onClose,
  trip,
}: {
  visible: boolean;
  onClose: () => void;
  trip: Trip;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = React.useState<Mode>("public");
  const [opts, setOpts] = React.useState<Record<string, boolean>>(DEFAULTS);
  const [exporting, setExporting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [localBusy, setLocalBusy] = React.useState(false);
  const rates = useRates();

  React.useEffect(() => {
    if (Platform.OS === "web") {
      try {
        const stored = window.localStorage?.getItem(STORAGE_KEY);
        if (stored) setOpts({ ...DEFAULTS, ...JSON.parse(stored) });
      } catch {}
    }
  }, [visible]);

  const localOnly = isLocalMode();

  const toggle = (k: string) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  const buildPublicUrl = () => {
    const base = process.env.EXPO_PUBLIC_BACKEND_URL;
    const qs = Object.entries(opts).map(([k, v]) => `${k}=${v ? 1 : 0}`).join("&");
    return `${base}/share/${trip.share_id}?${qs}`;
  };

  const buildInviteUrl = (token: string) => {
    const base = process.env.EXPO_PUBLIC_BACKEND_URL;
    return `${base}/invite/${token}`;
  };

  const persistOpts = () => {
    try {
      if (Platform.OS === "web") window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(opts));
    } catch {}
  };

  const shareUrl = async (url: string, label: string) => {
    try {
      await Share.share({
        title: trip.name,
        message: `${label}: "${trip.name}"\n${url}`,
        url,
      });
      onClose();
    } catch {}
  };

  const copyUrl = async (url: string) => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).clipboard) {
      try {
        await (navigator as any).clipboard.writeText(url);
        Alert.alert("Copied", "Link copied to clipboard.");
        return;
      } catch {}
    }
    // fallback to native share sheet
    await shareUrl(url, "Trip link");
  };

  const generateInviteAndShare = async (m: "collab" | "copy", act: "share" | "copy") => {
    if (localOnly) {
      Alert.alert(
        "Sign in required",
        m === "collab"
          ? "Real-time collaboration needs a Travel Space account. Please sign in first."
          : "To send a copy that others can save to their account, please sign in first.",
      );
      return;
    }
    setBusy(true);
    try {
      const res: any = await api.createInvite(trip.id, m);
      const url = buildInviteUrl(res.token);
      if (act === "share") {
        await shareUrl(url, m === "collab" ? "Join my trip" : "Copy of my trip");
      } else {
        await copyUrl(url);
      }
    } catch (e: any) {
      Alert.alert("Could not create invite", e.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const doShare = async () => {
    persistOpts();
    if (mode === "public") {
      await shareUrl(buildPublicUrl(), "Check out my trip");
    } else {
      await generateInviteAndShare(mode, "share");
    }
  };

  const doCopy = async () => {
    persistOpts();
    if (mode === "public") {
      await copyUrl(buildPublicUrl());
    } else {
      await generateInviteAndShare(mode, "copy");
    }
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const full: any = await api.publicTrip(trip.share_id);
      await exportTripPdf(
        {
          trip: full.trip || trip,
          flights: full.flights || [],
          transport: full.transport || [],
          stays: full.stays || [],
          attractions: full.attractions || [],
          tickets: full.tickets || [],
        },
        {
          flights: !!opts.flights,
          transport: !!opts.transport,
          stays: !!opts.stays,
          attractions: !!opts.attractions,
          tickets: !!opts.tickets,
          cost: !!opts.cost,
          map: !!opts.map,
        },
        rates.data?.rates,
      );
      onClose();
    } finally {
      setExporting(false);
    }
  };

  const activeMode = MODES.find((m) => m.key === mode)!;

  // ---- Device-to-device (no-server) sync ----
  const doLocalExport = async () => {
    setLocalBusy(true);
    try {
      const bundle = await buildTripBundle(trip.id);
      await shareTripBundle(bundle);
    } catch (e: any) {
      Alert.alert("Could not export", e?.message || "Try again.");
    } finally {
      setLocalBusy(false);
    }
  };

  const invalidateAll = (id: string) => {
    ["flights", "transport", "stays", "attractions", "tickets", "documents"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k, id] }),
    );
    qc.invalidateQueries({ queryKey: ["trips", "local"] });
    qc.invalidateQueries({ queryKey: ["trips", "remote"] });
    qc.invalidateQueries({ queryKey: ["trip", id] });
  };

  const doLocalImport = async () => {
    setLocalBusy(true);
    try {
      const bundle = await pickTripBundle();
      const candidate = await findMergeCandidate(bundle);
      const openMerge = async () => {
        const targetId = candidate!.trip.id;
        const touched = await mergeBundleIntoTrip(bundle, targetId);
        onClose();
        invalidateAll(targetId);
        Alert.alert("Merged", `${touched} item${touched === 1 ? "" : "s"} merged into "${candidate!.trip.name}".`);
      };
      const openReplace = async () => {
        const newId = await importAsNewTrip(bundle);
        onClose();
        invalidateAll(newId);
        setTimeout(() => router.push(`/trip/${newId}`), 100);
      };
      if (candidate) {
        Alert.alert(
          "Trip file received",
          `You already have this trip ("${candidate.trip.name}"). How should it be added?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Add as new copy", onPress: openReplace },
            { text: "Merge updates", onPress: openMerge },
          ],
        );
      } else {
        await openReplace();
      }
    } catch (e: any) {
      if (e?.message === "cancelled") return;
      if (e?.message === "invalid_schema" || e?.message === "invalid_json") {
        Alert.alert("Not a trip file", "This file doesn't look like a Travel Space trip export.");
      } else {
        Alert.alert("Could not import", e?.message || "Try another file.");
      }
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={[s.header, { paddingTop: Platform.OS === "android" ? insets.top + spacing.sm : spacing.md }]}>
          <Pressable onPress={onClose} style={{ padding: spacing.sm }} testID="share-close">
            <Icon name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={s.title}>Share Trip</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 + insets.bottom }}>
          <Text style={s.section}>How do you want to share it?</Text>
          <View style={{ gap: spacing.sm }}>
            {MODES.map((m) => {
              const active = m.key === mode;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setMode(m.key)}
                  style={[s.modeCard, active && s.modeCardActive]}
                  testID={`share-mode-${m.key}`}
                >
                  <View style={[s.modeIcon, active && s.modeIconActive]}>
                    <Icon name={m.icon as any} size={20} color={active ? colors.onBrandPrimary : colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modeLabel}>{m.label}</Text>
                    <Text style={s.modeDesc}>{m.description}</Text>
                  </View>
                  <Icon
                    name={active ? "check-circle" : "circle-outline"}
                    size={22}
                    color={active ? colors.brandPrimary : colors.muted}
                  />
                </Pressable>
              );
            })}
          </View>

          {localOnly && mode !== "public" ? (
            <View style={s.warn}>
              <Icon name="alert-circle-outline" size={16} color={colors.warning || colors.brandPrimary} />
              <Text style={s.warnTxt}>
                {mode === "collab"
                  ? "Real-time collaboration needs a Travel Space account. Sign in from the home screen to enable it."
                  : "Sending copies to other people requires a Travel Space account. Sign in from the home screen to enable it."}
              </Text>
            </View>
          ) : null}

          {mode === "public" && (
            <>
              <Text style={[s.section, { marginTop: spacing.xl }]}>Include in the link</Text>
              {OPTS.map((o) => (
                <View key={o.key} style={s.row}>
                  <View style={s.rowIcon}>
                    <Icon name={o.icon as any} size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>{o.label}</Text>
                    {o.description && <Text style={s.rowDesc}>{o.description}</Text>}
                  </View>
                  <Switch
                    testID={`share-opt-${o.key}`}
                    value={!!opts[o.key]}
                    onValueChange={() => toggle(o.key)}
                  />
                </View>
              ))}
            </>
          )}

          {mode !== "public" && (
            <View style={[s.intro, { marginTop: spacing.xl }]}>
              <Icon name={activeMode.icon as any} size={20} color={colors.brandPrimary} />
              <Text style={s.introTxt}>
                {mode === "collab"
                  ? "The invite link works for anyone. When they tap it, they'll sign in and be added to this trip. Their edits appear here in real time."
                  : "The invite link works for anyone. When they tap it, a fresh copy of this trip is saved to their account. Your trip is not affected by their edits."}
              </Text>
            </View>
          )}

          {/* --- Device-to-device sync (works fully offline) --- */}
          <Text style={[s.section, { marginTop: spacing.xl }]}>Device to device</Text>
          <View style={s.intro}>
            <Icon name="wifi-off" size={20} color={colors.brandPrimary} />
            <Text style={s.introTxt}>
              No internet? Export the trip as a file and hand it over via AirDrop, Bluetooth, WiFi, email or any messenger. The other person imports it in the same sheet.
            </Text>
          </View>

          <Pressable
            onPress={doLocalExport}
            disabled={localBusy}
            style={[s.modeCard, { marginTop: spacing.sm }, localBusy && { opacity: 0.6 }]}
            testID="local-export-btn"
          >
            <View style={s.modeIcon}>
              {localBusy ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Icon name="download-outline" size={20} color={colors.brandPrimary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modeLabel}>Export trip file</Text>
              <Text style={s.modeDesc}>Save the whole trip (all tabs, all attachments) as a single file to share offline.</Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.muted} />
          </Pressable>

          <View style={{ height: spacing.sm }} />

          <Pressable
            onPress={doLocalImport}
            disabled={localBusy}
            style={[s.modeCard, localBusy && { opacity: 0.6 }]}
            testID="local-import-btn"
          >
            <View style={s.modeIcon}>
              <Icon name="upload-outline" size={20} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modeLabel}>Import trip file</Text>
              <Text style={s.modeDesc}>Merge a trip a friend shared with you, or drop it in as a fresh copy.</Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {mode === "public" ? (
            <Pressable onPress={exportPdf} disabled={exporting} style={[s.footerBtn, s.footerSecondary]} testID="share-pdf">
              {exporting ? <ActivityIndicator color={colors.onSurface} size="small" /> : <Icon name="file-pdf-box" size={16} color={colors.onSurface} />}
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>PDF</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={doCopy} disabled={busy} style={[s.footerBtn, s.footerSecondary, busy && { opacity: 0.6 }]} testID="share-copy">
            {busy ? <ActivityIndicator color={colors.onSurface} size="small" /> : <Icon name="content-copy" size={16} color={colors.onSurface} />}
            <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Copy link</Text>
          </Pressable>
          <Pressable onPress={doShare} disabled={busy} style={[s.footerBtn, s.footerPrimary, busy && { opacity: 0.6 }]} testID="share-send">
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> : <Icon name="share-variant" size={16} color={colors.onBrandPrimary} />}
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "600" }}>Share</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.onSurface },
  intro: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    alignItems: "center",
  },
  introTxt: { flex: 1, color: colors.onBrandTertiary, fontSize: 13, lineHeight: 18 },
  section: {
    color: colors.muted,
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  modeCardActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  modeIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  modeIconActive: { backgroundColor: colors.brandPrimary },
  modeLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  modeDesc: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  warn: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "flex-start",
  },
  warnTxt: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  rowDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  footer: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  footerSecondary: { backgroundColor: colors.surfaceTertiary },
  footerPrimary: { backgroundColor: colors.brandPrimary },
});
