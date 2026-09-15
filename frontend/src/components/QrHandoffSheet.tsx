import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Platform, ActivityIndicator, Alert, TextInput, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import QRCode from "react-native-qrcode-svg";
import { CameraView, useCameraPermissions } from "expo-camera";

import { colors, radius, spacing } from "@/src/theme";
import { buildTripBundle, findMergeCandidate, importAsNewTrip, mergeBundleIntoTrip, type TripBundle } from "@/src/utils/tripExport";
import { encodeTripToQr, decodeQrToBundle } from "@/src/utils/qrHandoff";

type Mode = "export" | "scan";

export function QrHandoffSheet({
  visible,
  onClose,
  tripId,
  onImported,
}: {
  visible: boolean;
  onClose: () => void;
  tripId?: string;              // when present, opens in "export" mode with that trip
  onImported?: (newTripId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = React.useState<Mode>(tripId ? "export" : "scan");
  const [busy, setBusy] = React.useState(false);
  const [payload, setPayload] = React.useState<string>("");
  const [tooBig, setTooBig] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [permission, requestPermission] = useCameraPermissions();

  React.useEffect(() => {
    if (!visible) return;
    setMode(tripId ? "export" : "scan");
    setPayload("");
    setTooBig(false);
    setManual("");
    if (tripId) generatePayload(tripId);
  }, [visible, tripId]);

  const generatePayload = async (id: string) => {
    setBusy(true);
    try {
      const bundle = await buildTripBundle(id);
      const enc = encodeTripToQr(bundle);
      setPayload(enc.payload);
      setTooBig(!enc.withinLimit);
    } catch (e: any) {
      console.warn("QR generate failed", e);
      Alert.alert("Could not build QR", e?.message || String(e) || "Try file export instead.");
    } finally {
      setBusy(false);
    }
  };

  const handleBundle = async (bundle: TripBundle) => {
    try {
      const cand = await findMergeCandidate(bundle);
      const doNew = async () => {
        const newId = await importAsNewTrip(bundle);
        onClose();
        onImported?.(newId);
      };
      const doMerge = async () => {
        const n = await mergeBundleIntoTrip(bundle, cand!.trip.id);
        onClose();
        Alert.alert("Merged", `${n} item${n === 1 ? "" : "s"} merged into "${cand!.trip.name}".`);
      };
      if (cand) {
        Alert.alert(
          "Trip received",
          `You already have "${cand.trip.name}". Add as new copy or merge updates?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Add as new copy", onPress: doNew },
            { text: "Merge updates", onPress: doMerge },
          ],
        );
      } else {
        await doNew();
      }
    } catch (e: any) {
      Alert.alert("Import failed", e?.message || "Try again.");
    }
  };

  const onBarcodeScanned = React.useRef<{ done: boolean }>({ done: false });
  const handleScan = async ({ data }: { data: string }) => {
    if (onBarcodeScanned.current.done) return;
    onBarcodeScanned.current.done = true;
    try {
      const bundle = decodeQrToBundle(data);
      await handleBundle(bundle);
    } catch {
      Alert.alert(
        "Not a Travel Space QR",
        "That QR does not hold a valid trip payload.",
        [{ text: "OK", onPress: () => { onBarcodeScanned.current.done = false; } }],
      );
    }
  };

  const importFromText = async () => {
    if (!manual.trim()) return;
    setBusy(true);
    try {
      const bundle = decodeQrToBundle(manual.trim());
      await handleBundle(bundle);
    } catch {
      Alert.alert("Not a Travel Space QR", "The text you pasted is not a valid trip payload.");
    } finally {
      setBusy(false);
    }
  };

  const qrSize = Math.min(Dimensions.get("window").width - spacing.xl * 2, 320);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={[s.header, { paddingTop: Platform.OS === "android" ? insets.top + spacing.sm : spacing.md }]}>
          <Pressable onPress={onClose} style={{ padding: spacing.sm }} testID="qr-close">
            <Icon name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={s.title}>QR handoff</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={s.tabs}>
          <Pressable onPress={() => setMode("export")} style={[s.tab, mode === "export" && s.tabActive]} testID="qr-tab-export">
            <Icon name="qrcode" size={16} color={mode === "export" ? colors.onBrandPrimary : colors.onSurface} />
            <Text style={[s.tabTxt, mode === "export" && { color: colors.onBrandPrimary }]}>Show</Text>
          </Pressable>
          <Pressable onPress={() => setMode("scan")} style={[s.tab, mode === "scan" && s.tabActive]} testID="qr-tab-scan">
            <Icon name="qrcode-scan" size={16} color={mode === "scan" ? colors.onBrandPrimary : colors.onSurface} />
            <Text style={[s.tabTxt, mode === "scan" && { color: colors.onBrandPrimary }]}>Scan</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          {mode === "export" ? (
            <View style={{ alignItems: "center" }}>
              {busy ? (
                <View style={{ height: qrSize, justifyContent: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
              ) : tooBig ? (
                <View style={s.warnBox}>
                  <Icon name="alert-circle-outline" size={22} color={colors.warning} />
                  <Text style={s.warnTitle}>Too much for one QR</Text>
                  <Text style={s.warnBody}>
                    This trip has more data than a single QR can safely hold. Use the file export in the Share sheet instead — it works over AirDrop, Bluetooth, WiFi and email.
                  </Text>
                </View>
              ) : payload ? (
                <View style={s.qrCard}>
                  <QRCode
                    value={payload}
                    size={qrSize}
                    backgroundColor="#ffffff"
                    color="#000000"
                    ecl="L"
                  />
                  <Text style={s.qrHint}>Point another phone&apos;s Travel Space at this code.</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View>
              {Platform.OS !== "web" ? (
                <View style={s.cameraBox}>
                  {!permission ? (
                    <ActivityIndicator color={colors.brandPrimary} />
                  ) : !permission.granted ? (
                    <View style={{ alignItems: "center", gap: spacing.md, padding: spacing.lg }}>
                      <Icon name="camera-off-outline" size={40} color={colors.muted} />
                      <Text style={s.rowLabel}>Camera access is needed to scan</Text>
                      <Pressable onPress={requestPermission} style={s.primaryBtn} testID="qr-perm-btn">
                        <Text style={s.primaryBtnTxt}>Grant permission</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      onBarcodeScanned={handleScan}
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    />
                  )}
                </View>
              ) : (
                <View style={s.warnBox}>
                  <Icon name="information-outline" size={22} color={colors.brandPrimary} />
                  <Text style={s.warnTitle}>Scanning on the web</Text>
                  <Text style={s.warnBody}>
                    Web browsers don&apos;t let apps scan the camera reliably. Paste the QR contents below instead, or use the trip file share on both devices.
                  </Text>
                </View>
              )}

              <Text style={s.section}>Or paste the QR contents</Text>
              <TextInput
                testID="qr-manual-input"
                value={manual}
                onChangeText={setManual}
                multiline
                placeholder="TSQR1:…"
                placeholderTextColor={colors.muted}
                style={s.manualInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={importFromText}
                disabled={busy || !manual.trim()}
                style={[s.primaryBtn, (busy || !manual.trim()) && { opacity: 0.5 }]}
                testID="qr-manual-import"
              >
                {busy ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> : <Text style={s.primaryBtnTxt}>Import</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>
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
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    margin: spacing.lg,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  tabActive: { backgroundColor: colors.brandPrimary },
  tabTxt: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  qrCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.md,
  },
  qrHint: { color: colors.muted, fontSize: 12, textAlign: "center" },
  warnBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    alignItems: "center",
  },
  warnTitle: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  warnBody: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 18 },
  cameraBox: {
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { color: colors.muted, textTransform: "uppercase", fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginBottom: spacing.sm },
  manualInput: {
    minHeight: 100,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 13,
    color: colors.onSurface,
    textAlignVertical: "top",
    marginBottom: spacing.md,
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
  },
  rowLabel: { color: colors.onSurface, fontSize: 14, textAlign: "center" },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  primaryBtnTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
