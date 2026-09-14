import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Platform, Modal } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radius, spacing } from "@/src/theme";
import Icon from "@react-native-vector-icons/material-design-icons";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  testID,
  autoCapitalize,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "email-address" | "url";
  testID?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      style={[s.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
    />
  );
}

export function DateTimeInput({
  value,
  onChange,
  placeholder,
  testID,
  mode = "datetime",
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  testID?: string;
  mode?: "date" | "datetime" | "time";
}) {
  const [open, setOpen] = React.useState(false);
  const [tempDate, setTempDate] = React.useState<Date>(value ? new Date(value) : new Date());
  const [step, setStep] = React.useState<"date" | "time">("date");

  const display = value ? formatDateTime(value, mode) : placeholder || "Select date & time";

  const handleOpen = () => {
    setTempDate(value ? new Date(value) : new Date());
    setStep("date");
    setOpen(true);
  };

  const handleChange = (_: any, selected?: Date) => {
    if (Platform.OS === "android") {
      if (!selected) {
        setOpen(false);
        return;
      }
      if (mode === "datetime" && step === "date") {
        setTempDate(selected);
        setStep("time");
      } else {
        setOpen(false);
        onChange(selected.toISOString());
      }
    } else if (selected) {
      setTempDate(selected);
    }
  };

  const confirmIOS = () => {
    setOpen(false);
    onChange(tempDate.toISOString());
  };

  return (
    <>
      <Pressable testID={testID} style={s.input} onPress={handleOpen}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: value ? colors.onSurface : colors.muted, fontSize: 15 }}>
            {display}
          </Text>
          <Icon name="calendar" size={18} color={colors.muted} />
        </View>
      </Pressable>

      {open && Platform.OS === "android" && (
        <DateTimePicker
          value={tempDate}
          mode={mode === "datetime" ? step : mode}
          is24Hour={false}
          onChange={handleChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal transparent visible={open} animationType="fade">
          <View style={s.iosBackdrop}>
            <View style={s.iosSheet}>
              <DateTimePicker
                value={tempDate}
                mode={mode}
                display="spinner"
                onChange={handleChange}
                textColor={colors.onSurface}
              />
              <View style={s.iosBtnRow}>
                <Pressable onPress={() => setOpen(false)} style={s.iosBtn}>
                  <Text style={{ color: colors.muted, fontSize: 16 }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={confirmIOS} style={s.iosBtn} testID="datetime-confirm">
                  <Text style={{ color: colors.brandPrimary, fontSize: 16, fontWeight: "600" }}>
                    Done
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatDateTime(iso: string, mode: "date" | "datetime" | "time" = "datetime") {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (mode === "date") return date;
  if (mode === "time") return time;
  return `${date} ${time}`;
}

export function niceDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function niceTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const s = StyleSheet.create({
  label: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.sm,
    fontWeight: "500",
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15,
    color: colors.onSurface,
    minHeight: 44,
    justifyContent: "center",
  },
  iosBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  iosSheet: {
    backgroundColor: colors.surface,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  iosBtnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  iosBtn: { padding: spacing.sm },
});
