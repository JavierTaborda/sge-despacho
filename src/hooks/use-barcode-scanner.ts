import {
    useCameraPermissions,
    type BarcodeScanningResult,
} from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";

type UseBarcodeScannerOptions = {
  disabled?: boolean;
  onScanned: (value: string) => void;
};

export function useBarcodeScanner({
  disabled = false,
  onScanned,
}: UseBarcodeScannerOptions) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const resetScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cameraEnabled || !permission || permission.granted) return;

    if (permission.status === "denied" && !permission.canAskAgain) {
      return;
    }

    let active = true;
    void requestPermission().then((result) => {
      if (active) setPermissionDenied(!result.granted);
    });

    return () => {
      active = false;
    };
  }, [cameraEnabled, permission, requestPermission]);

  useEffect(() => {
    return () => {
      if (resetScanTimer.current) clearTimeout(resetScanTimer.current);
    };
  }, []);

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (
        disabled ||
        !cameraEnabled ||
        !permission?.granted ||
        hasScanned ||
        !data.trim()
      ) {
        return;
      }

      setHasScanned(true);
      onScanned(data.trim());
      resetScanTimer.current = setTimeout(() => {
        setHasScanned(false);
      }, 800);
    },
    [cameraEnabled, disabled, hasScanned, onScanned, permission?.granted],
  );

  return {
    cameraEnabled,
    cameraReady: permission?.granted === true,
    permissionDenied:
      permissionDenied ||
      (permission?.status === "denied" && !permission.canAskAgain),
    handleBarcodeScanned,
    toggleCamera: () => {
      setCameraEnabled((enabled) => !enabled);
      setHasScanned(false);
    },
  };
}
