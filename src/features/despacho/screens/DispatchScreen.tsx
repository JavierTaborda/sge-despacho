import { router } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
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

import { Button, Icon, Notice, ProgressBar } from "@/components/ui";
import { colors, shadows, typography } from "@/constants/theme";
import {
  getOrderProgress,
  getPendingSerialItem,
  isItemComplete,
  isOrderComplete,
  type DispatchOrder,
} from "@/domain/dispatch";
import {
  checkBarcode,
  checkSerial,
  getDispatchOrder,
  getErrorMessage,
  getErrorOrder,
  submitPredispatch,
} from "@/features/despacho/services/dispatch-api";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";

export default function DispatchScreen({ id }: { id: string }) {
  const [order, setOrder] = useState<DispatchOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [code, setCode] = useState("");
  const [validationState, setValidationState] = useState<
    "idle" | "success" | "serial-success" | "error"
  >("idle");
  const [retry, setRetry] = useState(0);
  const [predispatchSent, setPredispatchSent] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const scrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scanSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refocusAfterScan = useRef(false);
  const requestInFlight = useRef(false);
  const mounted = useRef(true);
  const [validationFlash] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (validationState === "serial-success") {
      Animated.sequence([
        Animated.timing(validationFlash, {
          toValue: 1,
          duration: 180,
          useNativeDriver: false,
        }),
        Animated.timing(validationFlash, {
          toValue: 2,
          duration: 180,
          useNativeDriver: false,
        }),
        Animated.timing(validationFlash, {
          toValue: 0,
          duration: 420,
          useNativeDriver: false,
        }),
      ]).start();
      return;
    }
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

  useEffect(
    () => () => {
      if (scanSubmitTimer.current) clearTimeout(scanSubmitTimer.current);
    },
    [],
  );
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

  const pendingSerialItem = order ? getPendingSerialItem(order) : undefined;
  const barcodeItem =
    order && code.trim()
      ? order.items.find(
          (line) => line.barcode === code.trim() && !isItemComplete(line),
        )
      : undefined;
  const item = pendingSerialItem ?? barcodeItem;
  const orderCompleted = !!order && isOrderComplete(order);
  const serialMode = !!pendingSerialItem;
  const captureComplete =
    !!order && order.items.length > 0 && order.items.every(isItemComplete);
  const progress = order
    ? getOrderProgress(order)
    : { checked: 0, total: 0, percent: 0 };
  async function submitScan(value: string) {
    if (scanSubmitTimer.current) {
      clearTimeout(scanSubmitTimer.current);
      scanSubmitTimer.current = null;
    }
    if (requestInFlight.current || !order || orderCompleted) return;
    const activeSerialItem = getPendingSerialItem(order);
    const targetItem =
      activeSerialItem ??
      order.items.find(
        (line) => line.barcode === value.trim() && !isItemComplete(line),
      );
    if (!targetItem) {
      setError(
        "No encontramos un artículo pendiente con ese código de barras.",
      );
      setValidationState("error");
      setCode("");
      inputRef.current?.focus();
      return;
    }
    const capturingSerial = !!activeSerialItem;
    if (!value.trim() && !capturingSerial) {
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
      const response = capturingSerial
        ? await checkSerial(order.id, targetItem.id, value)
        : await checkBarcode(order.id, targetItem.id, value);
      if (!mounted.current) return;
      setOrder(response.order);
      const responseHasSerial = "serial" in response && !!response.serial;
      setValidationState(
        !capturingSerial && responseHasSerial ? "serial-success" : "success",
      );
      setCode("");
      if (capturingSerial) {
        const updatedItem = response.order.items.find(
          (line) => line.id === targetItem.id,
        );
        setFeedback(
          `Captura local, sin enviar al backend. ${
            updatedItem && isItemComplete(updatedItem)
              ? `${targetItem.name}: todas las unidades verificadas.`
              : `Serial registrado. ${updatedItem?.serials.length ?? 0} de ${targetItem.quantity} unidades verificadas. Escanea nuevamente el código de barras para la siguiente unidad.`
          }`,
        );
      } else if ("serial" in response && response.serial) {
        setFeedback(
          `${targetItem.name} correcto. Ahora escanea el serial de la unidad ${targetItem.serials.length + 1} de ${targetItem.quantity}.`,
        );
      } else {
        setFeedback(
          `${targetItem.name}: artículo sin serial, unidad verificada.`,
        );
      }
    } catch (reason) {
      if (mounted.current) {
        const latestOrder = getErrorOrder(reason);
        if (latestOrder?.id === order.id) {
          setOrder(latestOrder);
        }
        setError(getErrorMessage(reason));
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

  function handleCodeChange(value: string) {
    setCode(value);
    if (error) setError("");
    if (validationState !== "idle") setValidationState("idle");
    if (scanSubmitTimer.current) clearTimeout(scanSubmitTimer.current);

    const scannedCode = value.trim();
    if (!order || orderCompleted || scannedCode.length <= 4) {
      scanSubmitTimer.current = null;
      return;
    }

    scanSubmitTimer.current = setTimeout(() => {
      scanSubmitTimer.current = null;
      void submitScan(scannedCode);
    }, 180);
  }

  const camera = useBarcodeScanner({
    disabled: busy || !item || orderCompleted,
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
      await submitPredispatch(order);
      if (mounted.current) {
        setPredispatchSent(true);
        setFeedback("Orden predespachada enviada correctamente.");
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
              {orderCompleted
                ? "Comprobante de despacho"
                : "Captura local de despacho"}
            </Text>
            <View className="h-9 w-9 items-center justify-center"></View>
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
            <>
              <ScrollView
                ref={scrollViewRef}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onScroll={(event) => {
                  setShowScrollToTop(event.nativeEvent.contentOffset.y > 320);
                }}
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
                          {order.prednum} · Pedido {order.pednum}
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

                {orderCompleted ? (
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
                      El backend informa que esta orden está finalizada.
                    </Text>
                    <View className="my-[5px] items-center gap-[7px] border-y border-dashed border-line py-5">
                      <Text className="text-[9px] font-semibold tracking-[1.5px] text-muted">
                        ESTADO DEL BACKEND: FINALIZADO
                      </Text>
                      <Text className="text-[18px] font-bold text-ink">
                        Despacho {order.prednum} · Pedido {order.pednum}
                      </Text>
                      <Text className="text-[11px] text-muted">
                        {order.fecfinalStr ||
                          order.completedAt ||
                          "Fecha de finalización no informada"}
                      </Text>
                      {!!order.duracion && (
                        <Text className="text-[11px] text-muted">
                          Duración: {order.duracion}
                        </Text>
                      )}
                    </View>
                    <Button
                      title="Volver a mis órdenes"
                      icon="arrow-forward"
                      onPress={() => router.replace("/")}
                    />
                  </View>
                ) : order.items.length > 0 && !captureComplete ? (
                  <Animated.View
                    className="gap-3 rounded-3xl border border-scanner-border bg-surface p-3"
                    style={[
                      shadows.scanner,
                      {
                        backgroundColor:
                          validationState === "error"
                            ? colors.redLight
                            : validationFlash.interpolate(
                                validationState === "serial-success"
                                  ? {
                                      inputRange: [0, 1, 2],
                                      outputRange: [
                                        serialMode
                                          ? colors.scannerSerialLight
                                          : colors.surface,
                                        colors.scannerSerial,
                                        colors.secondaryLight,
                                      ],
                                    }
                                  : {
                                      inputRange: [0, 1],
                                      outputRange: [
                                        serialMode
                                          ? colors.scannerSerialLight
                                          : colors.surface,
                                        colors.secondaryLight,
                                      ],
                                    },
                              ),
                        borderColor:
                          validationState === "error"
                            ? colors.red
                            : serialMode
                              ? colors.scannerSerial
                              : colors.scannerBorder,
                      },
                    ]}
                  >
                    {item ? (
                      <>
                        <Text className="mt-1 text-[21px] font-bold tracking-[-0.5px] text-ink">
                          {item.name}
                        </Text>
                        <Text className="-mt-2 text-[12px] text-muted">
                          {item.sku} · {item.quantity}{" "}
                          {item.quantity === 1 ? "unidad" : "unidades"}
                        </Text>
                      </>
                    ) : null}

                    {!!camera.error && <Notice message={camera.error} />}

                    {serialMode && (
                      <Text
                        className="mt-0.5 text-[11px] font-bold tracking-[1.1px]"
                        style={{ color: colors.scannerSerial }}
                      >
                        Esperando serial
                      </Text>
                    )}
                    <TextInput
                      ref={inputRef}
                      accessibilityLabel={
                        serialMode
                          ? "Serial del artículo"
                          : "Código de barras del artículo"
                      }
                      value={code}
                      onChangeText={handleCodeChange}
                      editable={!busy}
                      placeholder={
                        serialMode
                          ? "Escanea el serial"
                          : "Escanea o escribe el código"
                      }
                      placeholderTextColor={colors.muted}
                      className=" mt-1 min-h-[53px] rounded-[13px] border border-field bg-background px-3.5 py-[13px] text-[14px] text-ink"
                      style={typography.numeric}
                      autoCorrect={false}
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
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

                    {!!code.trim() && (
                      <Button
                        title={
                          busy
                            ? "Validando…"
                            : serialMode
                              ? "Capturar serial"
                              : "Validar código"
                        }
                        icon="scan-outline"
                        loading={busy}
                        disabled={!code.trim()}
                        onPress={() => {
                          void submitScan(code);
                        }}
                      />
                    )}
                  </Animated.View>
                ) : captureComplete ? (
                  <View className="gap-4 rounded-[22px] border border-success-border bg-surface p-[22px]">
                    <View className="flex-row items-center gap-[9px]">
                      <Icon
                        name="checkmark-circle"
                        color={colors.secondary}
                        size={26}
                      />
                      <Text className="text-[20px] font-bold text-ink">
                        {predispatchSent
                          ? "Predespacho enviado"
                          : "Captura local completa"}
                      </Text>
                    </View>
                    <Text className="text-[13px] leading-[21px] text-muted">
                      {predispatchSent
                        ? ""
                        : "Completaste la captura en esta sesión. Envía los códigos y seriales para registrar el predespacho."}
                    </Text>
                    {!predispatchSent ? (
                      <Button
                        title="Enviar predespacho"
                        icon="checkmark-done-outline"
                        loading={busy}
                        onPress={() => {
                          void confirmDispatch();
                        }}
                      />
                    ) : (
                      <Button
                        title="Volver a mis órdenes"
                        icon="arrow-back"
                        onPress={goBack}
                      />
                    )}
                  </View>
                ) : (
                  <Notice message="El backend no devolvió artículos para capturar en esta orden." />
                )}

                {!!error && <Notice message={error} />}
                {/* {!!feedback && !orderCompleted && (
                  <Notice message={feedback} success />
                )} */}

                <View className="mt-1 flex-row items-center justify-between">
                  <Text className="text-[17px] font-bold tracking-[-0.3px] text-ink">
                    {orderCompleted
                      ? "Detalle de lo preparado"
                      : "Estado de los artículos"}
                  </Text>
                  <Icon name="list-outline" size={20} color={colors.muted} />
                </View>

                <View className="rounded-[20px] border border-line bg-surface px-4">
                  {!order.items.length && (
                    <Text className="py-[18px] text-[13px] text-muted">
                      El backend no devolvió artículos para esta orden.
                    </Text>
                  )}
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
                              name="barcode-outline"
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

                          {!!line.codbarra && (
                            <Text
                              selectable
                              className="mt-[5px] text-[10px] leading-[15px] text-muted"
                            >
                              Código de barra: {line.codbarra}
                            </Text>
                          )}

                          <Text
                            selectable
                            className="mt-[5px] text-[10px] leading-[15px] text-muted"
                          >
                            Ref barra: {line.refbarra}
                          </Text>

                          {line.serials.length
                            ? line.serials.map((serial) => (
                                <Text
                                  key={serial}
                                  selectable
                                  className="mt-[5px] text-[10px] text-secondary"
                                >
                                  Serial: {serial}
                                </Text>
                              ))
                            : line.serial1 && (
                                <Text
                                  selectable
                                  className="mt-[5px] text-[10px] text-muted"
                                >
                                  Serial previo: {line.serial1}
                                </Text>
                              )}
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
              </ScrollView>
              {showScrollToTop && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Volver arriba"
                  onPress={() =>
                    scrollViewRef.current?.scrollTo({ y: 0, animated: true })
                  }
                  className="absolute bottom-5 right-5 z-10 h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg"
                >
                  <Icon name="arrow-up" size={22} color={colors.surface} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
