// Lightweight toast/snackbar. Global provider mounted at root.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getColors, radius, spacing } from "@/src/theme";

type ToastKind = "info" | "success" | "error" | "warn";
type Toast = { id: number; text: string; kind: ToastKind };

const ToastCtx = createContext<{ show: (text: string, kind?: ToastKind) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const show = useCallback((text: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} />
    </ToastCtx.Provider>
  );
}

function ToastHost({ toasts }: { toasts: Toast[] }) {
  const insets = useSafeAreaInsets();
  const c = getColors("dark");
  return (
    <View
      pointerEvents="none"
      style={[styles.host, { top: insets.top + 12 }]}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} c={c} />
      ))}
    </View>
  );
}

function ToastItem({ t, c }: { t: Toast; c: ReturnType<typeof getColors> }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [opacity]);
  const bg =
    t.kind === "success"
      ? c.healthyGreen
      : t.kind === "error"
      ? c.liveRed
      : t.kind === "warn"
      ? c.warningYellow
      : c.surfaceElevated;
  const color = t.kind === "info" ? c.textPrimary : "#fff";
  return (
    <Animated.View style={[styles.toast, { backgroundColor: bg, borderColor: c.border, opacity }]}>
      <Text testID="toast-text" style={[styles.txt, { color }]}>
        {t.text}
      </Text>
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: 8,
    maxWidth: 520,
  },
  txt: { fontSize: 14, fontWeight: "600" },
});
