import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { Input } from "@/src/components/form";

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
  const [text, setText] = React.useState("");
  const [imageUri, setImageUri] = React.useState("");

  const reset = () => {
    setText("");
    setImageUri("");
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
    if (!res.canceled && res.assets[0]) setImageUri(res.assets[0].uri);
  };

  const run = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (text.trim()) body.text = text.trim();
      if (imageUri) {
        const b64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
        body.image_base64 = b64;
        body.mime = imageUri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      }
      if (!body.text && !body.image_base64) throw new Error("Paste text or add a screenshot first.");

      const parsed = await api.parseBooking(body);
      const cat = parsed.category;
      const data = parsed.data || {};
      const ticket = parsed.ticket || {};

      let created: any = null;

      if (cat === "flight") {
        created = await api.create("flights", trip.id, {
          id: "", trip_id: "",
          airline: data.airline || "",
          flight_number: data.flight_number || "",
          departure_location: data.departure_location || "",
          departure_datetime: data.departure_datetime || "",
          arrival_location: data.arrival_location || "",
          arrival_datetime: data.arrival_datetime || "",
          layovers: Array.isArray(data.layovers) ? data.layovers : [],
          booking_status: "booked",
          cost: parseFloat(ticket.cost) || 0,
          notes: ticket.details || "",
          ticket_id: "",
          departure_latitude: null, departure_longitude: null,
          arrival_latitude: null, arrival_longitude: null,
        });
      } else if (cat === "transport") {
        created = await api.create("transport", trip.id, {
          id: "", trip_id: "",
          transport_type: ["car", "bus", "train", "ferry", "other"].includes(data.transport_type) ? data.transport_type : "other",
          departure_location: data.departure_location || "",
          departure_datetime: data.departure_datetime || "",
          arrival_location: data.arrival_location || "",
          arrival_datetime: data.arrival_datetime || "",
          notes: data.notes || ticket.details || "",
          booking_status: "booked",
          cost: parseFloat(ticket.cost) || 0,
          ticket_id: "",
          departure_latitude: null, departure_longitude: null,
          arrival_latitude: null, arrival_longitude: null,
        });
      } else if (cat === "stay") {
        created = await api.create("stays", trip.id, {
          id: "", trip_id: "",
          accommodation_name: data.accommodation_name || "",
          location: data.location || "",
          checkin_datetime: data.checkin_datetime || "",
          checkout_datetime: data.checkout_datetime || "",
          booking_link: data.booking_link || ticket.link || "",
          breakfast_included: !!data.breakfast_included,
          dinner_included: !!data.dinner_included,
          booking_status: "booked",
          cost: parseFloat(ticket.cost) || 0,
          ticket_id: "",
          latitude: null, longitude: null,
        });
      } else if (cat === "attraction") {
        created = await api.create("attractions", trip.id, {
          id: "", trip_id: "",
          name: data.name || "",
          location: data.location || "",
          activity_datetime: data.activity_datetime || "",
          website_link: data.website_link || ticket.link || "",
          booking_status: "booked",
          cost: parseFloat(ticket.cost) || 0,
          ticket_id: "",
          latitude: null, longitude: null,
        });
      } else {
        throw new Error("Could not detect a booking category. Try a clearer image or paste text.");
      }

      // Optional: create linked ticket
      if (created?.id && (ticket.cost || ticket.details || ticket.link || ticket.confirmation)) {
        await api.create("tickets", trip.id, {
          id: "", trip_id: "",
          link: ticket.link || "",
          photo: "",
          cost: parseFloat(ticket.cost) || 0,
          details: ticket.details || ticket.confirmation || "",
          ticket_type: cat,
          linked_item_id: created.id,
        });
      }

      return cat;
    },
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ["flights", trip.id] });
      qc.invalidateQueries({ queryKey: ["transport", trip.id] });
      qc.invalidateQueries({ queryKey: ["stays", trip.id] });
      qc.invalidateQueries({ queryKey: ["attractions", trip.id] });
      qc.invalidateQueries({ queryKey: ["tickets", trip.id] });
      reset();
      onDone(cat);
    },
    onError: (e: any) => {
      Alert.alert("Could not import", e.message || "Try a different image or text.");
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
          <Text style={s.title}>Auto-import booking</Text>
          <Pressable
            onPress={() => run.mutate()}
            disabled={run.isPending}
            style={[s.confirmBtn, run.isPending && { opacity: 0.6 }]}
            testID="autoadd-run"
          >
            {run.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.confirmTxt}>Import</Text>}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={s.intro}>
            <Icon name="auto-fix" size={22} color={colors.brandPrimary} />
            <Text style={s.introTxt}>
              Paste a booking confirmation (any airline, hotel, tour, transport) or upload a screenshot. It will be classified and added to the right tab, along with a linked ticket.
            </Text>
          </View>

          <Text style={s.sectionTitle}>1. Add a screenshot</Text>
          <Pressable testID="autoadd-pick" onPress={pickImage} style={s.imagePicker}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={{ alignItems: "center" }}>
                <Icon name="image-plus" size={28} color={colors.muted} />
                <Text style={{ color: colors.muted, marginTop: 4 }}>Pick a booking screenshot</Text>
              </View>
            )}
            {imageUri ? (
              <Pressable
                onPress={() => setImageUri("")}
                style={s.clearImg}
                hitSlop={10}
                testID="autoadd-clear-image"
              >
                <Icon name="close" size={16} color="#fff" />
              </Pressable>
            ) : null}
          </Pressable>

          <Text style={s.sectionTitle}>2. Or paste confirmation text</Text>
          <Input
            testID="autoadd-text"
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Paste your flight / hotel / activity confirmation text here…"
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
});
