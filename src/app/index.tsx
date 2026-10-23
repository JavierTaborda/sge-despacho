import { router } from "expo-router";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Icon, Notice, ProgressBar } from "@/components/ui";
import { colors, shadows } from "@/constants/theme";
import {
    getOrderProgress,
    getOrderStatus,
    type DispatchOrder,
} from "@/domain/dispatch";
import { useDispatchOrders } from "@/hooks/use-dispatch-orders";

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
      className="mb-3.5 rounded-[22px] border border-line bg-surface p-[19px] active:opacity-80"
      style={shadows.card}
    >
      <View className="flex-row items-center gap-2">
        <View
          className={`h-[35px] w-[35px] items-center justify-center rounded-[12px] ${
            completed ? "bg-secondary-light" : "bg-primary-light"
          }`}
        >
          <Icon
            name={completed ? "checkmark-done-outline" : "cube-outline"}
            color={completed ? colors.secondary : colors.primary}
            size={20}
          />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold tracking-[0.1px] text-ink">
            {order.id}
          </Text>
          <Text className="mt-1 text-[10px] text-muted">
            Predespacho · Pedido {order.pednum}
          </Text>
        </View>
      </View>
      <Text className="mb-2 mt-1 text-[18px] font-bold tracking-[-0.4px] text-ink">
        {order.customer}
      </Text>

      <View className="mb-1 flex-row flex-wrap gap-x-4 gap-y-1.5">
        <View className="flex-row items-center gap-[5px]">
          <Icon name="location-outline" size={15} color={colors.muted} />
          <Text className="text-[11px] text-muted">{order.address}</Text>
        </View>
        {!!order.vendedor && (
          <View className="flex-row items-center gap-[5px]">
            <Icon name="person-outline" size={15} color={colors.muted} />
            <Text className="text-[11px] text-muted">{order.vendedor}</Text>
          </View>
        )}
      </View>
      <View className="flex-row flex-wrap justify-between gap-2.5">
        <View className="flex-row items-center gap-[5px]">
          <Icon name="layers-outline" size={15} color={colors.muted} />
          <Text className="text-[11px] text-muted">
            {order.items.length}{" "}
            {order.items.length === 1 ? "artículo" : "artículos"}
            {" · "}
            {progress.total} uds.
          </Text>
        </View>
        <View className="flex-row items-center gap-[5px]">
          <Icon name="time-outline" size={15} color={colors.muted} />
          <Text className="text-[11px] text-muted">{order.scheduledAt}</Text>
        </View>
      </View>
      {status === "in_progress" && (
        <View className="mt-2 gap-[7px]">
          <ProgressBar percent={progress.percent} />
          <Text className="text-[10px] text-muted">
            {progress.checked}/{progress.total} unidades verificadas
          </Text>
        </View>
      )}
      <View className="mt-2 flex-row items-center justify-between gap-2 border-t border-line pt-[15px]">
        <View className="flex-row items-center gap-[5px]">
          <View
            className={`mr-0.5 h-[5px] w-[5px] rounded-[3px] ${
              completed ? "bg-secondary" : "bg-primary"
            }`}
          />
          <Text className="text-[11px] font-medium text-muted">
            {completed
              ? "Despacho confirmado"
              : status === "in_progress"
                ? "En preparación"
                : "Por preparar"}
          </Text>
        </View>
        <View className="flex-row items-center gap-[5px]">
          <Text className="text-[12px] font-bold text-primary">
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
  const {
    orders,
    visibleOrders,
    loading,
    error,
    search,
    setSearch,
    filter,
    setFilter,
    completed,
    pending,
    units,
    loadOrders,
  } = useDispatchOrders();

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "right", "left"]}
    >
      <View className="w-full max-w-content flex-1 self-center">
        <FlatList
          data={visibleOrders}
          keyExtractor={(order) => order.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-6 pb-10"
          refreshControl={
            <RefreshControl
              refreshing={loading && orders.length > 0}
              onRefresh={() => {
                void loadOrders();
              }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <View>
              <View className="mb-[12px] mt-[25px] overflow-hidden rounded-3xl bg-dark p-5">
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <Text className="mt-2 text-[37px] font-bold tracking-[-1px] text-surface">
                      {loading && !orders.length ? "—" : pending}
                      <Text className="text-[15px] font-medium tracking-[-0.3px]">
                        {" "}
                        {pending === 1
                          ? "orden por preparar"
                          : "órdenes por preparar"}
                      </Text>
                    </Text>
                  </View>
                  <View className="h-[47px] w-[47px] items-center justify-center rounded-[12px] bg-surface">
                    <Icon
                      name="file-tray-stacked-outline"
                      color={colors.primary}
                      size={25}
                    />
                  </View>
                </View>
                <View className="my-3 h-px bg-inverse-line" />
                <View className="flex-row flex-wrap justify-between gap-3">
                  <View className="flex-row items-center gap-[5px]">
                    <Icon
                      name="cube-outline"
                      color={colors.inverseMuted}
                      size={16}
                    />
                    <Text className="text-[11px] text-inverse-text">
                      {units} unidades pendientes
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-[5px]">
                    <Icon
                      name="checkmark-circle"
                      color={colors.inverseSuccess}
                      size={16}
                    />
                    <Text className="text-[11px] text-inverse-text">
                      {completed} listas
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mb-2 flex-row items-center gap-[9px]">
                <Text className="text-[20px] font-bold tracking-[-0.5px] text-ink">
                  Órdenes de despacho
                </Text>
                <View className="h-6 min-w-[24px] items-center justify-center rounded-lg bg-line px-1.5">
                  <Text className="text-[12px] font-bold text-muted">
                    {orders.length}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2 rounded-[15px] border border-line bg-surface px-3.5">
                <Icon name="search-outline" color={colors.muted} size={21} />
                <TextInput
                  accessibilityLabel="Buscar orden o cliente"
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar orden o cliente"
                  placeholderTextColor={colors.muted}
                  className="min-h-[49px] flex-1 py-3 text-[13px] text-ink"
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
              <View className="mb-2 mt-2 flex-row gap-1 rounded-[13px] bg-segment p-1">
                {(["open", "completed"] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: filter === value }}
                    onPress={() => setFilter(value)}
                    className={`min-h-[42px] flex-1 items-center justify-center rounded-[10px] py-[11px] ${
                      filter === value ? "bg-surface" : ""
                    }`}
                    style={filter === value ? shadows.tab : undefined}
                  >
                    <Text
                      className={`text-[12px] font-semibold ${
                        filter === value ? "text-ink" : "text-muted"
                      }`}
                    >
                      {value === "open" ? "Por preparar" : "Finalizadas"}
                      {"  "}
                      {value === "open" ? pending : completed}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {!!error && (
                <View className="mb-4 gap-3">
                  <Notice message={error} />
                  <Button
                    title="Reintentar"
                    secondary
                    onPress={() => {
                      void loadOrders();
                    }}
                  />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator
                className="items-center gap-3 py-10"
                size="large"
                color={colors.primary}
              />
            ) : !error ? (
              <View className="items-center gap-3 py-10">
                <Icon
                  name={
                    search ? "search-outline" : "checkmark-done-circle-outline"
                  }
                  size={42}
                  color={colors.muted}
                />
                <Text className="text-center text-[16px] font-semibold text-ink">
                  {search
                    ? "Sin coincidencias"
                    : filter === "completed"
                      ? "Aún no hay despachos finalizados"
                      : "¡Todo está preparado!"}
                </Text>
                <Text className="text-center text-[13px] leading-5 text-muted">
                  {search
                    ? "Prueba con otro número de orden o cliente."
                    : filter === "completed"
                      ? "Aquí encontrarás las órdenes que confirmes."
                      : "No tienes órdenes pendientes en este momento."}
                </Text>
              </View>
            ) : undefined
          }
          // ListFooterComponent={
          //   <View className="flex-row items-center justify-center gap-[7px] py-[18px]">
          //     <Icon
          //       name="shield-checkmark-outline"
          //       size={17}
          //       color={colors.muted}
          //     />
          //     <Text className="shrink text-[10px] text-muted">
          //       Un artículo a la vez. Ningún paso se queda atrás.
          //     </Text>
          //   </View>
          // }
        />
      </View>
    </SafeAreaView>
  );
}
