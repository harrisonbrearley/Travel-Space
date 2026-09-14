import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Modal, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";
import { COMMON_CURRENCIES, symbolFor } from "@/src/currency";

export function CostInput({
  amount,
  currency,
  onChange,
  testID,
}: {
  amount: number;
  currency: string;
  onChange: (amount: number, currency: string) => void;
  testID?: string;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <View style={s.row}>
        <TextInput
          testID={testID}
          value={amount ? String(amount) : ""}
          onChangeText={(v) => onChange(parseFloat(v) || 0, currency || "USD")}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.muted}
          style={s.input}
        />
        <Pressable
          testID={testID ? `${testID}-currency` : "currency-btn"}
          onPress={() => setPickerOpen(true)}
          style={s.currencyBtn}
        >
          <Text style={s.currencyCode}>{currency || "USD"}</Text>
          <Icon name="chevron-down" size={14} color={colors.muted} />
        </Pressable>
      </View>

      <CurrencyPicker
        visible={pickerOpen}
        value={currency}
        onClose={() => setPickerOpen(false)}
        onSelect={(code) => onChange(amount, code)}
        insets={insets}
      />
    </>
  );
}

export function CurrencyPickerButton({
  value,
  onChange,
  label,
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  testID?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={s.pickerFull}
      >
        <View style={{ flex: 1 }}>
          {label ? <Text style={s.pickerLabel}>{label}</Text> : null}
          <Text style={s.pickerVal}>
            {symbolFor(value)} · {value || "USD"} — {COMMON_CURRENCIES.find((c) => c.code === value)?.name || ""}
          </Text>
        </View>
        <Icon name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <CurrencyPicker
        visible={open}
        value={value}
        onClose={() => setOpen(false)}
        onSelect={onChange}
        insets={insets}
      />
    </>
  );
}

function CurrencyPicker({
  visible,
  value,
  onClose,
  onSelect,
  insets,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (code: string) => void;
  insets: { top: number; bottom: number; left: number; right: number };
}) {
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    if (!visible) setQ("");
  }, [visible]);
  const filtered = React.useMemo(() => {
    if (!q.trim()) return COMMON_CURRENCIES;
    const s = q.trim().toLowerCase();
    return COMMON_CURRENCIES.filter((c) => c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s));
  }, [q]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={[s.pickerHeader, { paddingTop: Platform.OS === "android" ? insets.top + spacing.sm : spacing.md }]}>
          <Pressable onPress={onClose} style={{ padding: spacing.sm }} testID="cp-close">
            <Icon name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={s.pickerTitle}>Currency</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ padding: spacing.md }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search currency"
            placeholderTextColor={colors.muted}
            style={s.search}
          />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
          {filtered.map((c) => {
            const active = c.code === value;
            return (
              <Pressable
                key={c.code}
                onPress={() => { onSelect(c.code); onClose(); }}
                style={s.item}
                testID={`cp-${c.code}`}
              >
                <View style={s.itemSymbol}>
                  <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{c.symbol}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemCode}>{c.code}</Text>
                  <Text style={s.itemName}>{c.name}</Text>
                </View>
                {active && <Icon name="check" size={18} color={colors.brandPrimary} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    minHeight: 44,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15,
    color: colors.onSurface,
  },
  currencyBtn: {
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  currencyCode: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  pickerFull: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    minHeight: 44,
  },
  pickerLabel: { color: colors.muted, fontSize: 12 },
  pickerVal: { color: colors.onSurface, fontSize: 15, fontWeight: "500", marginTop: 2 },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.onSurface },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  itemSymbol: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  itemCode: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  itemName: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
