import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getColors, radius, spacing } from "@/src/theme";

type Status = "active" | "expired" | "disabled" | "live" | "offline";

export function StatusBadge({ status, testID }: { status: Status; testID?: string }) {
  const c = getColors("dark");
  let bg = "rgba(113,113,122,0.12)";
  let border = "rgba(113,113,122,0.4)";
  let color = c.offlineGrey;
  let label = status.toUpperCase();
  if (status === "active" || status === "live") {
    bg = "rgba(16,185,129,0.12)";
    border = "rgba(16,185,129,0.4)";
    color = c.healthyGreen;
    label = status === "live" ? "LIVE" : "ACTIVE";
  } else if (status === "expired") {
    bg = "rgba(239,68,68,0.12)";
    border = "rgba(239,68,68,0.4)";
    color = c.liveRed;
  } else if (status === "disabled") {
    bg = "rgba(245,158,11,0.12)";
    border = "rgba(245,158,11,0.4)";
    color = c.warningYellow;
  } else if (status === "offline") {
    color = c.offlineGrey;
  }
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
      {(status === "active" || status === "live") && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.txt, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  txt: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
});
