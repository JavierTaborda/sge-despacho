import { memo } from "react";
import { Text, View } from "react-native";

import { Icon } from "@/components/ui";
import { colors } from "@/constants/theme";
import { isItemComplete, type DispatchItem } from "@/domain/dispatch";

export const DispatchItemRow = memo(function DispatchItemRow({
  line,
  index,
  current,
  last,
}: {
  line: DispatchItem;
  index: number;
  current: boolean;
  last: boolean;
}) {
  const done = isItemComplete(line);
  return (
    <View
      className={`border-x border-line bg-surface px-3 ${
        index === 0 ? "rounded-t-[16px] border-t" : ""
      } ${last ? "rounded-b-[16px] border-b" : ""}`}
    >
      <View
        className={`flex-row items-start gap-2.5 py-3 ${
          index > 0 ? "border-t border-line" : ""
        }`}
      >
        <View
          className={`mt-0.5 h-7 w-7 items-center justify-center rounded-[9px] ${
            current ? "bg-primary-light" : done ? "bg-secondary-light" : "bg-background"
          }`}
        >
          {done ? (
            <Icon name="checkmark" size={17} color={colors.secondary} />
          ) : current ? (
            <Text className="text-[12px] font-bold text-primary-dark">{index + 1}</Text>
          ) : (
            <Icon name="barcode-outline" color={colors.muted} size={14} />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              className={`min-w-0 flex-1 text-[12px] font-semibold leading-[17px] ${
                !done && !current ? "text-muted" : "text-ink"
              }`}
            >
              {line.name}
            </Text>
            <Text
              className={`mt-0.5 text-[9px] font-bold ${
                done ? "text-secondary" : current ? "text-primary-dark" : "text-muted"
              }`}
            >
              {done ? "Cargado" : current ? "Actual" : "Pendiente"}
            </Text>
          </View>
          <Text selectable className="text-[10px] leading-[14px] text-muted">
            {line.codbarra ? `Código: ${line.codbarra}  ·  ` : ""}
            Ref: {line.refbarra}
          </Text>
          {!!line.serials.length && (
            <Text selectable className="text-[10px] leading-[14px] text-secondary">
              Serial{line.serials.length > 1 ? "es" : ""}: {line.serials.join(", ")}
            </Text>
          )}
          {!line.serials.length && !!line.serial1 && (
            <Text selectable className="text-[10px] leading-[14px] text-muted">
              Serial previo: {line.serial1}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
});
