// Design tokens for the Broadcaster app.
// Premium SaaS aesthetic — Dark by default, high contrast, tactical minimalism.

export type ThemeName = "dark" | "light";

export const palette = {
  dark: {
    background: "#050505",
    surface: "#0F0F11",
    surfaceElevated: "#1A1A1D",
    border: "#27272A",
    textPrimary: "#FFFFFF",
    textSecondary: "#A1A1AA",
    textMuted: "#52525B",
  },
  light: {
    background: "#FAFAFA",
    surface: "#FFFFFF",
    surfaceElevated: "#F4F4F5",
    border: "#E4E4E7",
    textPrimary: "#09090B",
    textSecondary: "#52525B",
    textMuted: "#A1A1AA",
  },
};

export const semantic = {
  primary: "#3B82F6",
  primaryHover: "#2563EB",
  accent: "#8B5CF6",
  liveRed: "#EF4444",
  healthyGreen: "#10B981",
  warningYellow: "#F59E0B",
  offlineGrey: "#71717A",
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const font = {
  // Use system fonts (no @expo-google-fonts).
  heading: undefined as string | undefined,
  body: undefined as string | undefined,
  mono: "Courier",
};

export function getColors(theme: ThemeName = "dark") {
  return { ...palette[theme], ...semantic };
}

export type Colors = ReturnType<typeof getColors>;
