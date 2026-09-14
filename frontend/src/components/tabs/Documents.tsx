import React from "react";
import { View, Text, StyleSheet, Pressable, Linking, Alert, Platform } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import {
  api,
  type Attraction,
  type Doc,
  type DocumentKind,
  type Flight,
  type LinkedType,
  type Stay,
  type Ticket,
  type Transport,
  type Trip,
} from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { Field, Input } from "@/src/components/form";
import { FormModal, ListWrapper } from "@/src/components/tab-shell";
import type { TabNav } from "@/app/trip/[id]";

const LINK_TYPES: { key: LinkedType; label: string; icon: string }[] = [
  { key: "none", label: "None", icon: "close-circle-outline" },
  { key: "flight", label: "Flight", icon: "airplane" },
  { key: "transport", label: "Transport", icon: "car" },
  { key: "stay", label: "Stay", icon: "bed-outline" },
  { key: "attraction", label: "Attraction", icon: "map-marker-outline" },
  { key: "ticket", label: "Ticket", icon: "ticket-outline" },
];

const empty = (trip_id: string): Doc => ({
  id: "",
  trip_id,
  name: "",
  kind: "other",
  mime: "",
  file_base64: "",
  size: 0,
  notes: "",
  linked_type: "none",
  linked_item_id: "",
  created_at: "",
});

const fmtSize = (bytes: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const inferKind = (mime: string, name: string): DocumentKind => {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/i.test(n)) return "photo";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  return "other";
};

const kindIcon = (k: DocumentKind) => (k === "photo" ? "image-outline" : k === "pdf" ? "file-pdf-box" : "file-outline");

export default function DocumentsTab({ trip, nav }: { trip: Trip; nav: TabNav }) {
  const qc = useQueryClient();
  const [modal, setModal] = React.useState<Doc | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const { data: documents = [] } = useQuery<Doc[]>({
    queryKey: ["documents", trip.id],
    queryFn: () => api.list("documents", trip.id),
  });
  const { data: flights = [] } = useQuery<Flight[]>({ queryKey: ["flights", trip.id], queryFn: () => api.list("flights", trip.id) });
  const { data: transport = [] } = useQuery<Transport[]>({ queryKey: ["transport", trip.id], queryFn: () => api.list("transport", trip.id) });
  const { data: stays = [] } = useQuery<Stay[]>({ queryKey: ["stays", trip.id], queryFn: () => api.list("stays", trip.id) });
  const { data: attractions = [] } = useQuery<Attraction[]>({ queryKey: ["attractions", trip.id], queryFn: () => api.list("attractions", trip.id) });
  const { data: tickets = [] } = useQuery<Ticket[]>({ queryKey: ["tickets", trip.id], queryFn: () => api.list("tickets", trip.id) });

  const save = useMutation({
    mutationFn: async (d: Doc) => (d.id ? api.update("documents", d.id, d) : api.create("documents", trip.id, d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", trip.id] });
      setModal(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.remove("documents", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", trip.id] });
      setModal(null);
    },
  });

  const pickPhoto = async () => {
    if (!modal) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: false,
    });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    try {
      const asset = res.assets[0];
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = asset.mimeType || (asset.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
      const name = asset.fileName || `photo-${Date.now()}.${mime.includes("png") ? "png" : "jpg"}`;
      setModal({
        ...modal,
        file_base64: b64,
        mime,
        name: modal.name || name,
        kind: "photo",
        size: Math.floor((b64.length * 3) / 4),
      });
    } catch (e: any) {
      Alert.alert("Could not read image", e.message || "Try another file.");
    } finally {
      setUploading(false);
    }
  };

  const pickFile = async () => {
    if (!modal) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setUploading(true);
    try {
      const asset = res.assets[0];
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = asset.mimeType || "";
      const kind = inferKind(mime, asset.name);
      const decoded = Math.floor((b64.length * 3) / 4);
      if (decoded > 8 * 1024 * 1024) {
        Alert.alert("File too large", "Maximum size is 8 MB per document.");
        return;
      }
      setModal({
        ...modal,
        file_base64: b64,
        mime,
        name: modal.name || asset.name || "document",
        kind,
        size: decoded,
      });
    } catch (e: any) {
      Alert.alert("Could not read file", e.message || "Try another file.");
    } finally {
      setUploading(false);
    }
  };

  const linkOptions = (type: LinkedType) => {
    if (type === "flight") return flights.map((f) => ({ id: f.id, label: `${f.airline} ${f.flight_number}`.trim() || "Flight" }));
    if (type === "transport") return transport.map((t) => ({ id: t.id, label: `${t.transport_type} · ${t.departure_location} → ${t.arrival_location}` }));
    if (type === "stay") return stays.map((t) => ({ id: t.id, label: t.accommodation_name || "Stay" }));
    if (type === "attraction") return attractions.map((t) => ({ id: t.id, label: t.name || "Attraction" }));
    if (type === "ticket") return tickets.map((t) => ({ id: t.id, label: t.details || `${t.ticket_type} ticket` }));
    return [];
  };

  const linkedLabel = (d: Doc): string | null => {
    if (d.linked_type === "none" || !d.linked_item_id) return null;
    const opts = linkOptions(d.linked_type);
    return opts.find((o) => o.id === d.linked_item_id)?.label || null;
  };

  const openDocument = async (d: Doc) => {
    try {
      // Fetch with blob (list responses have stripped file_base64)
      const full = await api.getDocument(d.id);
      if (!full.file_base64) {
        Alert.alert("No file", "This document has no attached file.");
        return;
      }
      const dataUri = `data:${full.mime || "application/octet-stream"};base64,${full.file_base64}`;
      if (Platform.OS === "web") {
        try {
          if (typeof window !== "undefined") window.open(dataUri, "_blank");
        } catch {
          Alert.alert("Preview unavailable", "Could not open the file in this browser.");
        }
        return;
      }
      // Native: write to cache dir then open via system viewer
      const safeExt = full.mime === "application/pdf" ? "pdf" : full.mime?.includes("png") ? "png" : "jpg";
      const target = `${FileSystem.cacheDirectory}doc-${full.id}.${safeExt}`;
      await FileSystem.writeAsStringAsync(target, full.file_base64, { encoding: FileSystem.EncodingType.Base64 });
      const supported = await Linking.canOpenURL(target);
      if (supported) {
        await Linking.openURL(target);
      } else {
        Alert.alert("No app available", "Install a PDF/photo viewer to open this file.");
      }
    } catch (e: any) {
      Alert.alert("Could not open", e.message || "Try again later.");
    }
  };

  const goToLinked = (d: Doc) => {
    if (!d.linked_item_id) return;
    if (d.linked_type === "ticket") {
      nav.goToTicket(d.linked_item_id);
    } else if (
      d.linked_type === "flight" ||
      d.linked_type === "transport" ||
      d.linked_type === "stay" ||
      d.linked_type === "attraction"
    ) {
      nav.goToItem(d.linked_type, d.linked_item_id);
    }
  };

  return (
    <>
      <ListWrapper
        isEmpty={documents.length === 0}
        emptyIcon="file-multiple-outline"
        emptyText="Attach visas, boarding passes, reservations, or any file that doesn't fit another tab."
        onAdd={() => setModal(empty(trip.id))}
        addLabel="Add document"
        testID="add-document-fab"
      >
        {documents.map((d) => {
          const linked = linkedLabel(d);
          const focused = nav.focusId === d.id;
          return (
            <Pressable
              key={d.id}
              onPress={() => setModal(d)}
              style={[s.card, focused && s.cardFocused]}
              testID={`document-${d.id}`}
            >
              <View style={s.iconBox}>
                <Icon name={kindIcon(d.kind) as any} size={30} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.name} numberOfLines={1}>{d.name || "Untitled"}</Text>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <Text style={s.meta}>{d.kind.toUpperCase()}</Text>
                  {!!d.size && <Text style={s.meta}>· {fmtSize(d.size)}</Text>}
                </View>
                {!!d.notes && <Text style={s.notes} numberOfLines={1}>{d.notes}</Text>}
                {linked ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); goToLinked(d); }}
                    style={s.linkChip}
                    testID={`view-linked-${d.id}`}
                  >
                    <Icon name={LINK_TYPES.find((x) => x.key === d.linked_type)?.icon as any || "link"} size={12} color={colors.brandPrimary} />
                    <Text style={s.linkChipTxt} numberOfLines={1}>View {d.linked_type}: {linked}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); openDocument(d); }}
                style={s.viewBtn}
                testID={`open-doc-${d.id}`}
                hitSlop={10}
              >
                <Icon name="open-in-new" size={18} color={colors.brandPrimary} />
              </Pressable>
            </Pressable>
          );
        })}
      </ListWrapper>

      <FormModal
        visible={!!modal}
        title={modal?.id ? "Edit Document" : "New Document"}
        onClose={() => setModal(null)}
        onSave={() => modal && save.mutate(modal)}
        onDelete={modal?.id ? () => del.mutate(modal.id) : undefined}
        isSaving={save.isPending || uploading}
      >
        {modal && (
          <>
            <Field label="File">
              <View style={{ gap: spacing.sm }}>
                <View style={s.previewBox}>
                  {modal.file_base64 && modal.kind === "photo" ? (
                    <Image
                      source={{ uri: `data:${modal.mime || "image/jpeg"};base64,${modal.file_base64}` }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : modal.file_base64 ? (
                    <View style={{ alignItems: "center" }}>
                      <Icon name={kindIcon(modal.kind) as any} size={40} color={colors.brandPrimary} />
                      <Text style={{ color: colors.onSurface, marginTop: 6, fontWeight: "600" }}>
                        {modal.kind.toUpperCase()} · {fmtSize(modal.size)}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: "center" }}>
                      <Icon name="file-plus-outline" size={28} color={colors.muted} />
                      <Text style={{ color: colors.muted, marginTop: 4 }}>Pick a file</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Pressable testID="doc-pick-photo" onPress={pickPhoto} style={s.pickBtn}>
                    <Icon name="image-plus" size={18} color={colors.onSurface} />
                    <Text style={s.pickTxt}>Photo</Text>
                  </Pressable>
                  <Pressable testID="doc-pick-file" onPress={pickFile} style={s.pickBtn}>
                    <Icon name="file-plus-outline" size={18} color={colors.onSurface} />
                    <Text style={s.pickTxt}>PDF / File</Text>
                  </Pressable>
                </View>
              </View>
            </Field>

            <Field label="Name">
              <Input
                value={modal.name}
                onChangeText={(v) => setModal({ ...modal, name: v })}
                placeholder="Visa scan, boarding pass, insurance…"
                testID="input-doc-name"
              />
            </Field>

            <Field label="Notes">
              <Input
                value={modal.notes}
                onChangeText={(v) => setModal({ ...modal, notes: v })}
                multiline
                placeholder="Anything you want to remember about this file"
              />
            </Field>

            <Field label="Link to (optional)">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {LINK_TYPES.map((lt) => {
                  const active = modal.linked_type === lt.key;
                  return (
                    <Pressable
                      key={lt.key}
                      testID={`doc-linktype-${lt.key}`}
                      onPress={() => setModal({ ...modal, linked_type: lt.key, linked_item_id: "" })}
                      style={[s.chip, active && s.chipActive]}
                    >
                      <Icon name={lt.icon as any} size={14} color={active ? colors.onBrandPrimary : colors.onSurface} />
                      <Text style={[s.chipTxt, active && { color: colors.onBrandPrimary }]}>{lt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            {modal.linked_type !== "none" && (
              <Field label={`Select a ${modal.linked_type}`}>
                <View style={{ gap: 6 }}>
                  {linkOptions(modal.linked_type).length === 0 ? (
                    <Text style={{ color: colors.muted, fontSize: 13 }}>
                      Nothing to link. Add a {modal.linked_type} first.
                    </Text>
                  ) : (
                    linkOptions(modal.linked_type).map((opt) => {
                      const active = opt.id === modal.linked_item_id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => setModal({ ...modal, linked_item_id: active ? "" : opt.id })}
                          style={[s.linkOption, active && s.linkOptionActive]}
                        >
                          <Icon
                            name={active ? "check-circle" : "circle-outline"}
                            size={18}
                            color={active ? colors.brandPrimary : colors.muted}
                          />
                          <Text style={[s.linkOptTxt, active && { fontWeight: "600" }]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </Field>
            )}
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardFocused: { borderColor: colors.brandPrimary, borderWidth: 2 },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 15, color: colors.onSurface, fontWeight: "600" },
  meta: { fontSize: 11, color: colors.muted, fontWeight: "500" },
  notes: { fontSize: 12, color: colors.onSurfaceSecondary },
  viewBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  linkChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  linkChipTxt: { color: colors.onBrandTertiary, fontSize: 11, fontWeight: "600" },
  previewBox: {
    height: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  pickTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontSize: 13, fontWeight: "500" },
  linkOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  linkOptionActive: { borderColor: colors.brandPrimary },
  linkOptTxt: { color: colors.onSurfaceSecondary, flex: 1 },
});
