import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Card } from "@/src/components/Card";
import { Button } from "@/src/components/Button";
import { getColors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";

export default function ProfileScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top"]}>
      <View style={{ padding: spacing.lg }}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Profile</Text>

        <Card style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View style={[styles.avatar, { backgroundColor: c.primary }]}>
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>
              {(user?.name || "U").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text testID="profile-name" style={{ color: c.textPrimary, fontSize: 18, fontWeight: "800" }}>
              {user?.name}
            </Text>
            <Text style={{ color: c.textMuted, marginTop: 2 }}>{user?.email}</Text>
            <View
              style={[
                styles.roleBadge,
                { backgroundColor: user?.role === "admin" ? "rgba(139,92,246,0.15)" : c.surfaceElevated },
              ]}
            >
              <Text style={{ color: user?.role === "admin" ? c.accent : c.textSecondary, fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>
                {(user?.role || "user").toUpperCase()}
              </Text>
            </View>
          </View>
        </Card>

        <View style={{ marginTop: spacing.lg, gap: 8 }}>
          {user?.role === "admin" ? (
            <TouchableOpacity
              testID="open-admin-portal"
              onPress={() => router.push("/admin")}
              style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <Ionicons name="shield-checkmark" size={20} color={c.accent} />
              <Text style={[styles.rowText, { color: c.textPrimary }]}>Admin Portal</Text>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </TouchableOpacity>
          ) : null}

          <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="moon" size={20} color={c.textSecondary} />
            <Text style={[styles.rowText, { color: c.textPrimary }]}>Dark Mode</Text>
            <Switch value={true} disabled trackColor={{ true: c.primary }} thumbColor="#fff" />
          </View>

          <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="server" size={20} color={c.textSecondary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: c.textPrimary, fontWeight: "700" }}>Flussonic Server</Text>
              <Text style={{ color: c.textMuted, fontSize: 11 }}>mumbai-edge.smartplaytv.in</Text>
            </View>
          </View>
        </View>

        <Button
          testID="logout-btn"
          title="Sign Out"
          variant="destructive"
          onPress={logout}
          style={{ marginTop: spacing.xl }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "900", marginBottom: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 12,
  },
  rowText: { fontSize: 15, fontWeight: "700", flex: 1, marginLeft: 4 },
});
