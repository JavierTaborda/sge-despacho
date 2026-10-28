import {
  useCameraPermissions,
  type BarcodeScanningResult,
  type CameraMountError,
} from "expo-camera";
import { useFocusEffect } from "expo-router";
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
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState("");
  const scanLocked = useRef(false);

  useEffect(() => {
    if (!cameraEnabled || !permission || permission.granted) return;

    if (permission.status === "denied" && !permission.canAskAgain) {
      return;
    }

    let active = true;
    void requestPermission()
      .then((result) => {
        if (active) setPermissionDenied(!result.granted);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? `No se pudo solicitar la cámara: ${reason.message}`
            : "No se pudo solicitar el permiso de cámara. Usa el lector o ingresa el código.",
        );
        setCameraEnabled(false);
      });

    return () => {
      active = false;
    };
  }, [cameraEnabled, permission, requestPermission]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        scanLocked.current = true;
        setCameraEnabled(false);
      };
    }, []),
  );

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (
        disabled ||
        !cameraEnabled ||
        !permission?.granted ||
        scanLocked.current ||
        !data.trim()
      ) {
        return;
      }

      scanLocked.current = true;
      setCameraEnabled(false);
      onScanned(data.trim());
    },
    [cameraEnabled, disabled, onScanned, permission?.granted],
  );

  return {
    cameraEnabled,
    cameraReady: permission?.granted === true,
    error,
    permissionDenied:
      permissionDenied ||
      (permission?.status === "denied" && !permission.canAskAgain),
    handleBarcodeScanned,
    handleMountError: ({ message }: CameraMountError) => {
      setError(`No se pudo iniciar la cámara: ${message}. Usa el lector o ingresa el código.`);
      setCameraEnabled(false);
    },
    toggleCamera: () => {
      scanLocked.current = false;
      setError("");
      setCameraEnabled((enabled) => !enabled);
    },
  };
}
