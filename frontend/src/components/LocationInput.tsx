import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Platform } from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { useI18n, nominatimLang } from "@/src/i18n";
import { MapPickerModal } from "./MapPickerModal";

type Value = {
  location: string;
  latitude?: number | null;
  longitude?: number | null;
};

export function LocationInput({
  value,
  onChange,
  placeholder,
  testID,
}: {
  value: Value;
  onChange: (v: Value) => void;
  placeholder?: string;
  testID?: string;
}) {
  const { lang } = useI18n();
  const [suggestions, setSuggestions] = React.useState<{ display_name: string; latitude: number; longitude: number }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [showMap, setShowMap] = React.useState(false);
  const debounceRef = React.useRef<any>(null);

  const search = async (q: string) => {
    if (!q || q.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const r = await api.geocode(q, nominatimLang(lang));
      setSuggestions(r.results || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeText = (t: string) => {
    onChange({ ...value, location: t, latitude: null, longitude: null });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(t), 400);
  };

  const pickSuggestion = (item: { display_name: string; latitude: number; longitude: number }) => {
    onChange({ location: item.display_name, latitude: item.latitude, longitude: item.longitude });
    setSuggestions([]);
    setFocus(false);
  };

  const hasCoords = value.latitude != null && value.longitude != null;

  return (
    <View>
      <View style={s.wrap}>
        <TextInput
          testID={testID}
          value={value.location}
          onChangeText={handleChangeText}
          onFocus={() => setFocus(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={s.input}
          autoCapitalize="words"
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.brandPrimary} style={{ marginRight: 8 }} />
        ) : hasCoords ? (
          <Icon name="check-circle" size={18} color={colors.success} style={{ marginRight: 8 }} />
        ) : null}
        <Pressable
          onPress={() => setShowMap(true)}
          style={s.mapBtn}
          testID={testID ? `${testID}-map-btn` : "map-btn"}
        >
          <Icon name="map-marker-radius" size={18} color={colors.brandPrimary} />
        </Pressable>
      </View>

      {focus && suggestions.length > 0 && (
        <View style={s.dropdown}>
          {suggestions.map((it, i) => (
            <Pressable key={i} onPress={() => pickSuggestion(it)} style={s.suggestion} testID={`suggestion-${i}`}>
              <Icon name="map-marker-outline" size={16} color={colors.muted} />
              <Text style={s.suggestionText} numberOfLines={2}>{it.display_name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <MapPickerModal
        visible={showMap}
        onClose={() => setShowMap(false)}
        onPick={(loc) => onChange({ location: loc.display_name, latitude: loc.latitude, longitude: loc.longitude })}
        initial={{ latitude: value.latitude, longitude: value.longitude }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 44,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15,
    color: colors.onSurface,
  },
  mapBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  dropdown: {
    marginTop: 6,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionText: { flex: 1, color: colors.onSurface, fontSize: 13 },
});
