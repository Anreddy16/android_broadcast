import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { Button } from "@/src/components/Button";
import { Card } from "@/src/components/Card";
import { Input } from "@/src/components/Input";
import { StatusBadge } from "@/src/components/StatusBadge";
import { getColors, radius, spacing } from "@/src/theme";
import { AdminOverview, api, Channel, User } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth/AuthContext";

type Tab = "overview" | "users" | "channels";

export default function AdminScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();

  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("500");
  const [adjustReason, setAdjustReason] = useState("Manual credit");

  const load = useCallback(async () => {
    try {
      const [o, u, ch] = await Promise.all([api.adminOverview(), api.adminUsers(), api.adminChannels()]);
      setOverview(o);
      setUsers(u.users);
      setChannels(ch.channels);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const submitAdjust = async () => {
    if (!adjustTarget) return;
    const val = parseInt(adjustAmount, 10);
    if (!val || val === 0) {
      show("Enter a non-zero amount", "error");
      return;
    }
    try {
      await api.adminAdjustWallet(adjustTarget.id, val, adjustReason || "Adjustment");
      show("Wallet adjusted", "success");
      setAdjustTarget(null);
      await load();
    } catch (e: unknown) {
      show((e as Error).message, "error");
    }
  };

  const disableChan = async (id: string) => {
    try {
      await api.adminDisableChannel(id);
      show("Channel disabled", "success");
      await load();
    } catch (e: unknown) {
      show((e as Error).message, "error");
    }
  };
  const deleteChan = async (id: string) => {
    try {
      await api.adminDeleteChannel(id);
      show("Channel deleted", "success");
      await load();
    } catch (e: unknown) {
      show((e as Error).message, "error");
    }
  };
  const forceExpire = async () => {
    try {
      await api.adminExpireNow();
      show("Expiry job executed", "success");
      await load();
    } catch (e: unknown) {
      show((e as Error).message, "error");
    }
  };

  if (user?.role !== "admin") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="lock-closed" size={44} color={c.textMuted} />
        <Text style={{ color: c.textPrimary, marginTop: 12, fontWeight: "800" }}>Admins only</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: c.primary, fontWeight: "700" }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (loading || !overview) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top"]}>
      <View style={[styles.header, { borderColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="admin-back">
          <Ionicons name="chevron-back" size={22} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 18 }}>Admin Portal</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["overview", "users", "channels"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            testID={`admin-tab-${t}`}
            onPress={() => setTab(t)}
            style={[
              styles.tabBtn,
              { backgroundColor: tab === t ? c.primary : c.surface, borderColor: tab === t ? c.primary : c.border },
            ]}
          >
            <Text
              style={{
                color: tab === t ? "#fff" : c.textSecondary,
                fontWeight: "800",
                textTransform: "uppercase",
                fontSize: 12,
                letterSpacing: 1,
              }}
            >
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {tab === "overview" && (
          <>
            <View style={styles.grid}>
              <Stat label="TOTAL USERS" value={overview.users} color={c.primary} />
              <Stat label="TOTAL CHANNELS" value={overview.total_channels} color={c.accent} />
              <Stat label="ACTIVE" value={overview.active_channels} color={c.healthyGreen} />
              <Stat label="EXPIRED" value={overview.expired_channels} color={c.liveRed} />
              <Stat label="REVENUE (₹)" value={overview.revenue.toLocaleString("en-IN")} color={c.healthyGreen} wide />
              <Stat label="RECHARGES (₹)" value={overview.total_recharges.toLocaleString("en-IN")} color={c.primary} wide />
            </View>
            <Button
              testID="admin-force-expire"
              title="Run Expiry Job Now"
              variant="secondary"
              onPress={forceExpire}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}

        {tab === "users" && (
          <>
            {users.map((u) => (
              <Card key={u.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={[styles.avatar, { backgroundColor: u.role === "admin" ? c.accent : c.primary }]}>
                    <Text style={{ color: "#fff", fontWeight: "900" }}>
                      {(u.name || "U").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.textPrimary, fontWeight: "800" }}>{u.name}</Text>
                    <Text style={{ color: c.textMuted, fontSize: 12 }}>{u.email}</Text>
                    <Text style={{ color: c.textSecondary, marginTop: 4, fontSize: 12 }}>
                      Balance: <Text style={{ color: c.healthyGreen, fontWeight: "800" }}>₹{u.wallet_balance}</Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID={`adjust-wallet-${u.id}`}
                    onPress={() => {
                      setAdjustTarget(u);
                      setAdjustAmount("500");
                      setAdjustReason("Manual credit");
                    }}
                    style={[styles.smallBtn, { backgroundColor: c.primary }]}
                  >
                    <Ionicons name="wallet" size={14} color="#fff" />
                    <Text style={{ color: "#fff", marginLeft: 6, fontWeight: "800", fontSize: 12 }}>Adjust</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </>
        )}

        {tab === "channels" && (
          <>
            {channels.map((ch) => (
              <Card key={ch.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", flex: 1 }} numberOfLines={1}>
                    {ch.name}
                  </Text>
                  <StatusBadge status={ch.status} />
                </View>
                <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 6 }}>
                  Stream: <Text style={{ color: c.textSecondary, fontFamily: "Courier" }}>{ch.stream_name}</Text>
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 12 }}>
                  Owner: {ch.user_id.slice(0, 8)}... • {ch.remaining_days}d left
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    testID={`admin-disable-${ch.id}`}
                    onPress={() => disableChan(ch.id)}
                    style={[styles.smallBtn, { backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.border }]}
                  >
                    <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 12 }}>Disable</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`admin-delete-${ch.id}`}
                    onPress={() => deleteChan(ch.id)}
                    style={[styles.smallBtn, { backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" }]}
                  >
                    <Text style={{ color: c.liveRed, fontWeight: "800", fontSize: 12 }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      {/* Adjust wallet modal */}
      <Modal transparent visible={!!adjustTarget} animationType="fade" onRequestClose={() => setAdjustTarget(null)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "900" }}>Adjust Wallet</Text>
            <Text style={{ color: c.textMuted, marginTop: 4 }}>
              {adjustTarget?.name} • ₹{adjustTarget?.wallet_balance}
            </Text>
            <View style={{ marginTop: 16 }}>
              <Input
                testID="admin-adjust-amount"
                label="Amount (negative to debit)"
                keyboardType="numbers-and-punctuation"
                value={adjustAmount}
                onChangeText={setAdjustAmount}
              />
              <Input testID="admin-adjust-reason" label="Reason" value={adjustReason} onChangeText={setAdjustReason} />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                <Button title="Cancel" variant="secondary" onPress={() => setAdjustTarget(null)} style={{ flex: 1 }} />
                <Button testID="admin-adjust-submit" title="Apply" onPress={submitAdjust} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, color, wide }: { label: string; value: number | string; color: string; wide?: boolean }) {
  const c = getColors("dark");
  return (
    <View
      style={[
        styles.stat,
        { backgroundColor: c.surface, borderColor: c.border, flexBasis: wide ? "100%" : "48%" },
      ]}
    >
      <Text style={{ color: c.textMuted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" }}>{label}</Text>
      <Text style={{ color, fontSize: 26, fontWeight: "900", marginTop: 6 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingTop: 12 },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexGrow: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  smallBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, width: "100%", maxWidth: 420 },
});
