import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    type TextInputInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Badge, Button, Icon, Notice, ProgressBar } from "@/components/ui";
import { colors } from "@/constants/theme";
import {
    getCurrentItem,
    getOrderProgress,
    isItemComplete,
    type DispatchOrder,
} from "@/domain/dispatch";
import {
    checkBarcode,
    checkSerial,
    completeDispatch,
    getDemoCode,
    getDispatchOrder,
    getErrorMessage,
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
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<TextInputInstance>(null);
  const refocusAfterScan = useRef(false);
  const requestInFlight = useRef(false);
  const mounted = useRef(true);

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
    if (!value.trim()) {
      setError("Escanea o escribe un código antes de validar.");
      inputRef.current?.focus();
      return;
    }
    refocusAfterScan.current = inputRef.current?.isFocused() ?? false;
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = serialMode
        ? await checkSerial(order.id, item.id, value)
        : await checkBarcode(order.id, item.id, value);
      if (!mounted.current) return;
      setOrder(response.order);
      setCode("");
      if (serialMode) {
        const updatedItem = response.order.items.find(
          (line) => line.id === item.id,
        );
        setFeedback(
          updatedItem && isItemComplete(updatedItem)
            ? `${item.name}: todas las unidades verificadas.`
            : `Serial registrado. ${updatedItem?.serials.length ?? 0} de ${item.quantity} unidades verificadas.`,
        );
      } else if ("serial" in response && response.serial) {
        setFeedback(
          `Artículo correcto. Ahora escanea sus ${item.quantity} ${item.quantity === 1 ? "serial" : "seriales"}.`,
        );
      } else {
        setFeedback(
          `Artículo sin serial: ${item.quantity} unidades verificadas.`,
        );
      }
    } catch (reason) {
      if (mounted.current) {
        setError(getErrorMessage(reason));
        setCode("");
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }

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
      style={styles.safe}
      edges={["top", "bottom", "left", "right"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.container}>
          <View style={styles.topbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver a las órdenes"
              disabled={busy}
              onPress={goBack}
              style={styles.backButton}
            >
              <Icon name="arrow-back" size={22} />
            </Pressable>
            <Text style={styles.topbarTitle}>
              {order?.completedAt
                ? "Comprobante de despacho"
                : "Preparar despacho"}
            </Text>
            <View style={styles.secureIcon}>
              <Icon
                name="shield-checkmark-outline"
                color={colors.secondary}
                size={21}
              />
            </View>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.muted}>Cargando orden…</Text>
            </View>
          ) : !order ? (
            <View style={styles.errorState}>
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
              contentContainerStyle={styles.content}
            >
              <View style={styles.headingRow}>
                <Text style={styles.eyebrow}>ORDEN DE DESPACHO</Text>
                <Badge tone={order.completedAt ? "green" : "orange"}>
                  {order.completedAt
                    ? "Completada"
                    : order.priority === "Alta"
                      ? "Prioridad alta"
                      : "En preparación"}
                </Badge>
              </View>
              <Text style={styles.orderId}>{order.id}</Text>
              <Text style={styles.customer}>{order.customer}</Text>
              <View style={styles.addressRow}>
                <Icon name="location-outline" size={16} color={colors.muted} />
                <Text style={styles.address}>{order.address}</Text>
              </View>

              <View style={styles.progressCard}>
                <View style={styles.between}>
                  <Text style={styles.progressTitle}>
                    Progreso de preparación
                  </Text>
                  <Text style={styles.percent}>{progress.percent}%</Text>
                </View>
                <ProgressBar percent={progress.percent} />
                <View style={styles.between}>
                  <Text style={styles.progressCaption}>
                    {progress.checked} de {progress.total} unidades verificadas
                  </Text>
                  <Text style={styles.progressCaption}>
                    {order.items.filter(isItemComplete).length}/
                    {order.items.length} artículos
                  </Text>
                </View>
              </View>

              {order.completedAt ? (
                <View style={styles.successCard}>
                  <View style={styles.successIcon}>
                    <Icon
                      name="checkmark-done"
                      size={42}
                      color={colors.secondary}
                    />
                  </View>
                  <Text style={styles.successTitle}>¡Despacho listo!</Text>
                  <Text style={styles.successDescription}>
                    Cada artículo verificado. Cada serial en su lugar.
                  </Text>
                  <View style={styles.receipt}>
                    <Text style={styles.receiptLabel}>CONFIRMACIÓN DEMO</Text>
                    <Text style={styles.receiptId}>SGE-{order.id}</Text>
                    <Text style={styles.receiptDate}>
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
                <View style={styles.scanCard}>
                  <View style={styles.scanCardHeading}>
                    <Badge tone="orange">
                      ARTÍCULO {itemIndex + 1} DE {order.items.length}
                    </Badge>
                    <View style={styles.location}>
                      <Icon
                        name="grid-outline"
                        size={13}
                        color={colors.muted}
                      />
                      <Text style={styles.locationText}>{item.location}</Text>
                    </View>
                  </View>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.sku}>
                    SKU {item.sku} · {item.quantity}{" "}
                    {item.quantity === 1 ? "unidad" : "unidades"}
                  </Text>

                  <View style={styles.steps}>
                    <View style={styles.step}>
                      <View
                        style={[
                          styles.stepCircle,
                          serialMode && styles.stepCircleDone,
                        ]}
                      >
                        {serialMode ? (
                          <Icon
                            name="checkmark"
                            size={13}
                            color={colors.surface}
                          />
                        ) : (
                          <Text style={styles.stepNumber}>1</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.stepText,
                          !serialMode && styles.stepTextActive,
                        ]}
                      >
                        Código de barras
                      </Text>
                    </View>
                    <View style={styles.stepLine} />
                    <View style={styles.step}>
                      <View
                        style={[
                          styles.stepCircle,
                          !serialMode && styles.stepCircleWaiting,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stepNumber,
                            !serialMode && styles.stepNumberWaiting,
                          ]}
                        >
                          2
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.stepText,
                          serialMode && styles.stepTextActive,
                        ]}
                      >
                        Seriales
                      </Text>
                    </View>
                  </View>

                  <View style={styles.scanner}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                    <Icon
                      name={serialMode ? "scan-outline" : "barcode-outline"}
                      size={59}
                      color={colors.primary}
                    />
                    <Text style={styles.scannerTitle}>
                      {serialMode
                        ? "Escanea el serial"
                        : "Escanea el código de barras"}
                    </Text>
                    <Text style={styles.scannerSubtitle}>
                      {serialMode
                        ? `Unidad ${item.serials.length + 1} de ${item.quantity} · Un serial por unidad`
                        : "Usa tu lector o ingresa el código abajo"}
                    </Text>
                  </View>

                  {serialMode && (
                    <View style={styles.serialProgress}>
                      <Text style={styles.serialCount}>
                        {item.serials.length}/{item.quantity} seriales
                      </Text>
                      <View style={styles.serialTrack}>
                        <ProgressBar
                          percent={Math.round(
                            (item.serials.length / item.quantity) * 100,
                          )}
                        />
                      </View>
                    </View>
                  )}

                  <Text style={styles.inputLabel}>
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
                    onChangeText={setCode}
                    editable={!busy}
                    placeholder={
                      serialMode
                        ? "Ej. MSV2200-24081"
                        : "Escanea o escribe el código"
                    }
                    placeholderTextColor={colors.muted}
                    style={styles.codeInput}
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
                  <View style={styles.readerHint}>
                    <Icon
                      name="keypad-outline"
                      color={colors.muted}
                      size={13}
                    />
                    <Text style={styles.readerHintText}>
                      Lector tipo teclado · Enter para validar
                    </Text>
                  </View>
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
                  <View style={styles.demoBox}>
                    <View style={styles.between}>
                      <Text style={styles.demoTitle}>PRUEBA SIN LECTOR</Text>
                      <Badge>DEMO</Badge>
                    </View>
                    <Text selectable style={styles.demoCode}>
                      {demoCode}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Usar código de prueba"
                      disabled={busy || !demoCode}
                      onPress={() => {
                        if (demoCode) void submitScan(demoCode);
                      }}
                      style={({ pressed }) => [
                        styles.demoButton,
                        (pressed || busy) && { opacity: 0.5 },
                      ]}
                    >
                      <Icon
                        name="flash-outline"
                        size={16}
                        color={colors.primaryDark}
                      />
                      <Text style={styles.demoButtonText}>
                        Usar código de prueba
                      </Text>
                      <Icon
                        name="arrow-forward"
                        size={16}
                        color={colors.primaryDark}
                      />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.readyCard}>
                  <View style={styles.readyHeading}>
                    <Icon
                      name="checkmark-circle"
                      color={colors.secondary}
                      size={26}
                    />
                    <Text style={styles.readyTitle}>Todo verificado</Text>
                  </View>
                  <Text style={styles.readyDescription}>
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

              <View style={styles.sequenceHeader}>
                <Text style={styles.sequenceTitle}>
                  {order.completedAt
                    ? "Detalle de lo preparado"
                    : "Secuencia de preparación"}
                </Text>
                <Icon name="list-outline" size={20} color={colors.muted} />
              </View>
              {!order.completedAt && (
                <View style={styles.lockHint}>
                  <Icon
                    name="lock-closed-outline"
                    size={13}
                    color={colors.muted}
                  />
                  <Text style={styles.lockHintText}>
                    El siguiente artículo se habilita al completar el actual.
                  </Text>
                </View>
              )}
              <View style={styles.sequenceCard}>
                {order.items.map((line, index) => {
                  const done = isItemComplete(line);
                  const current = item?.id === line.id;
                  return (
                    <View
                      key={line.id}
                      style={[
                        styles.sequenceItem,
                        index > 0 && styles.sequenceBorder,
                      ]}
                    >
                      <View
                        style={[
                          styles.sequenceNumber,
                          done && styles.sequenceDone,
                          current && styles.sequenceCurrent,
                        ]}
                      >
                        {done ? (
                          <Icon
                            name="checkmark"
                            size={17}
                            color={colors.secondary}
                          />
                        ) : current ? (
                          <Text style={styles.currentNumber}>{index + 1}</Text>
                        ) : (
                          <Icon
                            name="lock-closed-outline"
                            color={colors.muted}
                            size={14}
                          />
                        )}
                      </View>
                      <View style={styles.flex}>
                        <Text
                          style={[
                            styles.sequenceName,
                            !done && !current && { color: colors.muted },
                          ]}
                        >
                          {line.name}
                        </Text>
                        <Text style={styles.sequenceMeta}>
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
                            style={styles.capturedSerial}
                          >
                            {serial}
                          </Text>
                        ))}
                      </View>
                      <Text
                        style={[
                          styles.sequenceStatus,
                          {
                            color: done
                              ? colors.secondary
                              : current
                                ? colors.primaryDark
                                : colors.muted,
                          },
                        ]}
                      >
                        {done ? "Listo" : current ? "Actual" : "Pendiente"}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.demoDisclaimer}>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { flex: 1, maxWidth: 680, width: "100%", alignSelf: "center" },
  topbar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  topbarTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.ink },
  secureIcon: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  content: { padding: 24, paddingTop: 6, paddingBottom: 35, gap: 18 },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.muted,
  },
  orderId: {
    fontSize: 35,
    fontWeight: "800",
    letterSpacing: -1.3,
    color: colors.ink,
    marginTop: -10,
  },
  customer: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.ink,
    marginTop: -12,
  },
  addressRow: { flexDirection: "row", gap: 5, marginTop: -9 },
  address: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 17,
    gap: 12,
  },
  progressTitle: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  percent: { color: colors.primaryDark, fontSize: 16, fontWeight: "800" },
  progressCaption: { color: colors.muted, fontSize: 10 },
  scanCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#FFDAC7",
    gap: 14,
    boxShadow: "0 5px 20px rgba(24, 28, 36, 0.025)",
  },
  scanCardHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  location: { flexDirection: "row", alignItems: "center", gap: 5 },
  locationText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  itemName: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: 1,
  },
  sku: { fontSize: 12, color: colors.muted, marginTop: -8 },
  steps: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
  },
  step: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepCircle: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleDone: { backgroundColor: colors.secondary },
  stepCircleWaiting: { backgroundColor: colors.line },
  stepNumber: { color: colors.surface, fontSize: 10, fontWeight: "700" },
  stepNumberWaiting: { color: colors.muted },
  stepText: { color: colors.muted, fontSize: 10 },
  stepTextActive: { color: colors.ink, fontWeight: "700" },
  stepLine: { flex: 1, minWidth: 8, height: 1, backgroundColor: colors.line },
  scanner: {
    backgroundColor: "#FFFAF6",
    minHeight: 176,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 8,
  },
  corner: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "#FFA476",
  },
  topLeft: {
    top: 10,
    left: 10,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 7,
  },
  topRight: {
    top: 10,
    right: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 7,
  },
  bottomLeft: {
    bottom: 10,
    left: 10,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 7,
  },
  bottomRight: {
    bottom: 10,
    right: 10,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 7,
  },
  scannerTitle: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: "700",
    textAlign: "center",
  },
  scannerSubtitle: {
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 16,
  },
  serialProgress: { flexDirection: "row", alignItems: "center", gap: 12 },
  serialCount: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  serialTrack: { flex: 1 },
  inputLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: colors.muted,
    marginTop: 2,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: "#D9DDE3",
    backgroundColor: colors.background,
    borderRadius: 13,
    minHeight: 53,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.ink,
    fontSize: 14,
    marginTop: -5,
    fontVariant: ["tabular-nums"],
  },
  readerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: -6,
  },
  readerHintText: { fontSize: 10, color: colors.muted },
  demoBox: {
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 13,
    gap: 9,
    marginTop: 1,
  },
  demoTitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: colors.muted,
  },
  demoCode: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  demoButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  demoButtonText: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  sequenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sequenceTitle: {
    fontSize: 17,
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  lockHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: -9,
  },
  lockHintText: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
  sequenceCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
  },
  sequenceItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    paddingVertical: 18,
  },
  sequenceBorder: { borderTopWidth: 1, borderColor: colors.line },
  sequenceNumber: {
    width: 29,
    height: 29,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  sequenceDone: { backgroundColor: colors.secondaryLight },
  sequenceCurrent: { backgroundColor: colors.primaryLight },
  currentNumber: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  sequenceName: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    color: colors.ink,
  },
  sequenceMeta: {
    fontSize: 10,
    lineHeight: 15,
    color: colors.muted,
    marginTop: 3,
  },
  sequenceStatus: { fontSize: 9, fontWeight: "700", marginTop: 4 },
  capturedSerial: { fontSize: 10, color: colors.secondary, marginTop: 5 },
  readyCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 22,
    gap: 16,
    borderWidth: 1,
    borderColor: "#CBE8D8",
  },
  readyHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  readyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  readyDescription: { fontSize: 13, lineHeight: 21, color: colors.muted },
  successCard: {
    padding: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#CBE8D8",
    borderRadius: 24,
    gap: 16,
  },
  successIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.secondaryLight,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.9,
    color: colors.ink,
    textAlign: "center",
  },
  successDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  receipt: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    paddingVertical: 20,
    gap: 7,
    alignItems: "center",
    marginVertical: 5,
  },
  receiptLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.muted,
    fontWeight: "600",
  },
  receiptId: { fontSize: 18, fontWeight: "700", color: colors.ink },
  receiptDate: { fontSize: 11, color: colors.muted },
  demoDisclaimer: {
    color: colors.muted,
    fontSize: 9,
    textAlign: "center",
    lineHeight: 16,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 15 },
  muted: { color: colors.muted, fontSize: 13 },
  errorState: { padding: 24, gap: 16 },
});
