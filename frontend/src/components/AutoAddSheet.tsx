import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { readUriAsBase64 } from "@/src/utils/fileRead";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { Input } from "@/src/components/form";
import { useI18n } from "@/src/i18n";
import { autoMatchAddress } from "@/src/utils/geoMatch";

type Cat = "flight" | "transport" | "stay" | "attraction";

// Snapshot of what was imported so we can surface a summary to the user.
type ImportResult = {
  ok: number;
  addressWarnings: string[]; // human-readable "no match" lines
  categories: Set<string>;
};

export function AutoAddSheet({
  visible,
  onClose,
  trip,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  trip: Trip;
  onDone: (category: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { t } = useI18n();
  const [text, setText] = React.useState("");
  const [fileUri, setFileUri] = React.useState("");
  const [fileMime, setFileMime] = React.useState("");
  const [fileName, setFileName] = React.useState("");

  const reset = () => {
    setText("");
    setFileUri("");
    setFileMime("");
    setFileName("");
  };

  const closeReset = () => {
    reset();
    onClose();
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to import screenshots.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: false,
    });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setFileUri(a.uri);
      setFileMime(a.mimeType || (a.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"));
      setFileName(a.fileName || "screenshot");
    }
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setFileUri(a.uri);
    setFileMime(a.mimeType || "application/pdf");
    setFileName(a.name || "booking.pdf");
  };

  // Resolves a raw address into { location, latitude, longitude }, auto-
  // picking the top Nominatim hit if the score is high enough. Pushes a
  // warning into `warnings` if we couldn't confidently match it.
  const resolve = async (raw: string, warnings: string[]): Promise<{ location: string; latitude: number | null; longitude: number | null }> => {
    if (!raw) return { location: "", latitude: null, longitude: null };
    const res = await autoMatchAddress(raw);
    if (res.unresolved) {
      if (res.original) warnings.push(res.original);
      // Keep the raw string so the user still sees what the AI extracted;
      // they can tap it and manually pick from the dropdown.
      return { location: raw, latitude: null, longitude: null };
    }
    return { location: res.geo.location, latitude: res.geo.latitude, longitude: res.geo.longitude };
  };

  const importOne = async (item: any, warnings: string[]): Promise<{ category: Cat | null; id: string | null }> => {
    const cat = item.category as Cat | "unknown";
    const data = item.data || {};
    const ticket = item.ticket || {};

    if (cat === "flight") {
      const dep = await resolve(data.departure_location || "", warnings);
      const arr = await resolve(data.arrival_location || "", warnings);
      const layovers: any[] = [];
      if (Array.isArray(data.layovers)) {
        for (const l of data.layovers) {
          const g = await resolve(l.location || "", warnings);
          layovers.push({ ...l, location: g.location, latitude: g.latitude, longitude: g.longitude });
        }
      }
      const created = await api.create("flights", trip.id, {
        id: "", trip_id: "",
        airline: data.airline || "",
        flight_number: data.flight_number || "",
        departure_location: dep.location,
        departure_datetime: data.departure_datetime || "",
        arrival_location: arr.location,
        arrival_datetime: data.arrival_datetime || "",
        layovers,
        booking_status: "booked",
        cost: parseFloat(ticket.cost) || 0,
        cost_currency: ticket.cost_currency || trip.currency || "USD",
        notes: ticket.details || "",
        ticket_id: "",
        departure_latitude: dep.latitude, departure_longitude: dep.longitude,
        arrival_latitude: arr.latitude, arrival_longitude: arr.longitude,
      });
      return { category: "flight", id: created?.id || null };
    }

    if (cat === "transport") {
      const dep = await resolve(data.departure_location || "", warnings);
      const arr = await resolve(data.arrival_location || "", warnings);
      const created = await api.create("transport", trip.id, {
        id: "", trip_id: "",
        transport_type: ["car", "bus", "train", "ferry", "other"].includes(data.transport_type) ? data.transport_type : "other",
        departure_location: dep.location,
        departure_datetime: data.departure_datetime || "",
        arrival_location: arr.location,
        arrival_datetime: data.arrival_datetime || "",
        notes: data.notes || ticket.details || "",
        booking_status: "booked",
        cost: parseFloat(ticket.cost) || 0,
        cost_currency: ticket.cost_currency || trip.currency || "USD",
        ticket_id: "",
        departure_latitude: dep.latitude, departure_longitude: dep.longitude,
        arrival_latitude: arr.latitude, arrival_longitude: arr.longitude,
      });
      return { category: "transport", id: created?.id || null };
    }

    if (cat === "stay") {
      const loc = await resolve(data.location || data.accommodation_name || "", warnings);
      const created = await api.create("stays", trip.id, {
        id: "", trip_id: "",
        accommodation_name: data.accommodation_name || "",
        location: loc.location,
        checkin_datetime: data.checkin_datetime || "",
        checkout_datetime: data.checkout_datetime || "",
        booking_link: data.booking_link || ticket.link || "",
        breakfast_included: !!data.breakfast_included,
        dinner_included: !!data.dinner_included,
        booking_status: "booked",
        cost: parseFloat(ticket.cost) || 0,
        cost_currency: ticket.cost_currency || trip.currency || "USD",
        ticket_id: "",
        latitude: loc.latitude, longitude: loc.longitude,
      });
      return { category: "stay", id: created?.id || null };
    }

    if (cat === "attraction") {
      const loc = await resolve(data.location || data.name || "", warnings);
      const created = await api.create("attractions", trip.id, {
        id: "", trip_id: "",
        name: data.name || "",
        location: loc.location,
        activity_datetime: data.activity_datetime || "",
        website_link: data.website_link || ticket.link || "",
        notes: data.notes || "",
        booking_status: "booked",
        cost: parseFloat(ticket.cost) || 0,
        cost_currency: ticket.cost_currency || trip.currency || "USD",
        ticket_id: "",
        latitude: loc.latitude, longitude: loc.longitude,
      });
      return { category: "attraction", id: created?.id || null };
    }

    return { category: null, id: null };
  };

  const run = useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      const body: any = {};
      if (text.trim()) body.text = text.trim();
      if (fileUri) {
        try {
          const b64 = await readUriAsBase64(fileUri);
          body.image_base64 = b64;
          body.mime = fileMime || (fileUri.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
        } catch (readErr: any) {
          throw new Error(`Couldn't read that file. Try picking it again (${readErr?.message || "read failed"}).`);
        }
      }
      if (!body.text && !body.image_base64) throw new Error("Paste text or add a screenshot / PDF first.");

      const parsed = await api.parseBookingMulti(body);
      const items = (parsed?.items || []).filter((it: any) => it && it.category && it.category !== "unknown");
      if (items.length === 0) throw new Error(t("autoAdd.noneDetected"));

      const warnings: string[] = [];
      const categories = new Set<string>();
      let ok = 0;

      for (const it of items) {
        try {
          const res = await importOne(it, warnings);
          if (res.category && res.id) {
            categories.add(res.category);
            ok += 1;
            const tkt = it.ticket || {};
            if (tkt.cost || tkt.details || tkt.link || tkt.confirmation) {
              await api.create("tickets", trip.id, {
                id: "", trip_id: "",
                link: tkt.link || "",
                photo: "",
                cost: parseFloat(tkt.cost) || 0,
                cost_currency: tkt.cost_currency || trip.currency || "USD",
                details: tkt.details || tkt.confirmation || "",
                ticket_type: res.category,
                linked_item_id: res.id,
              });
            }
          }
        } catch (e) {
          // best-effort: skip failing item, keep going
          console.warn("import item failed", e);
        }
      }
      return { ok, addressWarnings: warnings, categories };
    },
    onSuccess: (res) => {
      // Invalidate every affected list
      ["flights", "transport", "stays", "attractions", "tickets"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k, trip.id] }),
      );
      reset();
      const primary = Array.from(res.categories)[0] || "flight";

      // User-facing feedback
      const okMsg = res.addressWarnings.length > 0
        ? t("autoAdd.somefailed", { ok: res.ok, fail: res.addressWarnings.length })
        : t("autoAdd.imported", { n: res.ok });
      const warnText = res.addressWarnings.length
        ? "\n\n• " + res.addressWarnings.slice(0, 5).join("\n• ") + (res.addressWarnings.length > 5 ? `\n… +${res.addressWarnings.length - 5}` : "")
        : "";

      Alert.alert(t("autoAdd.detected", { n: res.ok }), okMsg + warnText);
      onDone(primary);
    },
    onError: (e: any) => {
      Alert.alert(t("autoAdd.parseFailed"), e?.message || t("autoAdd.parseFailedBody"));
    },
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeReset}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.surface }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[s.header, { paddingTop: Platform.OS === "android" ? insets.top + spacing.sm : spacing.md }]}>
          <Pressable onPress={closeReset} style={{ padding: spacing.sm }} testID="autoadd-close">
            <Icon name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={s.title}>{t("autoAdd.title")}</Text>
          <Pressable
            onPress={() => run.mutate()}
            disabled={run.isPending}
            style={[s.confirmBtn, run.isPending && { opacity: 0.6 }]}
            testID="autoadd-run"
          >
            {run.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.confirmTxt}>{t("autoAdd.import")}</Text>}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={s.intro}>
            <Icon name="auto-fix" size={22} color={colors.brandPrimary} />
            <Text style={s.introTxt}>{t("autoAdd.intro")}</Text>
          </View>

          <Text style={s.sectionTitle}>{t("autoAdd.section1")}</Text>
          <Pressable testID="autoadd-pick" onPress={pickImage} style={s.imagePicker}>
            {fileUri && fileMime.startsWith("image/") ? (
              <Image source={{ uri: fileUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : fileUri ? (
              <View style={{ alignItems: "center" }}>
                <Icon name="file-pdf-box" size={40} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, marginTop: 4, fontWeight: "600" }} numberOfLines={1}>
                  {fileName || "booking.pdf"}
                </Text>
              </View>
            ) : (
              <View style={{ alignItems: "center" }}>
                <Icon name="image-plus" size={28} color={colors.muted} />
                <Text style={{ color: colors.muted, marginTop: 4 }}>{t("autoAdd.pickImage")}</Text>
              </View>
            )}
            {fileUri ? (
              <Pressable
                onPress={() => { setFileUri(""); setFileMime(""); setFileName(""); }}
                style={s.clearImg}
                hitSlop={10}
                testID="autoadd-clear-image"
              >
                <Icon name="close" size={16} color="#fff" />
              </Pressable>
            ) : null}
          </Pressable>

          <Pressable testID="autoadd-pick-pdf" onPress={pickPdf} style={s.pdfBtn}>
            <Icon name="file-pdf-box" size={18} color={colors.onSurface} />
            <Text style={s.pdfBtnTxt}>{t("autoAdd.pickPdf")}</Text>
          </Pressable>

          <Text style={s.sectionTitle}>{t("autoAdd.section2")}</Text>
          <Input
            testID="autoadd-text"
            value={text}
            onChangeText={setText}
            multiline
            placeholder={t("autoAdd.placeholder")}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
    minWidth: 74,
    alignItems: "center",
  },
  confirmTxt: { color: colors.onBrandPrimary, fontWeight: "600" },
  intro: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.brandTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xl,
  },
  introTxt: { flex: 1, color: colors.onBrandTertiary, fontSize: 13, lineHeight: 18 },
  sectionTitle: { color: colors.muted, textTransform: "uppercase", fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md },
  imagePicker: {
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  clearImg: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pdfBtn: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  pdfBtnTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
});
