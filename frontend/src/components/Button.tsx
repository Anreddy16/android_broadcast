import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { getColors, radius, spacing } from "@/src/theme";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  testID,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
  icon?: React.ReactNode;
}) {
  const c = getColors("dark");
  const isDisabled = disabled || loading;

  const bg =
    variant === "primary"
      ? c.primary
      : variant === "destructive"
      ? "rgba(239, 68, 68, 0.12)"
      : variant === "ghost"
      ? "transparent"
      : c.surfaceElevated;
  const border =
    variant === "destructive"
      ? "rgba(239, 68, 68, 0.35)"
      : variant === "secondary"
      ? c.border
      : variant === "ghost"
      ? "transparent"
      : "transparent";
  const color =
    variant === "primary" ? "#fff" : variant === "destructive" ? c.liveRed : c.textPrimary;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: border, opacity: isDisabled ? 0.55 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.txt, { color, marginLeft: icon ? 8 : 0 }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  txt: { fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
  row: { flexDirection: "row", alignItems: "center" },
});
