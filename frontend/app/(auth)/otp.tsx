import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { getColors, radius, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function OtpScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { verifyOtp } = useAuth();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [mockOtp, setMockOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onRequest = async () => {
    if (!email) {
      show("Enter your email", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.requestOtp(email.trim().toLowerCase());
      setMockOtp(res.mock_otp);
      setSent(true);
      show("OTP sent (MOCK)", "success");
    } catch (e: unknown) {
      show((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    if (!otp) {
      show("Enter the OTP", "error");
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(email.trim().toLowerCase(), otp.trim());
      router.replace("/(tabs)/dashboard");
    } catch (e: unknown) {
      show((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} testID="otp-back" style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, marginLeft: 4 }}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary }]}>OTP Sign-in</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Request a one-time code for your registered email.{"\n"}
            <Text style={{ color: c.warningYellow }}>MOCK: OTP appears on screen for testing.</Text>
          </Text>

          <View style={{ marginTop: spacing.xl }}>
            <Input
              testID="otp-email-input"
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@studio.tv"
            />
            <Button
              testID="otp-request-button"
              title={sent ? "Resend OTP" : "Request OTP"}
              onPress={onRequest}
              variant="secondary"
              loading={loading && !sent}
            />

            {sent ? (
              <>
                <View style={[styles.mockBox, { backgroundColor: "rgba(59,130,246,0.08)", borderColor: c.primary }]}>
                  <Text style={{ color: c.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }}>MOCK OTP</Text>
                  <Text testID="mock-otp-value" style={[styles.mockOtp, { color: c.textPrimary }]}>
                    {mockOtp}
                  </Text>
                </View>
                <View style={{ marginTop: spacing.md }}>
                  <Input
                    testID="otp-code-input"
                    label="Enter 6-digit OTP"
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    maxLength={6}
                    placeholder="123456"
                  />
                  <Button
                    testID="otp-verify-button"
                    title="Verify & Sign In"
                    onPress={onVerify}
                    loading={loading && sent}
                  />
                </View>
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 40 },
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  title: { fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  mockBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    alignItems: "center",
  },
  mockOtp: { fontSize: 32, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), fontWeight: "800", letterSpacing: 6, marginTop: 6 },
});
