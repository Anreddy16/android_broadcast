import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { Card } from "@/src/components/Card";
import { getColors, radius, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";

const CATEGORIES = ["General", "News", "Sports", "Music", "Religious", "Education", "Kids", "Movies", "Events"];
const LANGUAGES = ["English", "Hindi", "Tamil", "Telugu", "Bengali", "Marathi", "Kannada", "Malayalam", "Punjabi"];

export default function CreateChannelScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { show } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      show("Permission needed to pick a logo", "warn");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!res.canceled && res.assets[0]?.base64) {
      const uri = `data:image/jpeg;base64,${res.assets[0].base64}`;
      setLogo(uri);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      show("Channel name is required", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api.createChannel({
        name: name.trim(),
        category,
        language,
        description: description.trim(),
        logo_base64: logo,
      });
      await refresh();
      show("Channel provisioned", "success");
      router.replace(`/channel/${res.channel.id}`);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes("insufficient")) {
        show("Insufficient balance — recharge your wallet.", "error");
      } else {
        show(msg, "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const balance = user?.wallet_balance ?? 0;
  const hasEnough = balance >= 500;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} testID="create-back" style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, marginLeft: 4 }}>Back</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: c.textPrimary }]}>Create Channel</Text>

          {/* Warning banner */}
          <View
            style={[
              styles.banner,
              {
                backgroundColor: hasEnough ? "rgba(59,130,246,0.1)" : "rgba(239,68,68,0.1)",
                borderColor: hasEnough ? c.primary : c.liveRed,
              },
            ]}
          >
            <Ionicons name={hasEnough ? "information-circle" : "warning"} size={18} color={hasEnough ? c.primary : c.liveRed} />
            <Text style={{ color: hasEnough ? c.primary : c.liveRed, marginLeft: 8, flex: 1, fontSize: 13 }}>
              {hasEnough
                ? `₹500 will be deducted for 30 days validity. Balance: ₹${balance}`
                : `Insufficient balance (₹${balance}). Please recharge before creating a channel.`}
            </Text>
          </View>

          {/* Logo picker */}
          <TouchableOpacity
            testID="pick-logo-btn"
            onPress={pickLogo}
            style={[styles.logoBox, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            {logo ? (
              <Image source={{ uri: logo }} style={styles.logoImg} />
            ) : (
              <>
                <Ionicons name="image" size={30} color={c.textMuted} />
                <Text style={{ color: c.textMuted, marginTop: 6, fontSize: 12 }}>Tap to upload channel logo</Text>
              </>
            )}
          </TouchableOpacity>

          <Input testID="channel-name-input" label="Channel name" value={name} onChangeText={setName} placeholder="Studio One HD" />

          <Text style={[styles.label, { color: c.textSecondary }]}>CATEGORY</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                testID={`category-${cat}`}
                onPress={() => setCategory(cat)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: category === cat ? c.primary : c.surface,
                    borderColor: category === cat ? c.primary : c.border,
                  },
                ]}
              >
                <Text style={{ color: category === cat ? "#fff" : c.textSecondary, fontWeight: "700", fontSize: 12 }}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: c.textSecondary, marginTop: spacing.md }]}>LANGUAGE</Text>
          <View style={styles.chipRow}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang}
                testID={`lang-${lang}`}
                onPress={() => setLanguage(lang)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: language === lang ? c.accent : c.surface,
                    borderColor: language === lang ? c.accent : c.border,
                  },
                ]}
              >
                <Text style={{ color: language === lang ? "#fff" : c.textSecondary, fontWeight: "700", fontSize: 12 }}>
                  {lang}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ marginTop: spacing.md }}>
            <Input
              testID="channel-description-input"
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              style={{ height: 90, textAlignVertical: "top", paddingTop: 12 }}
              placeholder="What is your channel about?"
            />
          </View>

          <Card style={{ marginTop: 4 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 6, fontWeight: "700" }}>SUMMARY</Text>
            <Row label="Price" value="₹500" c={c} />
            <Row label="Validity" value="30 days" c={c} />
            <Row label="Wallet Balance" value={`₹${balance}`} c={c} />
            <Row
              label="After creation"
              value={`₹${Math.max(0, balance - 500)}`}
              c={c}
              highlight={!hasEnough}
            />
          </Card>

          <Button
            testID="create-channel-submit"
            title={hasEnough ? "Create Channel & Provision Stream" : "Insufficient Balance"}
            onPress={submit}
            loading={busy}
            disabled={!hasEnough}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value, c, highlight }: { label: string; value: string; c: ReturnType<typeof getColors>; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: highlight ? c.liveRed : c.textPrimary, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "900", marginBottom: spacing.md },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: spacing.lg,
  },
  logoBox: {
    height: 130,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  logoImg: { width: "100%", height: "100%" },
  label: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", marginBottom: 8, textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
});
