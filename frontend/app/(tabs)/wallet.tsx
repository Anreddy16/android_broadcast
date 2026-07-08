import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { getColors, radius, spacing } from "@/src/theme";
import { api, Transaction } from "@/src/api";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function WalletScreen() {
  const c = getColors("dark");
  const { refresh } = useAuth();
  const { show } = useToast();
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState("500");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([api.getWallet(), api.getTransactions()]);
      setBalance(w.balance);
      setTxs(t.transactions);
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

  const onRecharge = async (amt?: number) => {
    const value = amt ?? parseInt(amount, 10);
    if (!value || value <= 0) {
      show("Enter a valid amount", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api.recharge(value);
      setBalance(res.balance);
      await load();
      await refresh();
      show(`Recharged ₹${value} (MOCK)`, "success");
    } catch (e: unknown) {
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top"]}>
      <FlatList
        data={txs}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ padding: spacing.lg }}>
            <Text style={[styles.title, { color: c.textPrimary }]}>Wallet</Text>

            <LinearGradient
              colors={["#0F172A", "#3B82F6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <Text style={styles.label}>AVAILABLE BALANCE</Text>
              <Text testID="wallet-balance-value" style={styles.balance}>
                ₹{balance.toLocaleString("en-IN")}
              </Text>
              <Text style={styles.sub}>Each channel costs ₹500 / 30 days</Text>
            </LinearGradient>

            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>QUICK RECHARGE</Text>
            <View style={styles.quickRow}>
              {[500, 1000, 2000, 5000].map((v) => (
                <TouchableOpacity
                  key={v}
                  testID={`quick-recharge-${v}`}
                  onPress={() => onRecharge(v)}
                  disabled={busy}
                  activeOpacity={0.8}
                  style={[styles.quickBtn, { backgroundColor: c.surface, borderColor: c.border }]}
                >
                  <Text style={{ color: c.textPrimary, fontWeight: "800" }}>₹{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ marginTop: 12 }}>
              <Input
                testID="recharge-amount-input"
                label="Custom amount (₹)"
                keyboardType="number-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <Button
                testID="recharge-btn"
                title="Recharge Wallet (MOCK Razorpay)"
                onPress={() => onRecharge()}
                loading={busy}
              />
              <Text style={{ color: c.warningYellow, fontSize: 11, marginTop: 8 }}>
                MOCKED PAYMENT — no real Razorpay call made.
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 20 }]}>
              TRANSACTION HISTORY
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 32 }}>
            <Text style={{ color: c.textMuted }}>No transactions yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.tx, { borderColor: c.border, marginHorizontal: spacing.lg }]}>
            <View
              style={[
                styles.txIcon,
                { backgroundColor: item.type === "credit" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" },
              ]}
            >
              <Ionicons
                name={item.type === "credit" ? "arrow-down" : "arrow-up"}
                size={16}
                color={item.type === "credit" ? c.healthyGreen : c.liveRed}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontWeight: "700" }} numberOfLines={1}>
                {item.reason}
              </Text>
              <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 2 }}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
            <Text
              style={{
                color: item.type === "credit" ? c.healthyGreen : c.liveRed,
                fontWeight: "900",
              }}
            >
              {item.type === "credit" ? "+" : "-"}₹{item.amount}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "900", marginBottom: spacing.md },
  card: { borderRadius: radius.xl, padding: spacing.xl },
  label: { color: "rgba(255,255,255,0.7)", fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  balance: { color: "#fff", fontSize: 40, fontWeight: "900", letterSpacing: -1.5, marginTop: 6 },
  sub: { color: "rgba(255,255,255,0.6)", marginTop: 4, fontSize: 12 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", marginTop: 20, marginBottom: 10 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickBtn: {
    flexBasis: "23%",
    borderWidth: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  tx: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  txIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
