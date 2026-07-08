import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { getColors, radius, spacing } from "@/src/theme";
import { api, Notification } from "@/src/api";
import { useToast } from "@/src/components/Toast";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  channel_created: "videocam",
  recharge: "wallet",
  low_balance: "warning",
  expiring_soon: "time",
  expiry: "close-circle",
  renewal: "refresh",
  offline: "cloud-offline",
  admin_wallet: "shield-checkmark",
};

export default function NotificationsScreen() {
  const c = getColors("dark");
  const { show } = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listNotifications();
      setItems(res.notifications);
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

  const markAll = async () => {
    try {
      await api.markAllRead();
      await load();
      show("Marked all as read", "success");
    } catch (e: unknown) {
      show((e as Error).message, "error");
    }
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
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Notifications</Text>
        <TouchableOpacity testID="mark-all-read" onPress={markAll}>
          <Text style={{ color: c.primary, fontWeight: "700" }}>Mark all read</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40 }}>
            <Ionicons name="notifications-off-outline" size={44} color={c.textMuted} />
            <Text style={{ color: c.textMuted, marginTop: 10 }}>No notifications yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            testID={`notification-${item.id}`}
            style={[
              styles.row,
              {
                backgroundColor: c.surface,
                borderColor: item.read ? c.border : c.primary + "55",
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: c.surfaceElevated }]}>
              <Ionicons name={ICON[item.kind] || "information-circle"} size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ color: c.textSecondary, marginTop: 4, fontSize: 13 }}>{item.body}</Text>
              <Text style={{ color: c.textMuted, marginTop: 6, fontSize: 11 }}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
            {!item.read ? <View style={[styles.unread, { backgroundColor: c.primary }]} /> : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 26, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 12,
    marginBottom: 10,
    alignItems: "flex-start",
  },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  unread: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
