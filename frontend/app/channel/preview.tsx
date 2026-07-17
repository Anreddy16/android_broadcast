import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

import { getColors, radius, spacing } from "@/src/theme";
import { api, Channel } from "@/src/api";
import { StatusBadge } from "@/src/components/StatusBadge";
import { useToast } from "@/src/components/Toast";

const FALLBACK_LOGO =
  "https://images.unsplash.com/photo-1634634120836-2e9581aba554?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHw0fHxhYnN0cmFjdCUyMGdsb3dpbmclMjBvcmJ8ZW58MHx8fHwxNzgzNTE5MjQ0fDA&ixlib=rb-4.1.0&q=85";

export default function ChannelPreviewList() {
  const c = getColors("dark");
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { show } = useToast();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listChannels();
      setChannels(res.channels);
      // pick initial channel: query param if provided, else first non-expired, else first
      const initial =
        (params.id && res.channels.find((c) => c.id === params.id)) ||
        res.channels.find((c) => c.status === "active") ||
        res.channels[0];
      setActiveId(initial?.id ?? null);
    } catch (e: unknown) {
      show((e as Error).message, "error");
    }
  }, [params.id, show]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load]),
  );

  const active = useMemo(
    () => channels.find((ch) => ch.id === activeId) || null,
    [channels, activeId],
  );

  const playbackUrl = active?.playback?.hls ?? "";

  // useVideoPlayer must be called on every render; pass "" when nothing to
  // play — expo-video handles empty source gracefully.
  const player = useVideoPlayer(playbackUrl, (p) => {
    p.loop = false;
    if (playbackUrl) p.play();
  });

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderColor: c.border }]}>
        <TouchableOpacity testID="preview-back" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 16 }}>
          Channels Preview
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Player + now-playing meta */}
      <View style={styles.playerWrap}>
        {active ? (
          <VideoView
            testID="preview-player"
            style={styles.player}
            player={player}
            allowsFullscreen
            allowsPictureInPicture
            contentFit="contain"
          />
        ) : (
          <View style={[styles.player, styles.playerEmpty]}>
            <Ionicons name="tv-outline" size={44} color="#444" />
            <Text style={{ color: "#666", marginTop: 8 }}>No channels yet</Text>
          </View>
        )}
        {active ? (
          <View style={[styles.nowRow, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Image
              source={active.logo_base64 ? { uri: active.logo_base64 } : { uri: FALLBACK_LOGO }}
              style={styles.nowLogo}
              contentFit="cover"
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                testID="now-playing-name"
                style={{ color: c.textPrimary, fontWeight: "800" }}
                numberOfLines={1}
              >
                {active.name}
              </Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }} numberOfLines={1}>
                {active.category} • {active.language}
              </Text>
            </View>
            <StatusBadge status={active.status} />
          </View>
        ) : null}
      </View>

      {/* Channel list */}
      <Text style={[styles.section, { color: c.textSecondary }]}>YOUR CHANNELS</Text>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40 }}>
            <Text style={{ color: c.textMuted }}>You have no channels yet.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isActive = item.id === activeId;
          return (
            <TouchableOpacity
              testID={`preview-item-${item.id}`}
              activeOpacity={0.85}
              onPress={() => setActiveId(item.id)}
              style={[
                styles.row,
                {
                  backgroundColor: isActive ? c.surfaceElevated : c.surface,
                  borderColor: isActive ? c.primary : c.border,
                },
              ]}
            >
              <Image
                source={item.logo_base64 ? { uri: item.logo_base64 } : { uri: FALLBACK_LOGO }}
                style={styles.rowLogo}
                contentFit="cover"
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Text
                    style={{ color: c.textPrimary, fontWeight: "800", flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {isActive ? (
                    <View style={[styles.pill, { backgroundColor: c.primary }]}>
                      <Ionicons name="play" size={10} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", marginLeft: 4 }}>
                        NOW PLAYING
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {item.category} • {item.language} • {item.remaining_days}d left
                </Text>
              </View>
              <StatusBadge status={item.status} />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
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
  playerWrap: { padding: spacing.lg, paddingBottom: 0 },
  player: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  playerEmpty: { alignItems: "center", justifyContent: "center" },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: 10,
    gap: 4,
  },
  nowLogo: { width: 40, height: 40, borderRadius: 8, backgroundColor: "#111" },
  section: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "800",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 8,
  },
  rowLogo: { width: 48, height: 48, borderRadius: 10, backgroundColor: "#111" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
