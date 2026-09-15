import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, Platform } from "react-native";
import { WebView } from "@/src/components/CrossWebView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";
import { api } from "@/src/api";

const LEAFLET_HTML = (initLat: number, initLon: number) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  .picker-hint { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 999;
    background: rgba(28,28,30,0.85); color: #fff; padding: 10px 14px; border-radius: 12px;
    font-family: -apple-system, sans-serif; font-size: 13px; text-align: center; }
</style>
</head>
<body>
<div class="picker-hint">Tap anywhere to drop a pin</div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const RN = window.ReactNativeWebView;
  const map = L.map('map').setView([${initLat}, ${initLon}], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(map);
  let marker = L.marker([${initLat}, ${initLon}], { draggable: true }).addTo(map);
  function report(latlng) {
    RN && RN.postMessage(JSON.stringify({ type: 'pick', lat: latlng.lat, lng: latlng.lng }));
  }
  map.on('click', (e) => {
    marker.setLatLng(e.latlng);
    report(e.latlng);
  });
  marker.on('dragend', () => report(marker.getLatLng()));
  report(marker.getLatLng());
</script>
</body>
</html>
`;

export function MapPickerModal({
  visible,
  onClose,
  onPick,
  initial,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (loc: { latitude: number; longitude: number; display_name: string }) => void;
  initial?: { latitude?: number | null; longitude?: number | null };
}) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = React.useState<{ lat: number; lng: number } | null>(null);
  const [name, setName] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  const lat = initial?.latitude ?? 48.8566;
  const lon = initial?.longitude ?? 2.3522;

  React.useEffect(() => {
    if (!visible) {
      setPicked(null);
      setName("");
    }
  }, [visible]);

  const handleMsg = async (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "pick") {
        setPicked({ lat: msg.lat, lng: msg.lng });
        setLoading(true);
        try {
          const r = await api.reverseGeocode(msg.lat, msg.lng);
          setName(r.display_name || `${msg.lat.toFixed(4)}, ${msg.lng.toFixed(4)}`);
        } catch {
          setName(`${msg.lat.toFixed(4)}, ${msg.lng.toFixed(4)}`);
        } finally {
          setLoading(false);
        }
      }
    } catch {}
  };

  const confirm = () => {
    if (!picked) return;
    onPick({ latitude: picked.lat, longitude: picked.lng, display_name: name });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={[s.header, { paddingTop: Platform.OS === "android" ? insets.top + spacing.sm : spacing.md }]}>
          <Pressable onPress={onClose} style={{ padding: spacing.sm }} testID="mappicker-close">
            <Icon name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={s.title}>Pin on map</Text>
          <Pressable
            onPress={confirm}
            disabled={!picked}
            style={[s.confirmBtn, !picked && { opacity: 0.4 }]}
            testID="mappicker-confirm"
          >
            <Text style={s.confirmTxt}>Use</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, minHeight: 300 }}>
          <WebView
            originWhitelist={["*"]}
            source={{ html: LEAFLET_HTML(lat, lon) }}
            onMessage={handleMsg}
            style={{ flex: 1, width: "100%", height: "100%" }}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Icon name="map-marker" size={18} color={colors.brandPrimary} />
          <Text style={s.footerTxt} numberOfLines={2}>
            {loading ? "Locating…" : name || "Tap the map to drop a pin"}
          </Text>
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
  confirmBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  confirmTxt: { color: colors.onBrandPrimary, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  footerTxt: { flex: 1, color: colors.onSurface, fontSize: 14 },
});
