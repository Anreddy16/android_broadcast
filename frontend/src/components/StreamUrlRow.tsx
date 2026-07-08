import React, { useState } from "react";
import { Modal, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { getColors, radius, spacing } from "@/src/theme";
import { useToast } from "@/src/components/Toast";

type Props = {
  label: string;
  value: string;
  masked?: boolean;
  testID?: string;
};

export function StreamUrlRow({ label, value, masked = false, testID }: Props) {
  const c = getColors("dark");
  const { show } = useToast();
  const [reveal, setReveal] = useState(!masked);
  const [qrOpen, setQrOpen] = useState(false);

  const displayed = reveal ? value : "•".repeat(Math.min(28, value.length));

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    show(`${label} copied`, "success");
  };
  const shareIt = async () => {
    try {
      await Share.share({ message: `${label}: ${value}` });
    } catch {
      /* noop */
    }
  };

  return (
    <View style={[styles.wrap, { borderColor: c.border, backgroundColor: c.surface }]} testID={testID}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: c.textMuted }]}>{label.toUpperCase()}</Text>
        {masked ? (
          <TouchableOpacity onPress={() => setReveal((v) => !v)} testID={`${testID}-toggle`}>
            <Ionicons name={reveal ? "eye-off" : "eye"} size={16} color={c.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={[styles.valueBox, { backgroundColor: c.background, borderColor: c.border }]}>
        <Text
          testID={`${testID}-value`}
          numberOfLines={1}
          style={[styles.value, { color: c.textPrimary, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) }]}
        >
          {displayed}
        </Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity onPress={copy} testID={`${testID}-copy`} style={[styles.iconBtn, { borderColor: c.border }]}>
          <Ionicons name="copy" size={14} color={c.primary} />
          <Text style={{ color: c.textSecondary, marginLeft: 6, fontSize: 12, fontWeight: "700" }}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={shareIt} testID={`${testID}-share`} style={[styles.iconBtn, { borderColor: c.border }]}>
          <Ionicons name="share-social" size={14} color={c.accent} />
          <Text style={{ color: c.textSecondary, marginLeft: 6, fontSize: 12, fontWeight: "700" }}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setQrOpen(true)} testID={`${testID}-qr`} style={[styles.iconBtn, { borderColor: c.border }]}>
          <Ionicons name="qr-code" size={14} color={c.warningYellow} />
          <Text style={{ color: c.textSecondary, marginLeft: 6, fontSize: 12, fontWeight: "700" }}>QR</Text>
        </TouchableOpacity>
      </View>

      <Modal transparent visible={qrOpen} animationType="fade" onRequestClose={() => setQrOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ color: c.textPrimary, fontWeight: "800", marginBottom: 12 }}>{label}</Text>
            <View style={styles.qrHolder}>
              <QRCode value={value} size={220} backgroundColor="#fff" color="#000" />
            </View>
            <TouchableOpacity onPress={() => setQrOpen(false)} testID={`${testID}-qr-close`} style={[styles.closeBtn, { backgroundColor: c.primary }]}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, borderWidth: 1, borderRadius: radius.md, marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  valueBox: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10, marginTop: 8 },
  value: { fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  iconBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", maxWidth: 360, width: "100%" },
  qrHolder: { padding: 12, backgroundColor: "#fff", borderRadius: 8 },
  closeBtn: { marginTop: spacing.lg, paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.md },
});
