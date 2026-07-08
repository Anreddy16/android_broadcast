import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { getColors, radius, spacing } from "@/src/theme";
import { api, Channel } from "@/src/api";
import { StatusBadge } from "@/src/components/StatusBadge";
import { useToast } from "@/src/components/Toast";

const FALLBACK_LOGO = "https://images.unsplash.com/photo-1634634120836-2e9581aba554?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHw0fHxhYnN0cmFjdCUyMGdsb3dpbmclMjBvcmJ8ZW58MHx8fHwxNzgzNTE5MjQ0fDA&ixlib=rb-4.1.0&q=85";

export default function ChannelsScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { show } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "expired" | "disabled">("all");

  const load = useCallback(async () => {
    try {
      const res = await api.listChannels();
      setChannels(res.channels);
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

  const filtered = channels.filter((ch) => (filter === "all" ? true : ch.status === filter));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top"]}>
      {/* Sticky header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: c.textPrimary }]}>Channels</Text>
          <TouchableOpacity
            testID="create-channel-btn"
            onPress={() => router.push("/channel/create")}
            style={[styles.plusBtn, { backgroundColor: c.primary }]}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Chip row */}
        <View style={styles.chipRow}>
          {(["all", "active", "expired", "disabled"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              testID={`filter-${f}`}
              onPress={() => setFilter(f)}
              activeOpacity={0.8}
              style={[
                styles.chip,
                {
                  backgroundColor: filter === f ? c.primary : c.surface,
                  borderColor: filter === f ? c.primary : c.border,
                },
              ]}
            >
              <Text
                style={{
                  color: filter === f ? "#fff" : c.textSecondary,
                  fontWeight: "700",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="videocam-outline" size={44} color={c.textMuted} />
              <Text style={{ color: c.textSecondary, fontSize: 16, fontWeight: "700", marginTop: 12 }}>
                No channels yet
              </Text>
              <Text style={{ color: c.textMuted, marginTop: 6, textAlign: "center" }}>
                Provision your first live channel — ₹500 for 30 days.
              </Text>
              <TouchableOpacity
                testID="empty-create-btn"
                onPress={() => router.push("/channel/create")}
                style={[styles.emptyBtn, { backgroundColor: c.primary }]}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>Create Channel</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`channel-card-${item.id}`}
              activeOpacity={0.85}
              onPress={() => router.push(`/channel/${item.id}`)}
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <Image
                source={item.logo_base64 ? { uri: item.logo_base64 } : { uri: FALLBACK_LOGO }}
                style={styles.logo}
                contentFit="cover"
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={[styles.channelName, { color: c.textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <StatusBadge status={item.status} testID={`status-${item.id}`} />
                </View>
                <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                  {item.category} • {item.language}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 6 }}>
                  {item.status === "expired"
                    ? "Renew to reactivate"
                    : `${item.remaining_days} days remaining`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "900" },
  plusBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: 12,
  },
  logo: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#111" },
  channelName: { fontSize: 16, fontWeight: "800", flexShrink: 1 },
  empty: { alignItems: "center", paddingVertical: 80, paddingHorizontal: 24 },
  emptyBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.md },
});
