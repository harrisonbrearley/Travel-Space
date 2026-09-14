import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, spacing } from "@/src/theme";

const COVER = require("../../assets/images/travel-space-cover.png");

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLocal, signIn } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.getInvitePreview(token),
    enabled: !!token,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      if (res?.trip_id) {
        router.replace(`/trip/${res.trip_id}`);
      } else {
        router.replace("/");
      }
    },
    onError: (e: any) => Alert.alert("Could not accept invite", e.message || "Try again later."),
  });

  if (isLoading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[s.center, { paddingTop: insets.top, paddingHorizontal: spacing.xl }]}>
        <Icon name="link-off" size={44} color={colors.muted} />
        <Text style={s.errTitle}>Invite not found</Text>
        <Text style={s.errBody}>This link may have expired or been revoked.</Text>
        <Pressable style={s.primaryBtn} onPress={() => router.replace("/")}>
          <Text style={s.primaryBtnTxt}>Go home</Text>
        </Pressable>
      </View>
    );
  }

  if (data.expired) {
    return (
      <View style={[s.center, { paddingTop: insets.top, paddingHorizontal: spacing.xl }]}>
        <Icon name="clock-alert-outline" size={44} color={colors.muted} />
        <Text style={s.errTitle}>Invite expired</Text>
        <Text style={s.errBody}>Ask the owner of &quot;{data.trip_name}&quot; to send you a fresh link.</Text>
        <Pressable style={s.primaryBtn} onPress={() => router.replace("/")}>
          <Text style={s.primaryBtnTxt}>Go home</Text>
        </Pressable>
      </View>
    );
  }

  const mode = data.mode as "collab" | "copy";
  const isCollab = mode === "collab";

  // Auth state resolution:
  // - Collab requires a signed-in Google account (server-side ownership).
  // - Copy can be accepted by any signed-in user; guest mode users get prompted to sign in.
  const needsSignIn = !user && (isCollab || isLocal);
  // If user is signed in already we can call accept immediately via button.

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Pressable onPress={() => router.replace("/")} style={s.backBtn} testID="invite-back">
        <Icon name="close" size={22} color={colors.onSurface} />
      </Pressable>

      <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg, alignItems: "center", justifyContent: "center" }}>
        <View style={s.coverWrap}>
          <Image source={data.trip_cover ? { uri: data.trip_cover } : COVER} style={StyleSheet.absoluteFill} contentFit="cover" />
        </View>

        <View style={{ alignItems: "center", gap: 6 }}>
          <View style={s.badge}>
            <Icon name={isCollab ? "account-multiple-plus" : "content-duplicate"} size={12} color={colors.onBrandPrimary} />
            <Text style={s.badgeTxt}>{isCollab ? "COLLABORATION INVITE" : "TRIP COPY"}</Text>
          </View>
          <Text style={s.title} numberOfLines={2}>{data.trip_name || "A trip"}</Text>
          {!!data.trip_destination && <Text style={s.dest}>{data.trip_destination}</Text>}
          <Text style={s.owner}>Shared by {data.owner_name || data.owner_email || "a friend"}</Text>
        </View>

        <View style={s.explain}>
          <Icon
            name={isCollab ? "sync" : "content-save-outline"}
            size={18}
            color={colors.brandPrimary}
          />
          <Text style={s.explainTxt}>
            {isCollab
              ? "You'll be able to add and edit items on this trip. Your changes will sync with everyone on the trip."
              : "A private copy of this trip will be saved to your Travel Space. Your edits won't affect the original."}
          </Text>
        </View>

        <View style={{ width: "100%", gap: spacing.md, marginTop: spacing.md }}>
          {needsSignIn ? (
            <>
              <Pressable style={s.primaryBtn} onPress={signIn} testID="invite-signin">
                <Icon name="google" size={18} color="#fff" />
                <Text style={s.primaryBtnTxt}>Sign in to accept</Text>
              </Pressable>
              <Text style={s.hint}>
                {isCollab
                  ? "Collaboration syncs your changes across devices, so a signed-in account is required."
                  : "Sign in to save this trip. Your existing guest trips stay on this device."}
              </Text>
            </>
          ) : (
            <Pressable
              style={[s.primaryBtn, accept.isPending && { opacity: 0.7 }]}
              disabled={accept.isPending}
              onPress={() => accept.mutate()}
              testID="invite-accept"
            >
              {accept.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name={isCollab ? "check-decagram" : "download"} size={18} color="#fff" />
                  <Text style={s.primaryBtnTxt}>{isCollab ? "Join this trip" : "Save a copy"}</Text>
                </>
              )}
            </Pressable>
          )}

          <Pressable onPress={() => router.replace("/")} style={s.ghostBtn} testID="invite-decline">
            <Text style={s.ghostTxt}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  errTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  errBody: { fontSize: 14, color: colors.muted, textAlign: "center" },
  backBtn: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  coverWrap: {
    width: "100%",
    height: 180,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  badgeTxt: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: -0.4,
    marginTop: 6,
    textAlign: "center",
  },
  dest: { fontSize: 15, color: colors.onSurfaceSecondary },
  owner: { fontSize: 13, color: colors.muted, marginTop: 2 },
  explain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
  },
  explainTxt: { flex: 1, color: colors.onBrandTertiary, fontSize: 13, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  ghostBtn: { paddingVertical: 12, alignItems: "center" },
  ghostTxt: { color: colors.muted, fontWeight: "600" },
  hint: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
