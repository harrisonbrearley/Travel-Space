import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Linking, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { niceDate, niceTime } from "@/src/components/form";

type PublicData = {
  trip: any;
  flights: any[];
  transport: any[];
  stays: any[];
  attractions: any[];
};

const PLACEHOLDER =
  "https://images.unsplash.com/photo-1624253321171-1be53e12f5f4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTB8MHwxfHNlYXJjaHwxfHxLeW90byUyMEphcGFuJTIwdGVtcGxlJTIwdHJhdmVsJTIwcGhvdG9ncmFwaHl8ZW58MHx8fHwxNzg5MzcyOTMyfDA&ixlib=rb-4.1.0&q=85";

function isOn(v: string | string[] | undefined, def = true): boolean {
  if (v === undefined) return def;
  const s = Array.isArray(v) ? v[0] : v;
  return s === "1" || s === "true";
}

export default function PublicSharePage() {
  const params = useLocalSearchParams<{
    shareId: string;
    flights?: string; transport?: string; stays?: string; attractions?: string;
    tickets?: string; cost?: string; map?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useQuery<PublicData>({
    queryKey: ["public-trip", params.shareId],
    queryFn: () => api.publicTrip(params.shareId!),
  });

  const showFlights = isOn(params.flights);
  const showTransport = isOn(params.transport);
  const showStays = isOn(params.stays);
  const showAttractions = isOn(params.attractions);
  const showTickets = isOn(params.tickets, false);
  const showCost = isOn(params.cost, false);
  const showMap = isOn(params.map);

  if (isLoading) return <View style={s.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (error || !data) {
    return (
      <View style={s.center}>
        <Icon name="alert-circle-outline" size={40} color={colors.muted} />
        <Text style={s.errorTxt}>This trip could not be found.</Text>
      </View>
    );
  }

  const { trip, flights, transport, stays, attractions } = data;

  // Build filtered itinerary
  type Item = { when: string; endWhen?: string; icon: string; title: string; sub?: string; cat: string; cost?: number };
  const items: Item[] = [];
  if (showFlights) flights.forEach((f) => {
    if (f.departure_datetime) items.push({ when: f.departure_datetime, endWhen: f.arrival_datetime, icon: "airplane", title: `${f.airline || "Flight"} ${f.flight_number}`.trim(), sub: `${f.departure_location} → ${f.arrival_location}`, cat: "flight", cost: f.cost });
  });
  if (showTransport) transport.forEach((t) => {
    if (t.departure_datetime) items.push({ when: t.departure_datetime, endWhen: t.arrival_datetime, icon: iconForTransport(t.transport_type), title: t.transport_type.charAt(0).toUpperCase() + t.transport_type.slice(1), sub: `${t.departure_location} → ${t.arrival_location}`, cat: "transport", cost: t.cost });
  });
  if (showStays) stays.forEach((st) => {
    if (st.checkin_datetime) items.push({ when: st.checkin_datetime, icon: "bed-outline", title: `Check in: ${st.accommodation_name}`, sub: st.location, cat: "stay", cost: st.cost });
    if (st.checkout_datetime) items.push({ when: st.checkout_datetime, icon: "logout", title: `Check out: ${st.accommodation_name}`, sub: st.location, cat: "stay" });
  });
  if (showAttractions) attractions.forEach((a) => {
    if (a.activity_datetime) items.push({ when: a.activity_datetime, icon: "map-marker-outline", title: a.name || "Activity", sub: a.location, cat: "attraction", cost: a.cost });
  });
  items.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

  const groups = new Map<string, Item[]>();
  items.forEach((it) => {
    const d = new Date(it.when);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  });

  const dateRange = trip.start_date && trip.end_date ? `${niceDate(trip.start_date)} – ${niceDate(trip.end_date)}` : "";

  // Map points (only categories that are on and have coords)
  const mapPoints: { lat: number; lng: number; label: string; when: string }[] = [];
  if (showMap) {
    if (showFlights) flights.forEach((f) => {
      if (f.departure_latitude && f.departure_longitude) mapPoints.push({ lat: f.departure_latitude, lng: f.departure_longitude, label: f.departure_location, when: f.departure_datetime });
      if (f.arrival_latitude && f.arrival_longitude) mapPoints.push({ lat: f.arrival_latitude, lng: f.arrival_longitude, label: f.arrival_location, when: f.arrival_datetime });
    });
    if (showTransport) transport.forEach((t) => {
      if (t.departure_latitude && t.departure_longitude) mapPoints.push({ lat: t.departure_latitude, lng: t.departure_longitude, label: t.departure_location, when: t.departure_datetime });
      if (t.arrival_latitude && t.arrival_longitude) mapPoints.push({ lat: t.arrival_latitude, lng: t.arrival_longitude, label: t.arrival_location, when: t.arrival_datetime });
    });
    if (showStays) stays.forEach((st) => {
      if (st.latitude && st.longitude) mapPoints.push({ lat: st.latitude, lng: st.longitude, label: st.accommodation_name || st.location, when: st.checkin_datetime });
    });
    if (showAttractions) attractions.forEach((a) => {
      if (a.latitude && a.longitude) mapPoints.push({ lat: a.latitude, lng: a.longitude, label: a.name || a.location, when: a.activity_datetime });
    });
    mapPoints.sort((a, b) => new Date(a.when || 0).getTime() - new Date(b.when || 0).getTime());
  }

  const mapHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0}.n{background:#788B76;color:#fff;font-weight:700;border-radius:999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.3)}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
var pts=${JSON.stringify(mapPoints)};var m=L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(m);
if(pts.length===0){m.setView([20,0],2);} else{
  var lls=pts.map(function(p){return [p.lat,p.lng]});
  pts.forEach(function(p,i){L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="n">'+(i+1)+'</div>',iconSize:[26,26],iconAnchor:[13,13]})}).addTo(m).bindPopup(p.label);});
  if(lls.length>1){L.polyline(lls,{color:'#788B76',weight:3,opacity:.75,dashArray:'6 8'}).addTo(m);m.fitBounds(lls,{padding:[30,30]});} else m.setView(lls[0],12);
}
</script></body></html>`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
      <View style={s.hero}>
        <Image source={{ uri: trip.cover_photo || PLACEHOLDER }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["rgba(0,0,0,0.3)", "transparent", "rgba(0,0,0,0.85)"]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFillObject} />
        <View style={[s.heroContent, { paddingTop: insets.top + spacing.xl }]}>
          <Text style={s.shareBadge}>SHARED ITINERARY</Text>
          <Text style={s.heroTitle} numberOfLines={2}>{trip.name}</Text>
          {!!trip.destination && <Text style={s.heroDest}>{trip.destination}</Text>}
          {!!dateRange && <Text style={s.heroDates}>{dateRange}</Text>}
        </View>
      </View>

      {showMap && mapPoints.length > 0 && Platform.OS !== "web" && (
        <View style={s.mapWrap}>
          <WebView originWhitelist={["*"]} source={{ html: mapHtml }} style={{ flex: 1 }} javaScriptEnabled />
        </View>
      )}
      {showMap && mapPoints.length > 0 && Platform.OS === "web" && (
        <View style={s.mapWebNotice}>
          <Icon name="map-outline" size={16} color={colors.muted} />
          <Text style={s.mapWebTxt}>Open on your phone to see the route map ({mapPoints.length} stops)</Text>
        </View>
      )}

      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        {items.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Icon name="calendar-blank-outline" size={44} color={colors.muted} />
            <Text style={s.emptyTxt}>No itinerary items to show.</Text>
          </View>
        ) : (
          Array.from(groups.entries()).map(([day, list]) => (
            <View key={day}>
              <View style={s.dayHeader}>
                <Text style={s.dayLabel}>{dayLabel(day, trip.start_date)}</Text>
                <Text style={s.dayDate}>{formatDay(day)}</Text>
              </View>
              <View style={{ gap: spacing.sm }}>
                {list.map((i, idx) => (
                  <View key={`${day}-${idx}`} style={s.tlRow}>
                    <View style={s.tlLine}>
                      <View style={s.tlDot}>
                        <Icon name={i.icon as any} size={12} color={colors.onBrandPrimary} />
                      </View>
                      {idx < list.length - 1 && <View style={s.tlBar} />}
                    </View>
                    <View style={s.tlCard}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={s.tlTime}>{niceTime(i.when)}{i.endWhen ? ` – ${niceTime(i.endWhen)}` : ""}</Text>
                        {showCost && i.cost ? <Text style={s.tlCost}>${i.cost.toFixed(2)}</Text> : null}
                      </View>
                      <Text style={s.tlTitle}>{i.title}</Text>
                      {!!i.sub && <Text style={s.tlSub}>{i.sub}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        {showTickets && (() => {
          const tks = ((data as any).tickets as any[]) || [];
          if (!tks || tks.length === 0) return null;
          return (
            <View>
              <Text style={s.sectionTitle}>Tickets</Text>
              <View style={{ gap: spacing.sm }}>
                {tks.map((t: any) => (
                  <View key={t.id} style={s.ticketCard}>
                    <Icon name="ticket-outline" size={18} color={colors.brandPrimary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.ticketType}>{String(t.ticket_type).toUpperCase()}</Text>
                      {!!t.details && <Text style={s.tlSub}>{t.details}</Text>}
                      {!!t.link && (
                        <Pressable onPress={() => Linking.openURL(t.link)} style={{ marginTop: 4 }}>
                          <Text style={s.linkTxt} numberOfLines={1}>{t.link}</Text>
                        </Pressable>
                      )}
                    </View>
                    {showCost && t.cost > 0 && <Text style={s.tlCost}>${t.cost.toFixed(2)}</Text>}
                  </View>
                ))}
              </View>
            </View>
          );
        })()}
      </View>

      <View style={s.footer}>
        <Icon name="airplane-takeoff" size={16} color={colors.muted} />
        <Text style={s.footerTxt}>Shared with WanderPlan</Text>
      </View>
    </ScrollView>
  );
}

function iconForTransport(t: string) {
  return ({ car: "car", bus: "bus", train: "train", ferry: "ferry", other: "dots-horizontal" } as Record<string, string>)[t] || "car";
}
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function dayLabel(day: string, start: string) {
  if (!start) return "Day";
  const st = new Date(start);
  const c = new Date(day);
  const diff = Math.floor((c.getTime() - new Date(st.getFullYear(), st.getMonth(), st.getDate()).getTime()) / 86400000);
  return diff >= 0 ? `Day ${diff + 1}` : "Before Trip";
}
function formatDay(day: string) {
  return new Date(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.surface },
  errorTxt: { color: colors.muted, marginTop: spacing.md },
  hero: { height: 320, backgroundColor: colors.surfaceInverse },
  heroContent: { flex: 1, justifyContent: "flex-end", padding: spacing.lg },
  shareBadge: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: spacing.sm },
  heroTitle: { color: "#fff", fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
  heroDest: { color: "rgba(255,255,255,0.9)", fontSize: 16, marginTop: 4 },
  heroDates: { color: "rgba(255,255,255,0.75)", fontSize: 14, marginTop: 6 },
  mapWrap: { height: 260, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  mapWebNotice: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  mapWebTxt: { color: colors.muted, fontSize: 12 },
  emptyTxt: { color: colors.muted, marginTop: spacing.md },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: spacing.md },
  dayLabel: { fontSize: 18, fontWeight: "700", color: colors.onSurface, letterSpacing: -0.3 },
  dayDate: { fontSize: 13, color: colors.muted },
  tlRow: { flexDirection: "row", gap: spacing.md },
  tlLine: { alignItems: "center", width: 24, paddingTop: 8 },
  tlDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  tlBar: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2, minHeight: 20 },
  tlCard: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: 2 },
  tlTime: { color: colors.brandPrimary, fontWeight: "600", fontSize: 12 },
  tlCost: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  tlTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  tlSub: { color: colors.muted, fontSize: 13 },
  sectionTitle: { color: colors.muted, textTransform: "uppercase", fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: spacing.sm },
  ticketCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  ticketType: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  linkTxt: { color: colors.brandPrimary, fontSize: 12 },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: spacing.xl },
  footerTxt: { color: colors.muted, fontSize: 12 },
});
