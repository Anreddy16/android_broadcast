import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { getColors, radius, spacing } from "@/src/theme";

export function Card({ style, children, ...rest }: ViewProps) {
  const c = getColors("dark");
  return (
    <View
      {...rest}
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
});
