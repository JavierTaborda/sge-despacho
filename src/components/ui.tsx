import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
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
      className={`min-h-[54px] flex-row items-center justify-center gap-2.5 rounded-[17px] px-5 py-[15px] active:scale-[0.99] active:opacity-80 ${
        secondary ? "border border-line bg-background" : "bg-primary"
      } ${disabled || loading ? "opacity-50" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Icon name={icon} color={foreground} size={20} />
      ) : null}
      <Text
        className={`text-[15px] font-bold ${secondary ? "text-ink" : "text-surface"}`}
      >
        {title}
      </Text>
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
      className={`self-start rounded-lg px-[9px] py-[5px] ${
        tone === "orange"
          ? "bg-primary-light"
          : tone === "green"
            ? "bg-secondary-light"
            : "bg-background"
      }`}
    >
      <Text
        className={`text-[11px] font-bold ${
          tone === "orange"
            ? "text-primary-dark"
            : tone === "green"
              ? "text-secondary"
              : "text-muted"
        }`}
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
      className="h-1.5 overflow-hidden rounded-[5px] bg-line"
    >
      <View
        className="h-full rounded-[5px] bg-primary"
        style={{ width: `${percent}%` }}
      />
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
      className={`flex-row items-start gap-[9px] rounded-[14px] p-3.5 ${
        success ? "bg-secondary-light" : "bg-danger-light"
      }`}
    >
      <Icon
        name={success ? "checkmark-circle" : "alert-circle"}
        color={color}
        size={21}
      />
      <Text
        className={`flex-1 text-[13px] font-medium leading-[19px] ${
          success ? "text-secondary" : "text-danger"
        }`}
      >
        {message}
      </Text>
    </View>
  );
}
