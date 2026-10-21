import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors } from "@/constants/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({
  name,
  size = 22,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={false}
      aria-hidden
    />
  );
}

export function Button({
  title,
  onPress,
  icon,
  secondary = false,
  disabled = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const foreground = secondary ? colors.ink : colors.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Icon name={icon} color={foreground} size={20} />
      ) : null}
      <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "orange" | "green";
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === "orange" && { backgroundColor: colors.primaryLight },
        tone === "green" && { backgroundColor: colors.secondaryLight },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === "orange" && { color: colors.primaryDark },
          tone === "green" && { color: colors.secondary },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={styles.progressTrack}
    >
      <View style={[styles.progressFill, { width: `${percent}%` }]} />
    </View>
  );
}

export function Notice({
  message,
  success = false,
}: {
  message: string;
  success?: boolean;
}) {
  const color = success ? colors.secondary : colors.red;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        { backgroundColor: success ? colors.secondaryLight : colors.redLight },
      ]}
    >
      <Icon
        name={success ? "checkmark-circle" : "alert-circle"}
        color={color}
        size={21}
      />
      <Text style={[styles.noticeText, { color }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 17,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondary: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  buttonText: { fontSize: 15, fontWeight: "700" },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  badgeText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  progressTrack: {
    height: 6,
    borderRadius: 5,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  notice: {
    flexDirection: "row",
    gap: 9,
    padding: 14,
    borderRadius: 14,
    alignItems: "flex-start",
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "500" },
});
