import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { getColors, radius, spacing } from "@/src/theme";

type Props = TextInputProps & {
  label?: string;
  errorText?: string;
  testID?: string;
};

export function Input({ label, errorText, testID, style, ...rest }: Props) {
  const c = getColors("dark");
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? (
        <Text
          style={[
            styles.label,
            { color: c.textSecondary },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        testID={testID}
        placeholderTextColor={c.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: c.surface,
            borderColor: errorText ? c.liveRed : c.border,
            color: c.textPrimary,
          },
          style,
        ]}
        {...rest}
      />
      {errorText ? <Text style={[styles.err, { color: c.liveRed }]}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  err: { fontSize: 12, marginTop: 4 },
});
