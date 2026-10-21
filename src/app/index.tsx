import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Badge, Button, Icon, Notice, ProgressBar } from "@/components/ui";
import { colors } from "@/constants/theme";
import {
    getOrderProgress,
    getOrderStatus,
    type DispatchOrder,
} from "@/domain/dispatch";
import { getDispatchOrders, getErrorMessage } from "@/services/dispatch-api";

function OrderCard({ order }: { order: DispatchOrder }) {
  const progress = getOrderProgress(order);
  const status = getOrderStatus(order);
  const completed = status === "completed";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${order.id}, ${order.customer}, ${progress.total} ${progress.total === 1 ? "unidad" : "unidades"}. ${
        completed ? "Ver comprobante" : "Preparar orden"
      }`}
      onPress={() =>
        router.push({ pathname: "/despacho/[id]", params: { id: order.id } })
      }
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.row}>
        <View style={[styles.orderIcon, completed && styles.completedIcon]}>
          <Icon
            name={completed ? "checkmark-done-outline" : "cube-outline"}
            color={completed ? colors.secondary : colors.primary}
            size={25}
          />
        </View>
        <View style={styles.flex}>
          <Text style={styles.orderId}>{order.id}</Text>
          <Text style={styles.orderCaption}>Orden de despacho</Text>
        </View>
        <Badge
          tone={
            completed
              ? "green"
              : order.priority === "Alta"
                ? "orange"
                : "neutral"
          }
        >
          {completed
            ? "Completada"
            : order.priority === "Alta"
              ? "Prioridad alta"
              : "Normal"}
        </Badge>
      </View>
      <Text style={styles.customer}>{order.customer}</Text>
      <View style={styles.metaRow}>
        <Icon name="location-outline" size={15} color={colors.muted} />
        <Text style={styles.address}>{order.address}</Text>
      </View>
      <View style={styles.facts}>
        <View style={styles.fact}>
          <Icon name="layers-outline" size={15} color={colors.muted} />
          <Text style={styles.factText}>
            {order.items.length}{" "}
            {order.items.length === 1 ? "artículo" : "artículos"}
            {" · "}
            {progress.total} uds.
          </Text>
        </View>
        <View style={styles.fact}>
          <Icon name="time-outline" size={15} color={colors.muted} />
          <Text style={styles.factText}>{order.scheduledAt}</Text>
        </View>
      </View>
      {status === "in_progress" && (
        <View style={styles.cardProgress}>
          <ProgressBar percent={progress.percent} />
          <Text style={styles.progressLabel}>
            {progress.checked}/{progress.total} unidades verificadas
          </Text>
        </View>
      )}
      <View style={styles.cardFooter}>
        <View style={styles.fact}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: completed ? colors.secondary : colors.primary,
              },
            ]}
          />
          <Text style={styles.statusText}>
            {completed
              ? "Despacho confirmado"
              : status === "in_progress"
                ? "En preparación"
                : "Por preparar"}
          </Text>
        </View>
        <View style={styles.fact}>
          <Text style={styles.cardAction}>
            {completed
              ? "Ver detalle"
              : status === "in_progress"
                ? "Continuar"
                : "Comenzar"}
          </Text>
          <Icon name="arrow-forward" size={18} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

export default function Index() {
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestCounter = useRef(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"open" | "completed">("open");

  const loadOrders = useCallback(() => {
    const requestId = ++requestCounter.current;
    setLoading(true);
    setError("");
    getDispatchOrders()
      .then((data) => {
        if (requestId === requestCounter.current) setOrders(data);
      })
      .catch((reason: unknown) => {
        if (requestId === requestCounter.current)
          setError(getErrorMessage(reason));
      })
      .finally(() => {
        if (requestId === requestCounter.current) setLoading(false);
      });
    return () => {
      requestCounter.current += 1;
    };
  }, []);

  useFocusEffect(loadOrders);

  const completed = orders.filter((order) => order.completedAt).length;
  const pending = orders.length - completed;
  const units = orders
    .filter((order) => !order.completedAt)
    .reduce((sum, order) => {
      const { total, checked } = getOrderProgress(order);
      return sum + total - checked;
    }, 0);
  const query = search.trim().toLocaleLowerCase();
  const visibleOrders = orders.filter(
    (order) =>
      (filter === "completed" ? !!order.completedAt : !order.completedAt) &&
      `${order.id} ${order.customer} ${order.address}`
        .toLocaleLowerCase()
        .includes(query),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "left"]}>
      <View style={styles.container}>
        <View style={styles.topbar}>
          <View style={styles.row}>
            <View style={styles.brandMark}>
              <Icon name="paper-plane" color="white" size={22} />
            </View>
            <View>
              <Text style={styles.brand}>
                sge<Text style={styles.brandDot}>.</Text>
              </Text>
              <Text style={styles.brandCaption}>DESPACHO</Text>
            </View>
          </View>
          <View style={styles.demoPill}>
            <View style={styles.demoDot} />
            <Text style={styles.demoLabel}>Modo demo</Text>
          </View>
        </View>
        <FlatList
          data={visibleOrders}
          keyExtractor={(order) => order.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading && orders.length > 0}
              onRefresh={() => {
                loadOrders();
              }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <View>
              <Text style={styles.eyebrow}>CENTRO DE OPERACIONES</Text>
              <Text style={styles.title}>
                Cada despacho,{"\n"}en orden<Text style={styles.orange}>.</Text>
              </Text>
              <Text style={styles.subtitle}>
                Prepara. Verifica. Despacha con confianza.
              </Text>

              <View style={styles.hero}>
                <View style={styles.heroTop}>
                  <View style={styles.flex}>
                    <Text style={styles.heroEyebrow}>TU JORNADA DE HOY</Text>
                    <Text style={styles.heroTitle}>
                      {loading && !orders.length ? "—" : pending}
                      <Text style={styles.heroTitleSmall}>
                        {" "}
                        {pending === 1
                          ? "orden por preparar"
                          : "órdenes por preparar"}
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.heroIcon}>
                    <Icon
                      name="file-tray-stacked-outline"
                      color="#FFAD84"
                      size={30}
                    />
                  </View>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroBottom}>
                  <View style={styles.fact}>
                    <Icon name="cube-outline" color="#B9BEC7" size={16} />
                    <Text style={styles.heroMeta}>
                      {units} unidades pendientes
                    </Text>
                  </View>
                  <View style={styles.fact}>
                    <Icon name="checkmark-circle" color="#82D7AF" size={16} />
                    <Text style={styles.heroMeta}>{completed} listas</Text>
                  </View>
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Órdenes de despacho</Text>
                <View style={styles.count}>
                  <Text style={styles.countText}>{orders.length}</Text>
                </View>
              </View>
              <View style={styles.search}>
                <Icon name="search-outline" color={colors.muted} size={21} />
                <TextInput
                  accessibilityLabel="Buscar orden o cliente"
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar orden o cliente"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {!!search && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Limpiar búsqueda"
                    onPress={() => setSearch("")}
                    hitSlop={12}
                  >
                    <Icon name="close-circle" size={20} color={colors.muted} />
                  </Pressable>
                )}
              </View>
              <View style={styles.filters}>
                {(["open", "completed"] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: filter === value }}
                    onPress={() => setFilter(value)}
                    style={[
                      styles.filter,
                      filter === value && styles.filterActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        filter === value && styles.filterTextActive,
                      ]}
                    >
                      {value === "open" ? "Por preparar" : "Finalizadas"}
                      {"  "}
                      {value === "open" ? pending : completed}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {!!error && (
                <View style={styles.error}>
                  <Notice message={error} />
                  <Button
                    title="Reintentar"
                    secondary
                    onPress={() => {
                      loadOrders();
                    }}
                  />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator
                style={styles.empty}
                size="large"
                color={colors.primary}
              />
            ) : !error ? (
              <View style={styles.empty}>
                <Icon
                  name={
                    search ? "search-outline" : "checkmark-done-circle-outline"
                  }
                  size={42}
                  color={colors.muted}
                />
                <Text style={styles.emptyTitle}>
                  {search
                    ? "Sin coincidencias"
                    : filter === "completed"
                      ? "Aún no hay despachos finalizados"
                      : "¡Todo está preparado!"}
                </Text>
                <Text style={styles.emptyText}>
                  {search
                    ? "Prueba con otro número de orden o cliente."
                    : filter === "completed"
                      ? "Aquí encontrarás las órdenes que confirmes."
                      : "No tienes órdenes pendientes en este momento."}
                </Text>
              </View>
            ) : undefined
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <Icon
                name="shield-checkmark-outline"
                size={17}
                color={colors.muted}
              />
              <Text style={styles.footerText}>
                Un artículo a la vez. Ningún paso se queda atrás.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, width: "100%", maxWidth: 680, alignSelf: "center" },
  flex: { flex: 1 },
  topbar: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 29,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -1.5,
    color: colors.ink,
  },
  brandDot: { color: colors.primary },
  brandCaption: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: colors.muted,
  },
  demoPill: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  demoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  demoLabel: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  list: { paddingHorizontal: 24, paddingBottom: 40 },
  eyebrow: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: colors.muted,
  },
  title: {
    fontSize: 37,
    lineHeight: 43,
    letterSpacing: -1.6,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 10,
  },
  orange: { color: colors.primary },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 10,
  },
  hero: {
    padding: 21,
    marginTop: 25,
    marginBottom: 30,
    backgroundColor: colors.dark,
    borderRadius: 24,
    overflow: "hidden",
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroEyebrow: {
    color: "#B9BEC7",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: colors.surface,
    fontSize: 37,
    fontWeight: "700",
    marginTop: 10,
    letterSpacing: -1,
  },
  heroTitleSmall: { fontSize: 15, fontWeight: "500", letterSpacing: -0.3 },
  heroIcon: {
    width: 57,
    height: 57,
    borderRadius: 19,
    backgroundColor: "#3F322D",
    alignItems: "center",
    justifyContent: "center",
  },
  heroDivider: { height: 1, backgroundColor: "#3C3F46", marginVertical: 18 },
  heroBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  heroMeta: { fontSize: 11, color: "#E1E3E7" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    letterSpacing: -0.5,
    fontWeight: "700",
    color: colors.ink,
  },
  count: {
    backgroundColor: colors.line,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 12, fontWeight: "700", color: colors.muted },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    minHeight: 49,
    paddingVertical: 12,
    fontSize: 13,
    color: colors.ink,
  },
  filters: {
    flexDirection: "row",
    backgroundColor: "#EDEEF1",
    borderRadius: 13,
    padding: 4,
    gap: 4,
    marginTop: 15,
    marginBottom: 20,
  },
  filter: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  filterActive: {
    backgroundColor: colors.surface,
    boxShadow: "0 2px 5px rgba(0, 0, 0, 0.04)",
  },
  filterText: { fontSize: 12, fontWeight: "600", color: colors.muted },
  filterTextActive: { color: colors.ink },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 19,
    borderRadius: 22,
    marginBottom: 14,
    boxShadow: "0 4px 14px rgba(24, 28, 36, 0.025)",
  },
  cardPressed: { opacity: 0.8 },
  orderIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  completedIcon: { backgroundColor: colors.secondaryLight },
  orderId: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.1,
    color: colors.ink,
  },
  orderCaption: { fontSize: 10, color: colors.muted, marginTop: 4 },
  customer: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4,
    marginTop: 20,
    marginBottom: 8,
  },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  address: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 17 },
  facts: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 17,
  },
  fact: { flexDirection: "row", alignItems: "center", gap: 5 },
  factText: { fontSize: 11, color: colors.muted },
  cardProgress: { marginTop: 16, gap: 7 },
  progressLabel: { fontSize: 10, color: colors.muted },
  cardFooter: {
    borderTopWidth: 1,
    borderColor: colors.line,
    marginTop: 18,
    paddingTop: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3, marginRight: 2 },
  statusText: { color: colors.muted, fontSize: 11, fontWeight: "500" },
  cardAction: { color: colors.primaryDark, fontSize: 12, fontWeight: "700" },
  footer: {
    paddingVertical: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  footerText: { flexShrink: 1, color: colors.muted, fontSize: 10 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  error: { gap: 12, marginBottom: 16 },
});
