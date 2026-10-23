import type { TextStyle } from "react-native";

export const colors = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  ink: "#202329",
  muted: "#757B85",
  line: "#E9EBEF",
  primary: "#459de6",
  primaryDark: "#080cf3",
  primaryLight: "#e8f2ff",
  secondary: "#16825D",
  secondaryLight: "#E7F6EE",
  red: "#FF0000",
  redLight: "#FDEDEC",
  dark: "#23262D",
  fieldBorder: "#D9DDE3",
  scannerBackground: "#EBF0F2 ",
  scannerBorder: "#0fdc73",
  scannerCorner: "#080cf3",
  successBorder: "#CBE8D8",
  inverseMuted: "#B9BEC7",
  inverseLine: "#3C3F46",
  inverseText: "#E1E3E7",
  inverseSuccess: "#82D7AF",
  segment: "#EDEEF1",
};

// NativeWind 4 shadows use legacy native properties rather than RN's boxShadow.
export const shadows = {
  card: { boxShadow: "0 4px 14px rgba(24, 28, 36, 0.025)" },
  scanner: { boxShadow: "0 5px 20px rgba(24, 28, 36, 0.025)" },
  tab: { boxShadow: "0 2px 5px rgba(0, 0, 0, 0.04)" },
};

export const typography = {
  numeric: { fontVariant: ["tabular-nums"] },
} satisfies Record<string, TextStyle>;
