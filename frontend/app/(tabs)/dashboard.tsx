import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { Card } from "@/src/components/Card";
import { getColors, radius, spacing } from "@/src/theme";
import { api, DashboardData } from "@/src/api";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function DashboardScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (e: unknown) {
      show((e as Error).message, "error");
    }
  }, [show]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load]),
  );

  useEffect(() => {}, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading || !data) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.hello, { color: c.textMuted }]}>WELCOME BACK</Text>
            <Text testID="dashboard-name" style={[styles.name, { color: c.textPrimary }]}>
              {user?.name || "Broadcaster"}
            </Text>
          </View>
          {user?.role === "admin" ? (
            <TouchableOpacity
              testID="admin-portal-btn"
              onPress={() => router.push("/admin")}
              style={[styles.adminBtn, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}
            >
              <Ionicons name="shield-checkmark" size={14} color={c.accent} />
              <Text style={{ color: c.textPrimary, fontWeight: "700", marginLeft: 6, fontSize: 12 }}>Admin</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Wallet hero */}
        <TouchableOpacity testID="wallet-hero" activeOpacity={0.85} onPress={() => router.push("/(tabs)/wallet")}>
          <LinearGradient
            colors={["#1E3A8A", "#3B82F6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.walletCard}
          >
            <Text style={styles.walletLabel}>WALLET BALANCE</Text>
            <View style={styles.walletRow}>
              <Text testID="wallet-balance" style={styles.walletAmount}>
                ₹{data.wallet_balance.toLocaleString("en-IN")}
              </Text>
              <View style={styles.rechargePill}>
                <Ionicons name="add" size={16} color="#0F172A" />
                <Text style={{ color: "#0F172A", fontWeight: "800", marginLeft: 4 }}>Recharge</Text>
              </View>
            </View>
            <Text style={styles.walletSub}>₹{data.channel_price} / channel / 30 days</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Stat cards */}
        <View style={styles.grid}>
          <StatCard label="ACTIVE" value={data.active_channels} color={c.healthyGreen} testID="stat-active" />
          <StatCard label="EXPIRED" value={data.expired_channels} color={c.liveRed} testID="stat-expired" />
          <StatCard label="MONTHLY" value={`₹${data.monthly_charges}`} color={c.primary} testID="stat-monthly" />
          <StatCard label="TOTAL" value={data.total_channels} color={c.accent} testID="stat-total" />
        </View>

        {/* Quick actions */}
        <View style={styles.actionRow}>
          <ActionBtn
            testID="quick-create-channel"
            icon="add-circle"
            label="Create Channel"
            color={c.primary}
            onPress={() => router.push("/channel/create")}
          />
          <ActionBtn
            testID="quick-channels"
            icon="videocam"
            label="My Channels"
            color={c.accent}
            onPress={() => router.push("/(tabs)/channels")}
          />
        </View>

        {/* Recent activity */}
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>RECENT ACTIVITY</Text>
        <Card>
          {data.recent_notifications.length === 0 && data.recent_transactions.length === 0 ? (
            <Text style={{ color: c.textMuted, textAlign: "center", padding: 12 }}>No recent activity.</Text>
          ) : null}
          {data.recent_notifications.map((n, i) => (
            <View key={n.id} style={[styles.actRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
              <View style={[styles.actIcon, { backgroundColor: "rgba(139,92,246,0.15)" }]}>
                <Ionicons name="notifications" color={c.accent} size={16} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: "700", fontSize: 13 }}>{n.title}</Text>
                <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {n.body}
                </Text>
              </View>
            </View>
          ))}
          {data.recent_transactions.slice(0, 3).map((t) => (
            <View key={t.id} style={[styles.actRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
              <View
                style={[
                  styles.actIcon,
                  { backgroundColor: t.type === "credit" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" },
                ]}
              >
                <Ionicons
                  name={t.type === "credit" ? "arrow-down" : "arrow-up"}
                  size={16}
                  color={t.type === "credit" ? c.healthyGreen : c.liveRed}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
                  {t.reason}
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>
                  ₹{t.amount} • Balance ₹{t.balance_after}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color, testID }: { label: string; value: number | string; color: string; testID?: string }) {
  const c = getColors("dark");
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]} testID={testID}>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  color,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  testID?: string;
}) {
  const c = getColors("dark");
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.action, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={{ color: c.textPrimary, fontWeight: "700", marginTop: 8 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  hello: { fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  name: { fontSize: 24, fontWeight: "900", marginTop: 4 },
  adminBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  walletCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  walletLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  walletRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  walletAmount: { color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  walletSub: { color: "rgba(255,255,255,0.65)", marginTop: 4, fontSize: 12 },
  rechargePill: {
    backgroundColor: "#fff",
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg },
  stat: {
    flexBasis: "48%",
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  statLabel: { fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  statValue: { fontSize: 26, fontWeight: "900", marginTop: 6 },
  actionRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  action: { flex: 1, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  actionIcon: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", marginBottom: spacing.sm, marginTop: spacing.sm },
  actRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  actIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
