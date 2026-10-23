import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Badge, Button, Icon, Notice, ProgressBar } from "@/components/ui";
import { colors, shadows, typography } from "@/constants/theme";
import {
  getCurrentItem,
  getOrderProgress,
  isItemComplete,
  type DispatchOrder,
} from "@/domain/dispatch";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import {
  checkBarcode,
  checkSerial,
  completeDispatch,
  getDemoCode,
  getDispatchOrder,
  getErrorMessage,
  getErrorOrder,
} from "@/services/dispatch-api";

export default function DispatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DispatchScreen key={id} id={id} />;
}

function DispatchScreen({ id }: { id: string }) {
  const [order, setOrder] = useState<DispatchOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [code, setCode] = useState("");
  const [validationState, setValidationState] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<TextInputInstance>(null);
  const refocusAfterScan = useRef(false);
  const requestInFlight = useRef(false);
  const mounted = useRef(true);
  const validationFlash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (validationState !== "success") return;
    Animated.sequence([
      Animated.timing(validationFlash, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(validationFlash, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(validationFlash, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(validationFlash, {
        toValue: 0,
        duration: 420,
        useNativeDriver: false,
      }),
    ]).start();
  }, [validationFlash, validationState]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getDispatchOrder(id)
      .then((data) => {
        if (active) setOrder(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(getErrorMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, retry]);

  useEffect(() => {
    if (!busy && refocusAfterScan.current) inputRef.current?.focus();
  }, [busy]);

  const item = order ? getCurrentItem(order) : undefined;
  const serialMode = !!item?.barcodeChecked && !!item.requiresSerial;
  const progress = order
    ? getOrderProgress(order)
    : { checked: 0, total: 0, percent: 0 };
  const itemIndex =
    order?.items.findIndex((line) => line.id === item?.id) ?? -1;
  const demoCode = order && item ? getDemoCode(order) : null;

  async function submitScan(value: string) {
    if (requestInFlight.current || !order || !item) return;
    if (!value.trim() && !serialMode) {
      setError("Escanea o escribe un código antes de validar.");
      inputRef.current?.focus();
      return;
    }
    refocusAfterScan.current = inputRef.current?.isFocused() ?? false;
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    setValidationState("idle");
    setFeedback("");
    try {
      const response = serialMode
        ? await checkSerial(order.id, item.id, value)
        : await checkBarcode(order.id, item.id, value);
      if (!mounted.current) return;
      setOrder(response.order);
      setValidationState("success");
      setCode("");
      if (serialMode) {
        const updatedItem = response.order.items.find(
          (line) => line.id === item.id,
        );
        setFeedback(
          updatedItem && isItemComplete(updatedItem)
            ? `${item.name}: todas las unidades verificadas.`
            : `Serial registrado. ${updatedItem?.serials.length ?? 0} de ${item.quantity} unidades verificadas. Escanea nuevamente el código de barras para la siguiente unidad.`,
        );
      } else if ("serial" in response && response.serial) {
        setFeedback(
          `Artículo correcto. Ahora escanea el serial de la unidad ${item.serials.length + 1} de ${item.quantity}.`,
        );
      } else {
        setFeedback(
          `Artículo sin serial: ${item.quantity} unidades verificadas.`,
        );
      }
    } catch (reason) {
      if (mounted.current) {
        const latestOrder = getErrorOrder(reason);
        if (latestOrder?.id === order.id) {
          setOrder(latestOrder);
        } else if (serialMode) {
          setOrder({
            ...order,
            items: order.items.map((line) =>
              line.id === item.id ? { ...line, barcodeChecked: false } : line,
            ),
          });
        }
        setError(
          serialMode
            ? `${getErrorMessage(reason)} Vuelve a escanear el código de barras antes del serial.`
            : getErrorMessage(reason),
        );
        setValidationState("error");
        setCode("");
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  const camera = useBarcodeScanner({
    disabled: busy,
    onScanned: (value) => {
      void submitScan(value);
    },
  });

  async function confirmDispatch() {
    if (!order || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const completed = await completeDispatch(order.id);
      if (mounted.current) {
        setOrder(completed);
        setFeedback("");
      }
    } catch (reason) {
      if (mounted.current) setError(getErrorMessage(reason));
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "bottom", "left", "right"]}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View className="w-full max-w-content flex-1 self-center">
          <View className="flex-row items-center gap-3 px-5 pb-[18px] pt-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver a las órdenes"
              disabled={busy}
              onPress={goBack}
              className="h-11 w-11 items-center justify-center rounded-[15px] border border-line bg-surface"
            >
              <Icon name="arrow-back" size={22} />
            </Pressable>
            <Text className="flex-1 text-[15px] font-bold text-ink">
              {order?.completedAt
                ? "Comprobante de despacho"
                : "Preparar despacho"}
            </Text>
            <View className="h-9 w-9 items-center justify-center">
              <Icon
                name="shield-checkmark-outline"
                color={colors.secondary}
                size={21}
              />
            </View>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center gap-[15px]">
              <ActivityIndicator color={colors.primary} size="large" />
              <Text className="text-[13px] text-muted">Cargando orden…</Text>
            </View>
          ) : !order ? (
            <View className="gap-4 p-6">
              <Notice message={error || "La orden no está disponible."} />
              <Button
                title="Reintentar"
                onPress={() => {
                  setLoading(true);
                  setError("");
                  setRetry((value) => value + 1);
                }}
              />
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="gap-[18px] p-6 pb-[35px] pt-1.5"
            >
              <View className="gap-2.5 rounded-[20px] border border-line bg-surface px-4 py-3.5">
                <View className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-[15px] bg-primary-light">
                    <Icon name="scan" size={22} color={colors.primary} />
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-[15px] font-extrabold text-ink">
                        {order.id}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={2}
                      className="text-[12px] font-medium text-muted"
                    >
                      {order.customer}
                    </Text>
                  </View>
                  <View className="items-end gap-0.5">
                    <Text className="text-[17px] font-extrabold text-primary">
                      {progress.percent}%
                    </Text>
                    <Text className="text-[9px] font-medium text-muted">
                      {progress.checked}/{progress.total}
                    </Text>
                  </View>
                </View>
                <ProgressBar percent={progress.percent} />
              </View>

              {order.completedAt ? (
                <View className="gap-4 rounded-3xl border border-success-border bg-surface p-6">
                  <View className="h-[78px] w-[78px] items-center justify-center self-center rounded-full bg-secondary-light">
                    <Icon
                      name="checkmark-done"
                      size={42}
                      color={colors.secondary}
                    />
                  </View>
                  <Text className="text-center text-[28px] font-extrabold tracking-[-0.9px] text-ink">
                    ¡Despacho listo!
                  </Text>
                  <Text className="text-center text-[13px] leading-5 text-muted">
                    Cada artículo verificado. Cada serial en su lugar.
                  </Text>
                  <View className="my-[5px] items-center gap-[7px] border-y border-dashed border-line py-5">
                    <Text className="text-[9px] font-semibold tracking-[1.5px] text-muted">
                      CONFIRMACIÓN DEMO
                    </Text>
                    <Text className="text-[18px] font-bold text-ink">
                      SGE-{order.id}
                    </Text>
                    <Text className="text-[11px] text-muted">
                      {new Date(order.completedAt).toLocaleString("es-CL")}
                    </Text>
                  </View>
                  <Button
                    title="Volver a mis órdenes"
                    icon="arrow-forward"
                    onPress={() => router.replace("/")}
                  />
                </View>
              ) : item ? (
                <Animated.View
                  className="gap-3.5 rounded-3xl border border-scanner-border bg-surface p-5"
                  style={[
                    shadows.scanner,
                    {
                      backgroundColor:
                        validationState === "error"
                          ? colors.redLight
                          : validationFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [
                                colors.surface,
                                colors.secondaryLight,
                              ],
                            }),
                      borderColor:
                        validationState === "error"
                          ? colors.red
                          : colors.scannerBorder,
                    },
                  ]}
                >
                  <View className="flex-row items-center justify-between">
                    <Badge tone="orange">
                      ARTÍCULO {itemIndex + 1} DE {order.items.length}
                    </Badge>
                    <View className="flex-row items-center gap-[5px]">
                      <Icon
                        name="grid-outline"
                        size={13}
                        color={colors.muted}
                      />
                      <Text className="text-[11px] font-semibold text-muted">
                        {item.location}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-px text-[21px] font-bold tracking-[-0.5px] text-ink">
                    {item.name}
                  </Text>
                  <Text className="-mt-2 text-[12px] text-muted">
                    SKU {item.sku} · {item.quantity}{" "}
                    {item.quantity === 1 ? "unidad" : "unidades"}
                  </Text>

                  <View className="flex-row items-center gap-2 py-[9px]">
                    <View className="flex-row items-center gap-1.5">
                      <View
                        className={`h-[21px] w-[21px] items-center justify-center rounded-[11px] ${
                          serialMode ? "bg-secondary" : "bg-primary"
                        }`}
                      >
                        {serialMode ? (
                          <Icon
                            name="checkmark"
                            size={13}
                            color={colors.surface}
                          />
                        ) : (
                          <Text className="text-[10px] font-bold text-surface">
                            1
                          </Text>
                        )}
                      </View>
                      <Text
                        className={`text-[10px] ${
                          !serialMode ? "font-bold text-ink" : "text-muted"
                        }`}
                      >
                        Código de barras
                      </Text>
                    </View>
                    <View className="h-px min-w-[8px] flex-1 bg-line" />
                    <View className="flex-row items-center gap-1.5">
                      <View
                        className={`h-[21px] w-[21px] items-center justify-center rounded-[11px] ${
                          serialMode ? "bg-primary" : "bg-line"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-bold ${
                            serialMode ? "text-surface" : "text-muted"
                          }`}
                        >
                          2
                        </Text>
                      </View>
                      <Text
                        className={`text-[10px] ${
                          serialMode ? "font-bold text-ink" : "text-muted"
                        }`}
                      >
                        Serial
                      </Text>
                    </View>
                  </View>

                  {/* <View className="min-h-[176px] overflow-hidden rounded-[13px] bg-scanner">
                    {camera.cameraEnabled && camera.cameraReady ? (
                      <View className="h-[176px]">
                        <CameraView
                          style={{ flex: 1 }}
                          facing="back"
                          onBarcodeScanned={camera.handleBarcodeScanned}
                          barcodeScannerSettings={{
                            barcodeTypes: [
                              "ean13",
                              "ean8",
                              "upc_a",
                              "upc_e",
                              "code128",
                              "code39",
                              "code93",
                              "itf14",
                              "datamatrix",
                              "qr",
                            ],
                          }}
                        />
                        <View className="absolute inset-0 items-center justify-center">
                          <View className="h-[92px] w-[82%] rounded-[10px] border-2 border-secondary" />
                        </View>
                      </View>
                    ) : (
                      <View className="min-h-[176px] items-center justify-center gap-2 p-4">
                        <View className="absolute left-2.5 top-2.5 h-[22px] w-[22px] rounded-tl-[7px] border-l-2 border-t-2 border-scanner-corner" />
                        <View className="absolute right-2.5 top-2.5 h-[22px] w-[22px] rounded-tr-[7px] border-r-2 border-t-2 border-scanner-corner" />
                        <View className="absolute bottom-2.5 left-2.5 h-[22px] w-[22px] rounded-bl-[7px] border-b-2 border-l-2 border-scanner-corner" />
                        <View className="absolute bottom-2.5 right-2.5 h-[22px] w-[22px] rounded-br-[7px] border-b-2 border-r-2 border-scanner-corner" />
                        <Icon
                          name={serialMode ? "scan-outline" : "barcode-outline"}
                          size={59}
                          color={colors.primary}
                        />
                        <Text className="text-center text-[14px] font-bold text-ink">
                          {serialMode
                            ? "Escanea el serial"
                            : "Escanea el código de barras"}
                        </Text>
                        <Text className="text-center text-[10px] leading-4 text-muted">
                          {serialMode
                            ? `Unidad ${item.serials.length + 1} de ${item.quantity} · Un serial por unidad`
                            : item.requiresSerial
                              ? `Unidad ${item.serials.length + 1} de ${item.quantity} · Primero código de barras, luego serial`
                              : "Usa tu lector o ingresa el código abajo"}
                        </Text>
                      </View>
                    )}
                  </View> 

                  <Button
                    title={
                      camera.cameraEnabled
                        ? "Ocultar cámara y usar lector"
                        : "Mostrar cámara"
                    }
                    icon={
                      camera.cameraEnabled
                        ? "eye-off-outline"
                        : "camera-outline"
                    }
                    secondary
                    disabled={busy}
                    onPress={camera.toggleCamera}
                  />*/}

                  {item.requiresSerial && (
                    <View className="flex-row items-center gap-3">
                      <Text className="text-[11px] font-bold text-primary-dark">
                        {item.serials.length}/{item.quantity} seriales
                      </Text>
                      <View className="flex-1">
                        <ProgressBar
                          percent={Math.round(
                            (item.serials.length / item.quantity) * 100,
                          )}
                        />
                      </View>
                    </View>
                  )}

                  <Text className="mt-0.5 text-[9px] font-bold tracking-[1.1px] text-muted">
                    {serialMode ? "SERIAL DEL ARTÍCULO" : "CÓDIGO DE BARRAS"}
                  </Text>
                  <TextInput
                    ref={inputRef}
                    accessibilityLabel={
                      serialMode
                        ? "Serial del artículo"
                        : "Código de barras del artículo"
                    }
                    value={code}
                    onChangeText={(value) => {
                      setCode(value);
                      if (error) setError("");
                      if (validationState !== "idle") {
                        setValidationState("idle");
                      }
                      if (
                        !serialMode &&
                        value.trim() === item.barcode &&
                        !requestInFlight.current
                      ) {
                        void submitScan(value);
                      }
                    }}
                    editable={!busy}
                    placeholder={
                      serialMode
                        ? "Ej. MSV2200-24081"
                        : "Escanea o escribe el código"
                    }
                    placeholderTextColor={colors.muted}
                    className="-mt-[5px] min-h-[53px] rounded-[13px] border border-field bg-background px-3.5 py-[13px] text-[14px] text-ink"
                    style={typography.numeric}
                    autoCorrect={false}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    returnKeyType="send"
                    submitBehavior="submit"
                    onSubmitEditing={(event) => {
                      void submitScan(event.nativeEvent.text);
                    }}
                  />
                  {camera.permissionDenied && (
                    <Text className="-mt-1 text-[10px] leading-4 text-muted">
                      Activa el permiso de cámara en los ajustes para escanear
                      desde este teléfono.
                    </Text>
                  )}
                  {/* <View className="-mt-1.5 flex-row items-center gap-[5px]">
                    <Icon
                      name="keypad-outline"
                      color={colors.muted}
                      size={13}
                    />
                    <Text className="text-[10px] text-muted">
                      {isZebraTc26
                        ? "Zebra DataWedge · Enter para validar"
                        : "Lector tipo teclado · Enter para validar"}
                    </Text>
                  </View> */}
                  <Button
                    title={
                      busy
                        ? "Validando…"
                        : serialMode
                          ? "Validar serial"
                          : "Validar código"
                    }
                    icon="scan-outline"
                    loading={busy}
                    disabled={!code.trim()}
                    onPress={() => {
                      void submitScan(code);
                    }}
                  />
                  <View className="mt-px gap-[9px] rounded-[14px] bg-background p-[13px]">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-[9px] font-bold tracking-[0.7px] text-muted">
                        PRUEBA SIN LECTOR
                      </Text>
                      <Badge>DEMO</Badge>
                    </View>
                    <Text
                      selectable
                      className="text-[13px] font-semibold text-ink"
                      style={typography.numeric}
                    >
                      {demoCode}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Usar código de prueba"
                      disabled={busy || !demoCode}
                      onPress={() => {
                        if (demoCode) void submitScan(demoCode);
                      }}
                      className={`min-h-[40px] flex-row items-center gap-1.5 active:opacity-50 ${
                        busy ? "opacity-50" : ""
                      }`}
                    >
                      <Icon
                        name="flash-outline"
                        size={16}
                        color={colors.primaryDark}
                      />
                      <Text className="flex-1 text-[12px] font-bold text-primary-dark">
                        Usar código de prueba
                      </Text>
                      <Icon
                        name="arrow-forward"
                        size={16}
                        color={colors.primaryDark}
                      />
                    </Pressable>
                  </View>
                </Animated.View>
              ) : (
                <View className="gap-4 rounded-[22px] border border-success-border bg-surface p-[22px]">
                  <View className="flex-row items-center gap-[9px]">
                    <Icon
                      name="checkmark-circle"
                      color={colors.secondary}
                      size={26}
                    />
                    <Text className="text-[20px] font-bold text-ink">
                      Todo verificado
                    </Text>
                  </View>
                  <Text className="text-[13px] leading-[21px] text-muted">
                    Completaste todos los artículos en el orden correcto.
                    Confirma para finalizar el despacho.
                  </Text>
                  <Button
                    title="Confirmar despacho"
                    icon="checkmark-done-outline"
                    loading={busy}
                    onPress={() => {
                      void confirmDispatch();
                    }}
                  />
                </View>
              )}

              {!!error && <Notice message={error} />}
              {!!feedback && !order.completedAt && (
                <Notice message={feedback} success />
              )}

              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-[17px] font-bold tracking-[-0.3px] text-ink">
                  {order.completedAt
                    ? "Detalle de lo preparado"
                    : "Secuencia de preparación"}
                </Text>
                <Icon name="list-outline" size={20} color={colors.muted} />
              </View>
              {!order.completedAt && (
                <View className="-mt-[9px] flex-row items-start gap-[5px]">
                  <Icon
                    name="lock-closed-outline"
                    size={13}
                    color={colors.muted}
                  />
                  <Text className="flex-1 text-[10px] leading-[15px] text-muted">
                    El siguiente artículo se habilita al completar el actual.
                  </Text>
                </View>
              )}
              <View className="rounded-[20px] border border-line bg-surface px-4">
                {order.items.map((line, index) => {
                  const done = isItemComplete(line);
                  const current = item?.id === line.id;
                  return (
                    <View
                      key={line.id}
                      className={`flex-row items-start gap-[11px] py-[18px] ${
                        index > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <View
                        className={`h-[29px] w-[29px] items-center justify-center rounded-[10px] ${
                          current
                            ? "bg-primary-light"
                            : done
                              ? "bg-secondary-light"
                              : "bg-background"
                        }`}
                      >
                        {done ? (
                          <Icon
                            name="checkmark"
                            size={17}
                            color={colors.secondary}
                          />
                        ) : current ? (
                          <Text className="text-[12px] font-bold text-primary-dark">
                            {index + 1}
                          </Text>
                        ) : (
                          <Icon
                            name="lock-closed-outline"
                            color={colors.muted}
                            size={14}
                          />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`text-[12px] font-semibold leading-[18px] ${
                            !done && !current ? "text-muted" : "text-ink"
                          }`}
                        >
                          {line.name}
                        </Text>
                        <Text className="mt-[3px] text-[10px] leading-[15px] text-muted">
                          {line.quantity}{" "}
                          {line.quantity === 1 ? "unidad" : "unidades"} ·{" "}
                          {line.requiresSerial
                            ? `${line.serials.length}/${line.quantity} seriales`
                            : "Sin serial"}
                        </Text>
                        {line.serials.map((serial) => (
                          <Text
                            key={serial}
                            selectable
                            className="mt-[5px] text-[10px] text-secondary"
                          >
                            {serial}
                          </Text>
                        ))}
                      </View>
                      <Text
                        className={`mt-1 text-[9px] font-bold ${
                          done
                            ? "text-secondary"
                            : current
                              ? "text-primary-dark"
                              : "text-muted"
                        }`}
                      >
                        {done ? "Listo" : current ? "Actual" : "Pendiente"}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text className="text-center text-[9px] leading-4 text-muted">
                Entorno de prueba · Datos simulados · Sin conexión a un backend
                real
              </Text>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
