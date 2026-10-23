import * as Device from "expo-device";
import { Platform } from "react-native";

function normalize(value: string | null | undefined) {
  return value?.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

export function useScannerDevice() {
  const deviceValues = [
    Device.manufacturer,
    Device.brand,
    Device.modelName,
    Device.productName,
    Device.designName,
  ].map(normalize);
  const deviceDescription = [
    Device.manufacturer,
    Device.modelName,
  ]
    .filter(Boolean)
    .join(" ");

  const isZebra = deviceValues.some((value) => value.includes("zebra"));
  const isTc26 = deviceValues.some((value) => value.includes("tc26"));

  return {
    isZebraTc26: Platform.OS === "android" && isZebra && isTc26,
    deviceDescription,
  };
}
