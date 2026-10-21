import type { Config } from "tailwindcss";

import { colors } from "./src/constants/theme";

export default {
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- NativeWind 4 has no typed preset export.
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: colors.background,
        surface: colors.surface,
        ink: colors.ink,
        muted: colors.muted,
        line: colors.line,
        primary: {
          DEFAULT: colors.primary,
          dark: colors.primaryDark,
          light: colors.primaryLight,
        },
        secondary: {
          DEFAULT: colors.secondary,
          light: colors.secondaryLight,
        },
        danger: {
          DEFAULT: colors.red,
          light: colors.redLight,
        },
        dark: colors.dark,
        field: colors.fieldBorder,
        scanner: {
          DEFAULT: colors.scannerBackground,
          border: colors.scannerBorder,
          corner: colors.scannerCorner,
        },
        success: { border: colors.successBorder },
        inverse: {
          muted: colors.inverseMuted,
          line: colors.inverseLine,
          text: colors.inverseText,
          success: colors.inverseSuccess,
        },
        segment: colors.segment,
      },
      maxWidth: {
        content: "680px",
      },
    },
  },
  plugins: [],
} satisfies Config;
