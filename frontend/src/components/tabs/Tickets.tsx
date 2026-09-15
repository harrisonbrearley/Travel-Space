import React from "react";
import { View, Text, StyleSheet, Pressable, Linking, Alert, Platform } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Attraction, type Flight, type Stay, type Ticket, type Transport, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { Field, Input } from "@/src/components/form";
import { FormModal, ListWrapper } from "@/src/components/tab-shell";
import { CostInput } from "@/src/components/CostInput";
import { formatMoney } from "@/src/currency";
import { sortByDate } from "@/src/utils/sort";
import type { TabNav } from "@/app/trip/[id]";

const TYPES: { key: Ticket["ticket_type"]; label: string; icon: string }[] = [
  { key: "flight", label: "Flight", icon: "airplane" },
  { key: "transport", label: "Transport", icon: "car" },
  { key: "stay", label: "Stay", icon: "bed-outline" },
  { key: "attraction", label: "Attraction", icon: "map-marker-outline" },
  { key: "other", label: "Other", icon: "ticket-outline" },
];

const empty = (trip_id: string, currency: string): Ticket => ({
  id: "", trip_id, link: "", photo: "",
  file_base64: "", file_mime: "", file_name: "",
  cost: 0, cost_currency: currency, details: "",
  ticket_type: "other", linked_item_id: "",
});

export default function TicketsTab({ trip, nav }: { trip: Trip; nav: TabNav }) {
  const qc = useQueryClient();
  const [modal, setModal] = React.useState<Ticket | null>(null);

  const { data: ticketsRaw = [] } = useQuery<Ticket[]>({ queryKey: ["tickets", trip.id], queryFn: () => api.list("tickets", trip.id) });
  const { data: flights = [] } = useQuery<Flight[]>({ queryKey: ["flights", trip.id], queryFn: () => api.list("flights", trip.id) });
  const { data: transport = [] } = useQuery<Transport[]>({ queryKey: ["transport", trip.id], queryFn: () => api.list("transport", trip.id) });
  const { data: stays = [] } = useQuery<Stay[]>({ queryKey: ["stays", trip.id], queryFn: () => api.list("stays", trip.id) });
  const { data: attractions = [] } = useQuery<Attraction[]>({ queryKey: ["attractions", trip.id], queryFn: () => api.list("attractions", trip.id) });

  // Sort tickets by the date of the item they're linked to. Unlinked
  // tickets sink to the bottom.
  const tickets = React.useMemo(() => {
    const dated = ticketsRaw.map((tk) => {
      let when = "";
      if (tk.linked_item_id) {
        if (tk.ticket_type === "flight") when = flights.find((x) => x.id === tk.linked_item_id)?.departure_datetime || "";
        else if (tk.ticket_type === "transport") when = transport.find((x) => x.id === tk.linked_item_id)?.departure_datetime || "";
        else if (tk.ticket_type === "stay") when = stays.find((x) => x.id === tk.linked_item_id)?.checkin_datetime || "";
        else if (tk.ticket_type === "attraction") when = attractions.find((x) => x.id === tk.linked_item_id)?.activity_datetime || "";
      }
      return { ...tk, __sort_when: when };
    });
    return sortByDate(dated, ["__sort_when"]);
  }, [ticketsRaw, flights, transport, stays, attractions]);

  const save = useMutation({
    mutationFn: async (t: Ticket) => (t.id ? api.update("tickets", t.id, t) : api.create("tickets", trip.id, t)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets", trip.id] });
      qc.invalidateQueries({ queryKey: ["flights", trip.id] });
      qc.invalidateQueries({ queryKey: ["transport", trip.id] });
      qc.invalidateQueries({ queryKey: ["stays", trip.id] });
      qc.invalidateQueries({ queryKey: ["attractions", trip.id] });
      setModal(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.remove("tickets", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets", trip.id] });
      qc.invalidateQueries({ queryKey: ["flights", trip.id] });
      qc.invalidateQueries({ queryKey: ["transport", trip.id] });
      qc.invalidateQueries({ queryKey: ["stays", trip.id] });
      qc.invalidateQueries({ queryKey: ["attractions", trip.id] });
      setModal(null);
    },
  });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Please allow photo access."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled && res.assets[0] && modal) {
      // Clear any PDF that might have been attached and use the local photo URI as before
      setModal({ ...modal, photo: res.assets[0].uri, file_base64: "", file_mime: "", file_name: "" });
    }
  };

  const pickPdf = async () => {
    if (!modal) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    try {
      const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
      const decoded = Math.floor((b64.length * 3) / 4);
      if (decoded > 6 * 1024 * 1024) {
        Alert.alert("File too large", "Maximum PDF size is 6 MB.");
        return;
      }
      setModal({
        ...modal,
        photo: "",
        file_base64: b64,
        file_mime: a.mimeType || "application/pdf",
        file_name: a.name || "ticket.pdf",
      });
    } catch (e: any) {
      Alert.alert("Could not read PDF", e.message || "Try another file.");
    }
  };

  const openPdf = async (t: Ticket) => {
    try {
      let full = t;
      if (!full.file_base64) {
        // list responses may omit file_base64 in future; fetch full
        full = await api.update("tickets", t.id, {}); // no-op patch returns full doc
      }
      if (!full.file_base64) return;
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.open(`data:${full.file_mime || "application/pdf"};base64,${full.file_base64}`, "_blank");
        return;
      }
      const target = `${FileSystem.cacheDirectory}ticket-${full.id}.pdf`;
      await FileSystem.writeAsStringAsync(target, full.file_base64, { encoding: FileSystem.EncodingType.Base64 });
      const supported = await Linking.canOpenURL(target);
      if (supported) await Linking.openURL(target);
    } catch (e: any) {
      Alert.alert("Could not open PDF", e.message || "Try again later.");
    }
  };

  const linkOptions = (type: Ticket["ticket_type"]) => {
    if (type === "flight") return flights.map((f) => ({ id: f.id, label: `${f.airline} ${f.flight_number}`.trim() || "Flight" }));
    if (type === "transport") return transport.map((t) => ({ id: t.id, label: `${t.transport_type} · ${t.departure_location} → ${t.arrival_location}` }));
    if (type === "stay") return stays.map((t) => ({ id: t.id, label: t.accommodation_name || "Stay" }));
    if (type === "attraction") return attractions.map((t) => ({ id: t.id, label: t.name || "Attraction" }));
    return [];
  };

  const linkedLabel = (ticket: Ticket): string | null => {
    if (!ticket.linked_item_id) return null;
    const opts = linkOptions(ticket.ticket_type);
    return opts.find((o) => o.id === ticket.linked_item_id)?.label || null;
  };

  return (
    <>
      <ListWrapper
        isEmpty={tickets.length === 0}
        emptyIcon="ticket-outline"
        emptyText="Keep all bookings in one place. Add your first ticket."
        onAdd={() => setModal(empty(trip.id, trip.currency))}
        addLabel="Add ticket"
        testID="add-ticket-fab"
      >
        {tickets.map((t) => {
          const typeIcon = TYPES.find((x) => x.key === t.ticket_type)?.icon || "ticket-outline";
          const linked = linkedLabel(t);
          const focused = nav.focusId === t.id;
          return (
            <Pressable key={t.id} onPress={() => setModal(t)} style={[s.card, focused && s.cardFocused]} testID={`ticket-${t.id}`}>
              {t.photo ? (
                <Image source={{ uri: t.photo }} style={s.photo} contentFit="cover" />
              ) : t.file_base64 || t.file_name ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); openPdf(t); }}
                  style={[s.photo, { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary, flexDirection: "column", gap: 8 }]}
                >
                  <Icon name="file-pdf-box" size={40} color={colors.brandPrimary} />
                  <Text style={{ color: colors.onBrandTertiary, fontWeight: "600" }} numberOfLines={1}>
                    {t.file_name || "Attached PDF"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Icon name="open-in-new" size={12} color={colors.brandPrimary} />
                    <Text style={{ color: colors.brandPrimary, fontSize: 12 }}>Open PDF</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={[s.photo, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }]}>
                  <Icon name="image-outline" size={32} color={colors.muted} />
                </View>
              )}
              <View style={{ padding: spacing.md, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name={typeIcon as any} size={14} color={colors.brandPrimary} />
                  <Text style={s.typeLabel}>{t.ticket_type.toUpperCase()}</Text>
                  {t.cost > 0 && <Text style={s.cost}> · {formatMoney(t.cost, t.cost_currency)}</Text>}
                </View>
                {!!t.details && <Text style={s.details} numberOfLines={2}>{t.details}</Text>}
                {!!t.link && (
                  <Pressable onPress={() => Linking.openURL(t.link)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Icon name="open-in-new" size={12} color={colors.brandPrimary} />
                    <Text style={s.linkTxt} numberOfLines={1}>{t.link}</Text>
                  </Pressable>
                )}
                {linked && (t.ticket_type === "flight" || t.ticket_type === "transport" || t.ticket_type === "stay" || t.ticket_type === "attraction") ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); nav.goToItem(t.ticket_type as any, t.linked_item_id); }}
                    style={s.linkChip}
                    testID={`view-item-${t.id}`}
                  >
                    <Icon name={typeIcon as any} size={14} color={colors.brandPrimary} />
                    <Text style={s.linkChipTxt} numberOfLines={1}>View {t.ticket_type}: {linked}</Text>
                    <Icon name="chevron-right" size={14} color={colors.brandPrimary} />
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ListWrapper>

      <FormModal
        visible={!!modal}
        title={modal?.id ? "Edit Ticket" : "New Ticket"}
        onClose={() => setModal(null)}
        onSave={() => modal && save.mutate(modal)}
        onDelete={modal?.id ? () => del.mutate(modal.id) : undefined}
        isSaving={save.isPending}
      >
        {modal && (
          <>
            <Field label="Attach photo or PDF">
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Pressable testID="ticket-photo-btn" onPress={pickPhoto} style={s.photoPicker}>
                  {modal.photo ? (
                    <Image source={{ uri: modal.photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={{ alignItems: "center" }}>
                      <Icon name="image-plus" size={26} color={colors.muted} />
                      <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>Photo</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable testID="ticket-pdf-btn" onPress={pickPdf} style={s.photoPicker}>
                  {modal.file_base64 || modal.file_name ? (
                    <View style={{ alignItems: "center" }}>
                      <Icon name="file-pdf-box" size={30} color={colors.brandPrimary} />
                      <Text style={{ color: colors.onSurface, marginTop: 4, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
                        {modal.file_name || "PDF"}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: "center" }}>
                      <Icon name="file-pdf-box" size={26} color={colors.muted} />
                      <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>PDF</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </Field>

            <Field label="Type">
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {TYPES.map((tp) => {
                  const active = modal.ticket_type === tp.key;
                  return (
                    <Pressable key={tp.key} testID={`ticket-type-${tp.key}`} onPress={() => setModal({ ...modal, ticket_type: tp.key, linked_item_id: "" })} style={[s.typeChip, active && s.typeChipActive]}>
                      <Icon name={tp.icon as any} size={14} color={active ? colors.onBrandPrimary : colors.onSurface} />
                      <Text style={[s.typeText, active && { color: colors.onBrandPrimary }]}>{tp.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            {modal.ticket_type !== "other" && (
              <Field label={`Link to a ${modal.ticket_type}`}>
                <View style={{ gap: 6 }}>
                  {linkOptions(modal.ticket_type).length === 0 ? (
                    <Text style={{ color: colors.muted, fontSize: 13 }}>Nothing to link. Add a {modal.ticket_type} first.</Text>
                  ) : (
                    linkOptions(modal.ticket_type).map((opt) => {
                      const active = opt.id === modal.linked_item_id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => setModal({ ...modal, linked_item_id: active ? "" : opt.id })}
                          style={[s.linkOption, active && s.linkOptionActive]}
                        >
                          <Icon name={active ? "check-circle" : "circle-outline"} size={18} color={active ? colors.brandPrimary : colors.muted} />
                          <Text style={[s.linkOptTxt, active && { color: colors.onSurface, fontWeight: "600" }]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </Field>
            )}

            <Field label="Details">
              <Input value={modal.details} onChangeText={(v) => setModal({ ...modal, details: v })} multiline placeholder="Confirmation #, seat, etc." testID="input-ticket-details" />
            </Field>
            <Field label="Link">
              <Input value={modal.link} onChangeText={(v) => setModal({ ...modal, link: v })} keyboardType="url" autoCapitalize="none" placeholder="https://..." />
            </Field>
            <Field label="Cost">
              <CostInput
                amount={modal.cost}
                currency={modal.cost_currency || trip.currency}
                onChange={(amount, code) => setModal({ ...modal, cost: amount, cost_currency: code })}
              />
            </Field>
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardFocused: { borderColor: colors.brandPrimary, borderWidth: 2 },
  photo: { width: "100%", height: 160 },
  typeLabel: { fontSize: 11, fontWeight: "600", color: colors.brandPrimary, letterSpacing: 0.5 },
  cost: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  details: { fontSize: 14, color: colors.onSurface },
  linkTxt: { color: colors.brandPrimary, fontSize: 12, flex: 1 },
  linkChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, backgroundColor: colors.brandTertiary,
  },
  linkChipTxt: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: "600", flex: 1 },
  photoPicker: { flex: 1, height: 140, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeText: { color: colors.onSurface, fontSize: 13, fontWeight: "500" },
  linkOption: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  linkOptionActive: { borderColor: colors.brandPrimary },
  linkOptTxt: { color: colors.onSurfaceSecondary, flex: 1 },
});
