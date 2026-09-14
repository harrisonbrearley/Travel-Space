import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Attraction, type Flight, type Stay, type Transport, type Trip } from "@/src/api";
import { colors, spacing } from "@/src/theme";

type Point = { lat: number; lng: number; label: string; sub?: string; when?: string; category: string };

const buildHtml = (points: Point[], showLine: boolean) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  .num-icon { background: #788B76; color: #fff; font-weight: 700; border-radius: 999px;
    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3); font-family: -apple-system, sans-serif; font-size: 13px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const pts = ${JSON.stringify(points)};
  const map = L.map('map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(map);
  if (pts.length === 0) { map.setView([20, 0], 2); }
  else {
    const latlngs = pts.map(p => [p.lat, p.lng]);
    pts.forEach((p, i) => {
      const icon = L.divIcon({ className: '', html: '<div class="num-icon">' + (i + 1) + '</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup('<b>' + p.label + '</b>' + (p.sub ? '<br/>' + p.sub : '') + (p.when ? '<br/><small>' + p.when + '</small>' : ''));
    });
    ${showLine ? "if (latlngs.length > 1) { L.polyline(latlngs, { color: '#788B76', weight: 3, opacity: 0.75, dashArray: '6 8' }).addTo(map); }" : ""}
    if (latlngs.length === 1) map.setView(latlngs[0], 12);
    else map.fitBounds(latlngs, { padding: [40, 40] });
  }
</script>
</body>
</html>
`;

export default function MapTab({ trip }: { trip: Trip }) {
  const { data: flights = [] } = useQuery<Flight[]>({ queryKey: ["flights", trip.id], queryFn: () => api.list("flights", trip.id) });
  const { data: transport = [] } = useQuery<Transport[]>({ queryKey: ["transport", trip.id], queryFn: () => api.list("transport", trip.id) });
  const { data: stays = [] } = useQuery<Stay[]>({ queryKey: ["stays", trip.id], queryFn: () => api.list("stays", trip.id) });
  const { data: attractions = [] } = useQuery<Attraction[]>({ queryKey: ["attractions", trip.id], queryFn: () => api.list("attractions", trip.id) });

  const points: Point[] = React.useMemo(() => {
    const pts: Point[] = [];
    flights.forEach((f) => {
      if (f.departure_latitude != null && f.departure_longitude != null) {
        pts.push({ lat: f.departure_latitude, lng: f.departure_longitude, label: `Depart ${f.departure_location}`, sub: `${f.airline || ""} ${f.flight_number}`.trim(), when: f.departure_datetime, category: "flight" });
      }
      f.layovers?.forEach((l) => {
        if (l.latitude != null && l.longitude != null) {
          pts.push({ lat: l.latitude, lng: l.longitude, label: `Layover ${l.location}`, when: l.arrival_datetime, category: "flight" });
        }
      });
      if (f.arrival_latitude != null && f.arrival_longitude != null) {
        pts.push({ lat: f.arrival_latitude, lng: f.arrival_longitude, label: `Arrive ${f.arrival_location}`, sub: `${f.airline || ""} ${f.flight_number}`.trim(), when: f.arrival_datetime, category: "flight" });
      }
    });
    transport.forEach((t) => {
      if (t.departure_latitude != null && t.departure_longitude != null) {
        pts.push({ lat: t.departure_latitude, lng: t.departure_longitude, label: `${t.transport_type}: ${t.departure_location}`, when: t.departure_datetime, category: "transport" });
      }
      if (t.arrival_latitude != null && t.arrival_longitude != null) {
        pts.push({ lat: t.arrival_latitude, lng: t.arrival_longitude, label: `${t.transport_type}: ${t.arrival_location}`, when: t.arrival_datetime, category: "transport" });
      }
    });
    stays.forEach((s) => {
      if (s.latitude != null && s.longitude != null) {
        pts.push({ lat: s.latitude, lng: s.longitude, label: s.accommodation_name || "Stay", sub: s.location, when: s.checkin_datetime, category: "stay" });
      }
    });
    attractions.forEach((a) => {
      if (a.latitude != null && a.longitude != null) {
        pts.push({ lat: a.latitude, lng: a.longitude, label: a.name || "Activity", sub: a.location, when: a.activity_datetime, category: "attraction" });
      }
    });

    pts.sort((a, b) => {
      if (!a.when) return 1;
      if (!b.when) return -1;
      return new Date(a.when).getTime() - new Date(b.when).getTime();
    });
    return pts;
  }, [flights, transport, stays, attractions]);

  if (points.length === 0) {
    return (
      <View style={s.empty}>
        <Icon name="map-outline" size={44} color={colors.muted} />
        <Text style={s.emptyTitle}>Your route map will build itself</Text>
        <Text style={s.emptySub}>
          Add a flight, stay, transport or attraction and choose an address from suggestions (or drop a pin on the map). Items with coordinates appear here in chronological order.
        </Text>
      </View>
    );
  }

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: buildHtml(points, true) }}
      style={{ flex: 1, backgroundColor: colors.surface }}
      javaScriptEnabled
      domStorageEnabled
      testID="trip-map-webview"
    />
  );
}

const s = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface, marginTop: spacing.md, textAlign: "center" },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 8 },
});
