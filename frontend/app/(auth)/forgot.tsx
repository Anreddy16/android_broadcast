import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { getColors, radius, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";

export default function ForgotScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPw, setNewPw] = useState("");
  const [mockToken, setMockToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const request = async () => {
    if (!email) {
      show("Enter your email", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.forgotPassword(email.trim().toLowerCase());
      setMockToken(res.mock_reset_token);
      setToken(res.mock_reset_token);
      setSent(true);
      show("Reset token issued (MOCK)", "success");
    } catch (e: unknown) {
      show((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (!token || newPw.length < 6) {
      show("Provide token and password (6+ chars)", "error");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(email.trim().toLowerCase(), token, newPw);
      show("Password reset. Please sign in.", "success");
      router.replace("/(auth)/login");
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
          <TouchableOpacity onPress={() => router.back()} testID="forgot-back" style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, marginLeft: 4 }}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary }]}>Forgot Password</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            We&apos;ll issue a mock reset token for testing.
          </Text>

          <View style={{ marginTop: spacing.xl }}>
            <Input
              testID="forgot-email-input"
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Button
              testID="forgot-request-button"
              title={sent ? "Resend token" : "Send reset token"}
              onPress={request}
              variant="secondary"
              loading={loading && !sent}
            />

            {sent ? (
              <>
                <View style={[styles.mockBox, { borderColor: c.primary }]}>
                  <Text style={{ color: c.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }}>MOCK RESET TOKEN</Text>
                  <Text testID="mock-reset-token" numberOfLines={2} style={{ color: c.textPrimary, marginTop: 4, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) }}>
                    {mockToken}
                  </Text>
                </View>
                <Input testID="forgot-token-input" label="Reset Token" value={token} onChangeText={setToken} />
                <Input
                  testID="forgot-new-password-input"
                  label="New Password"
                  secureTextEntry
                  value={newPw}
                  onChangeText={setNewPw}
                />
                <Button testID="forgot-reset-button" title="Reset Password" onPress={reset} loading={loading && sent} />
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
  subtitle: { marginTop: 8, fontSize: 14 },
  mockBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: "rgba(59,130,246,0.08)",
  },
});
