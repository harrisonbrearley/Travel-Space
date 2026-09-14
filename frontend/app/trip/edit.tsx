import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";

import { api, type Trip } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { DateTimeInput, Field, Input } from "@/src/components/form";
import { CurrencyPickerButton } from "@/src/components/CostInput";

const CATS: { key: Trip["category"]; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "wishlist", label: "Wishlist" },
];

export default function EditTripScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isNew = !params.id || params.id === "new";
  const qc = useQueryClient();

  const { data: existing } = useQuery<Trip>({
    queryKey: ["trip", params.id],
    queryFn: () => api.getTrip(params.id!),
    enabled: !isNew,
  });

  const [name, setName] = React.useState("");
  const [destination, setDestination] = React.useState("");
  const [category, setCategory] = React.useState<Trip["category"]>("upcoming");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [photo, setPhoto] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");

  React.useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDestination(existing.destination);
      setCategory(existing.category);
      setStart(existing.start_date);
      setEnd(existing.end_date);
      setBudget(String(existing.budget_planned || ""));
      setPhoto(existing.cover_photo);
      setCurrency(existing.currency || "USD");
    }
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim() || "Untitled Trip",
        destination,
        category,
        start_date: start,
        end_date: end,
        budget_planned: parseFloat(budget) || 0,
        currency: currency || "USD",
        cover_photo: photo,
      };
      if (isNew) return api.createTrip(payload);
      return api.updateTrip(params.id!, payload);
    },
    onSuccess: (t: any) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip", t.id] });
      if (isNew) router.replace(`/trip/${t.id}`);
      else router.back();
    },
  });

  const del = useMutation({
    mutationFn: () => api.deleteTrip(params.id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      router.replace("/");
    },
  });

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access to add a cover.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[s.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={s.iconBtn}>
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={s.topTitle}>{isNew ? "New Trip" : "Edit Trip"}</Text>
        <Pressable
          testID="save-trip-btn"
          onPress={() => save.mutate()}
          disabled={save.isPending}
          style={s.saveBtn}
        >
          <Text style={s.saveTxt}>{save.isPending ? "Saving..." : "Save"}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable testID="pick-cover-btn" onPress={pickImage} style={s.coverPicker}>
          {photo ? (
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={{ alignItems: "center" }}>
              <Icon name="image-plus" size={32} color={colors.muted} />
              <Text style={{ color: colors.muted, marginTop: spacing.sm }}>Add cover photo</Text>
            </View>
          )}
          {photo ? (
            <View style={s.coverEdit}>
              <Icon name="pencil" size={14} color="#fff" />
              <Text style={{ color: "#fff", marginLeft: 6, fontSize: 12 }}>Change</Text>
            </View>
          ) : null}
        </Pressable>

        <Field label="Trip name">
          <Input testID="input-name" value={name} onChangeText={setName} placeholder="Paris Getaway" />
        </Field>

        <Field label="Destination">
          <Input
            testID="input-destination"
            value={destination}
            onChangeText={setDestination}
            placeholder="Paris, France"
          />
        </Field>

        <Field label="Category">
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {CATS.map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  testID={`cat-${c.key}`}
                  onPress={() => setCategory(c.key)}
                  style={[s.catChip, active && s.catChipActive]}
                >
                  <Text style={[s.catText, active && s.catTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Start date">
              <DateTimeInput testID="input-start" value={start} onChange={setStart} mode="date" placeholder="Start" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="End date">
              <DateTimeInput testID="input-end" value={end} onChange={setEnd} mode="date" placeholder="End" />
            </Field>
          </View>
        </View>

        <Field label="Planned budget">
          <Input
            testID="input-budget"
            value={budget}
            onChangeText={setBudget}
            keyboardType="numeric"
            placeholder="0"
          />
        </Field>

        <Field label="Trip currency">
          <CurrencyPickerButton
            testID="input-currency"
            value={currency}
            onChange={setCurrency}
          />
        </Field>

        {!isNew && (
          <Pressable
            testID="delete-trip-btn"
            onPress={() =>
              Alert.alert("Delete trip?", "This cannot be undone.", [
                { text: "Cancel" },
                { text: "Delete", style: "destructive", onPress: () => del.mutate() },
              ])
            }
            style={s.dangerBtn}
          >
            <Icon name="trash-can-outline" size={18} color={colors.error} />
            <Text style={s.dangerTxt}>Delete Trip</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: { padding: spacing.sm },
  topTitle: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.onSurface, textAlign: "center" },
  saveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  saveTxt: { color: colors.onBrandPrimary, fontWeight: "600" },
  coverPicker: {
    height: 180,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
    overflow: "hidden",
  },
  coverEdit: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  catChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  catText: { color: colors.onSurface, fontWeight: "500" },
  catTextActive: { color: colors.onBrandPrimary },
  dangerBtn: {
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  dangerTxt: { color: colors.error, fontWeight: "600" },
});
