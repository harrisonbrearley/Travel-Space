import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, Share, Switch, ScrollView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";
import { api, type Trip } from "@/src/api";
import { exportTripPdf } from "@/src/exportPdf";
import { useRates } from "@/src/currency";

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
  const [opts, setOpts] = React.useState<Record<string, boolean>>(DEFAULTS);
  const [exporting, setExporting] = React.useState(false);
  const rates = useRates();

  React.useEffect(() => {
    // Load persisted options
    if (Platform.OS === "web") {
      try {
        const stored = window.localStorage?.getItem(STORAGE_KEY);
        if (stored) setOpts({ ...DEFAULTS, ...JSON.parse(stored) });
      } catch {}
    }
  }, [visible]);

  const toggle = (k: string) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  const buildUrl = () => {
    const base = process.env.EXPO_PUBLIC_BACKEND_URL;
    const qs = Object.entries(opts)
      .map(([k, v]) => `${k}=${v ? 1 : 0}`)
      .join("&");
    return `${base}/share/${trip.share_id}?${qs}`;
  };

  const doShare = async () => {
    const url = buildUrl();
    try {
      if (Platform.OS === "web") {
        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(opts));
      }
    } catch {}
    try {
      await Share.share({
        title: trip.name,
        message: `Check out my trip "${trip.name}"\n${url}`,
        url,
      });
      onClose();
    } catch {}
  };

  const copyLink = async () => {
    const url = buildUrl();
    if (Platform.OS === "web" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {}
    }
    // Fall through to Share on native
    doShare();
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

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 + insets.bottom }}>
          <View style={s.intro}>
            <Icon name="link-variant" size={20} color={colors.brandPrimary} />
            <Text style={s.introTxt}>
              Anyone with the link will see a read-only view of &quot;{trip.name}&quot;. Choose exactly what to include below.
            </Text>
          </View>

          <Text style={s.section}>Include</Text>
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
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable onPress={exportPdf} disabled={exporting} style={[s.footerBtn, s.footerSecondary]} testID="share-pdf">
            {exporting ? <ActivityIndicator color={colors.onSurface} size="small" /> : <Icon name="file-pdf-box" size={16} color={colors.onSurface} />}
            <Text style={{ color: colors.onSurface, fontWeight: "600" }}>PDF</Text>
          </Pressable>
          <Pressable onPress={copyLink} style={[s.footerBtn, s.footerSecondary]} testID="share-copy">
            <Icon name="content-copy" size={16} color={colors.onSurface} />
            <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Copy link</Text>
          </Pressable>
          <Pressable onPress={doShare} style={[s.footerBtn, s.footerPrimary]} testID="share-send">
            <Icon name="share-variant" size={16} color={colors.onBrandPrimary} />
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
    marginBottom: spacing.xl,
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
