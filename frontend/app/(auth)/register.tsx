import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { getColors, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function RegisterScreen() {
  const c = getColors("dark");
  const router = useRouter();
  const { register } = useAuth();
  const { show } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    if (!name || !email || password.length < 6) {
      show("Fill all fields (password 6+ chars)", "error");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, name.trim());
      show("Welcome aboard!", "success");
      router.replace("/(tabs)/dashboard");
    } catch (e: unknown) {
      show((e as Error).message || "Registration failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => router.back()} testID="register-back" style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, marginLeft: 4 }}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary }]}>Create Broadcaster{"\n"}Account</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Set up your workspace to provision live channels.
          </Text>
          <View style={{ marginTop: spacing.xl }}>
            <Input testID="register-name-input" label="Full name" placeholder="John Doe" value={name} onChangeText={setName} />
            <Input
              testID="register-email-input"
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@studio.tv"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              testID="register-password-input"
              label="Password"
              placeholder="At least 6 characters"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Button testID="register-submit-button" title="Create Account" onPress={onRegister} loading={loading} />
            <View style={styles.footer}>
              <Text style={{ color: c.textMuted }}>Already registered? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity testID="go-to-login">
                  <Text style={{ color: c.primary, fontWeight: "700" }}>Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 40 },
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  title: { fontSize: 32, fontWeight: "900", letterSpacing: -1, lineHeight: 38 },
  subtitle: { marginTop: 8, fontSize: 14 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
});
