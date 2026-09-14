import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F9F8F6",
  onSurface: "#1C1C1E",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C1C1E",
  surfaceTertiary: "#F2EFEA",
  onSurfaceTertiary: "#1C1C1E",
  surfaceInverse: "#1C1C1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8E8A85",

  brand: "#788B76",
  onBrand: "#FFFFFF",
  brandPrimary: "#788B76",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#9DAF9B",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E6EBE5",
  onBrandTertiary: "#3E4C3D",

  success: "#54805A",
  onSuccess: "#FFFFFF",
  warning: "#C78C44",
  onWarning: "#FFFFFF",
  error: "#B34E43",
  onError: "#FFFFFF",
  info: "#788B76",
  onInfo: "#FFFFFF",

  border: "#E8E4DF",
  borderStrong: "#C2BEB8",
  divider: "#E8E4DF",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const colors = light;
