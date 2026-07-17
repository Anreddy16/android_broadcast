import { useState, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

import { Button } from "@/src/components/Button";
import { Card } from "@/src/components/Card";
import { StatusBadge } from "@/src/components/StatusBadge";
import { StreamUrlRow } from "@/src/components/StreamUrlRow";
import { getColors, radius, spacing } from "@/src/theme";
import { api, Channel, StreamMetrics } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth/AuthContext";

const FALLBACK_LOGO = "https://images.unsplash.com/photo-1634634120836-2e9581aba554?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHw0fHxhYnN0cmFjdCUyMGdsb3dpbmclMjBvcmJ8ZW58MHx8fHwxNzgzNTE5MjQ0fDA&ixlib=rb-4.1.0&q=85";

const PLAYBACK_LABELS: Record<string, string> = {
  hls: "HLS (.m3u8)",
  ll_hls: "Low-Latency HLS",
  dash: "MPEG-DASH",
  webrtc: "WebRTC",
  rtsp: "RTSP",
  thumbnail: "Thumbnail (MP4)",
  preview_image: "Preview Snapshot",
  embed: "Embed Page",
};

export default function ChannelDetail() {
  const c = getColors("dark");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useToast();
  const { refresh } = useAuth();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [metrics, setMetrics] = useState<StreamMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [ch, m] = await Promise.all([api.getChannel(id!), api.monitorChannel(id!)]);
      setChannel(ch.channel);
      setMetrics(m.metrics);
    } catch (e: unknown) {
      show((e as Error).message, "error");
    }
  }, [id, show]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();

      // Poll metrics every 10s while focused
      pollRef.current = setInterval(async () => {
        try {
          const m = await api.monitorChannel(id!);
          setMetrics(m.metrics);
        } catch {
          /* noop */
        }
      }, 10000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [load, id]),
  );

  const doAction = async (action: "renew" | "disable" | "enable" | "delete") => {
    setBusy(action);
    try {
      if (action === "renew") {
        const r = await api.renewChannel(id!);
        setChannel(r.channel);
        await refresh();
        show("Channel renewed for 30 days", "success");
      } else if (action === "disable") {
        await api.disableChannel(id!);
        await load();
        show("Channel disabled", "success");
      } else if (action === "enable") {
        await api.enableChannel(id!);
        await load();
        show("Channel enabled", "success");
      } else if (action === "delete") {
        await api.deleteChannel(id!);
        show("Channel deleted", "success");
        router.replace("/(tabs)/channels");
      }
    } catch (e: unknown) {
      show((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  if (loading || !channel || !metrics) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const uptime = metrics.uptime_seconds;
  const uptimeStr = uptime
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : "—";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Header */}
        <View style={[styles.header, { borderColor: c.border }]}>
          <TouchableOpacity onPress={() => router.back()} testID="detail-back">
            <Ionicons name="chevron-back" size={22} color={c.textPrimary} />
          </TouchableOpacity>
          <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
            {channel.name}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={channel.logo_base64 ? { uri: channel.logo_base64 } : { uri: FALLBACK_LOGO }}
            style={styles.logo}
            contentFit="cover"
          />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[styles.heroTitle, { color: c.textPrimary }]}>{channel.name}</Text>
            <Text style={{ color: c.textMuted, marginTop: 2, fontSize: 12 }}>
              {channel.category} • {channel.language}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8, alignItems: "center" }}>
              <StatusBadge status={channel.status} testID="detail-status" />
              {metrics.alive ? <StatusBadge status="live" testID="live-badge" /> : <StatusBadge status="offline" />}
            </View>
          </View>
        </View>

        {/* Provisioning warning */}
        {!channel.flussonic_provisioned ? (
          <View style={[styles.warn, { borderColor: c.warningYellow }]}>
            <Ionicons name="warning" size={16} color={c.warningYellow} />
            <Text style={{ color: c.warningYellow, fontSize: 12, marginLeft: 6, flex: 1 }}>
              Flussonic provisioning failed. URLs are configured but stream may not accept publishing until connectivity is restored.
            </Text>
          </View>
        ) : null}

        {/* Subscription info */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <Card>
            <RowKV label="STATUS" value={channel.status.toUpperCase()} />
            <RowKV label="CREATED" value={new Date(channel.created_at).toLocaleDateString()} />
            <RowKV label="EXPIRES" value={new Date(channel.expires_at).toLocaleDateString()} />
            <RowKV label="REMAINING" value={`${channel.remaining_days} days`} last />
          </Card>
        </View>

        {/* Preview */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: 10 }}>
          <Button
            testID="open-preview-btn"
            title="Open Live Preview (HLS)"
            icon={<Ionicons name="play" size={16} color="#fff" />}
            onPress={() => setShowPreview(true)}
            variant="primary"
          />
          <Button
            testID="open-channels-preview-btn"
            title="Browse All Channels"
            icon={<Ionicons name="tv" size={16} color="#fff" />}
            onPress={() => router.push({ pathname: "/channel/preview", params: { id: channel.id } })}
            variant="secondary"
          />
        </View>

        {/* Metrics */}
        <Text style={[styles.section, { color: c.textSecondary }]}>LIVE METRICS</Text>
        <View style={styles.metricsGrid}>
          <MetricCell testID="metric-bitrate-in" label="BITRATE IN" value={`${Math.round(metrics.bitrate_in / 1000)} kbps`} />
          <MetricCell testID="metric-bitrate-out" label="BITRATE OUT" value={`${Math.round(metrics.bitrate_out / 1000)} kbps`} />
          <MetricCell testID="metric-resolution" label="RESOLUTION" value={metrics.resolution} />
          <MetricCell testID="metric-fps" label="FPS" value={String(metrics.fps || "—")} />
          <MetricCell testID="metric-video-codec" label="VIDEO CODEC" value={metrics.video_codec} />
          <MetricCell testID="metric-audio-codec" label="AUDIO CODEC" value={metrics.audio_codec} />
          <MetricCell testID="metric-viewers" label="VIEWERS" value={String(metrics.viewers)} />
          <MetricCell testID="metric-uptime" label="UPTIME" value={uptimeStr} />
        </View>

        {/* Publish URLs */}
        <Text style={[styles.section, { color: c.textSecondary }]}>PUBLISHING (RTMP)</Text>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <StreamUrlRow label="RTMP Publish URL" value={channel.publish.rtmp_publish_url} testID="url-rtmp-publish" />
          <StreamUrlRow label="Stream Key" value={channel.publish.stream_key} masked testID="url-stream-key" />
          <StreamUrlRow label="Backup Publish URL" value={channel.publish.rtmp_backup_url} testID="url-rtmp-backup" />
          <StreamUrlRow label="SRT Publish URL" value={channel.publish.srt_publish_url} testID="url-srt-publish" />
        </View>

        {/* Playback outputs */}
        <Text style={[styles.section, { color: c.textSecondary }]}>PLAYBACK OUTPUTS</Text>
        <View style={{ paddingHorizontal: spacing.lg }}>
          {Object.entries(channel.playback).map(([key, url]) => (
            <StreamUrlRow
              key={key}
              label={PLAYBACK_LABELS[key] || key.toUpperCase()}
              value={url}
              testID={`url-playback-${key}`}
            />
          ))}
        </View>

        {/* Actions */}
        <Text style={[styles.section, { color: c.textSecondary }]}>ACTIONS</Text>
        <View style={{ paddingHorizontal: spacing.lg, gap: 10 }}>
          <Button
            testID="renew-btn"
            title="Renew Subscription (₹500 / 30d)"
            onPress={() => doAction("renew")}
            loading={busy === "renew"}
            icon={<Ionicons name="refresh" size={16} color="#fff" />}
          />
          {channel.status === "active" ? (
            <Button
              testID="disable-btn"
              title="Disable Channel"
              variant="secondary"
              onPress={() => doAction("disable")}
              loading={busy === "disable"}
            />
          ) : channel.status === "disabled" ? (
            <Button
              testID="enable-btn"
              title="Enable Channel"
              variant="secondary"
              onPress={() => doAction("enable")}
              loading={busy === "enable"}
            />
          ) : null}
          <Button
            testID="delete-btn"
            title="Delete Channel"
            variant="destructive"
            onPress={() => setConfirmDelete(true)}
          />
        </View>
      </ScrollView>

      {/* Preview player modal */}
      <Modal visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={styles.previewHeader}>
            <Text style={{ color: "#fff", fontWeight: "800", flex: 1 }} numberOfLines={1}>
              {channel.name} — Live Preview
            </Text>
            <TouchableOpacity testID="close-preview" onPress={() => setShowPreview(false)}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
          <PreviewPlayer url={channel.playback.hls} />
          <Text style={{ color: "#999", padding: 16, fontSize: 12 }}>
            Note: Preview requires the stream to be publishing to Flussonic. HLS URL: {channel.playback.hls}
          </Text>
        </SafeAreaView>
      </Modal>

      {/* Delete confirmation */}
      <Modal transparent visible={confirmDelete} animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.confirmWrap}>
          <View style={[styles.confirmCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 18 }}>Delete channel?</Text>
            <Text style={{ color: c.textMuted, marginTop: 8 }}>
              This will remove the Flussonic stream and cannot be undone.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Button title="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
              <Button
                testID="delete-confirm"
                title="Delete"
                variant="destructive"
                onPress={() => {
                  setConfirmDelete(false);
                  doAction("delete");
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PreviewPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" }}
      player={player}
      allowsFullscreen
      allowsPictureInPicture
      contentFit="contain"
    />
  );
}

function MetricCell({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const c = getColors("dark");
  return (
    <View style={[styles.metric, { backgroundColor: c.surface, borderColor: c.border }]} testID={testID}>
      <Text style={{ color: c.textMuted, fontSize: 9, letterSpacing: 1.5, fontWeight: "800" }}>{label}</Text>
      <Text
        numberOfLines={1}
        style={{
          color: c.textPrimary,
          fontSize: 16,
          fontWeight: "900",
          marginTop: 4,
          fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function RowKV({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const c = getColors("dark");
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.border,
      }}
    >
      <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>{label}</Text>
      <Text style={{ color: c.textPrimary, fontWeight: "800" }}>{value}</Text>
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
  hero: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  logo: { width: 72, height: 72, borderRadius: 12, backgroundColor: "#111" },
  heroTitle: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  warn: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 4,
    backgroundColor: "rgba(245,158,11,0.08)",
  },
  section: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "800",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: spacing.lg },
  metric: { flexBasis: "48%", borderWidth: 1, borderRadius: radius.md, padding: 12, flexGrow: 1 },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  confirmWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  confirmCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, width: "100%", maxWidth: 400 },
});
