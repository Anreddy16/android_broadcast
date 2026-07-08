import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { getColors, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function LoginScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { login } = useAuth();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const onLogin = async () => {
    if (!email || !password) {
      show("Enter email and password", "error");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)/dashboard");
    } catch (e: unknown) {
      show((e as Error).message || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Image
        source={{
          uri: "https://images.unsplash.com/photo-1763128734412-e1aa7d71d006?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDB8MHwxfHNlYXJjaHwxfHxsaXZlJTIwYnJvYWRjYXN0JTIwc3R1ZGlvJTIwZGFya3xlbnwwfHx8fDE3ODM1MTkyMzZ8MA&ixlib=rb-4.1.0&q=85",
        }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["rgba(5,5,5,0.3)", "rgba(5,5,5,0.85)", "#050505"]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandRow}>
              <View style={[styles.brandBadge, { borderColor: c.liveRed }]}>
                <View style={[styles.brandDot, { backgroundColor: c.liveRed }]} />
                <Text style={styles.brandBadgeTxt}>ON AIR</Text>
              </View>
            </View>

            <Text testID="login-title" style={[styles.title, { color: c.textPrimary }]}>
              Broadcast{"\n"}Command Center
            </Text>
            <Text style={[styles.subtitle, { color: c.textSecondary }]}>
              Provision live channels, manage RTMP feeds and monitor viewers in real time.
            </Text>

            <View style={{ marginTop: spacing.xl }}>
              <Input
                testID="login-email-input"
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@studio.tv"
                value={email}
                onChangeText={setEmail}
              />
              <View>
                <Input
                  testID="login-password-input"
                  label="Password"
                  placeholder="••••••••"
                  secureTextEntry={!showPw}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPw((v) => !v)}
                  style={styles.eyeBtn}
                  testID="login-toggle-password"
                >
                  <Ionicons name={showPw ? "eye-off" : "eye"} size={18} color={c.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.linkRow}>
                <Link href="/(auth)/forgot" asChild>
                  <TouchableOpacity testID="forgot-password-link">
                    <Text style={[styles.link, { color: c.textSecondary }]}>Forgot password?</Text>
                  </TouchableOpacity>
                </Link>
                <Link href="/(auth)/otp" asChild>
                  <TouchableOpacity testID="otp-login-link">
                    <Text style={[styles.link, { color: c.primary }]}>Login with OTP</Text>
                  </TouchableOpacity>
                </Link>
              </View>

              <Button
                testID="login-submit-button"
                title="Sign In"
                onPress={onLogin}
                loading={loading}
                style={{ marginTop: spacing.md }}
              />

              <View style={styles.registerRow}>
                <Text style={{ color: c.textMuted }}>New here? </Text>
                <Link href="/(auth)/register" asChild>
                  <TouchableOpacity testID="go-to-register">
                    <Text style={[styles.link, { color: c.primary }]}>Create broadcaster account</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 40 },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xxl },
  brandBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  brandDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  brandBadgeTxt: { color: "#EF4444", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 36, fontWeight: "900", letterSpacing: -1, lineHeight: 40 },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  eyeBtn: { position: "absolute", right: 14, top: 32 },
  linkRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md, marginTop: 2 },
  link: { fontSize: 13, fontWeight: "700" },
  registerRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl, flexWrap: "wrap" },
});
