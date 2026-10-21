import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { getOrderProgress, type DispatchOrder } from "@/domain/dispatch";
import { getDispatchOrders, getErrorMessage } from "@/services/dispatch-api";

export function useDispatchOrders() {
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"open" | "completed">("open");
  const requestCounter = useRef(0);

  const loadOrders = useCallback(async () => {
    const requestId = ++requestCounter.current;
    setLoading(true);
    setError("");

    try {
      const data = await getDispatchOrders();
      if (requestId === requestCounter.current) setOrders(data);
    } catch (reason: unknown) {
      if (requestId === requestCounter.current) {
        setError(getErrorMessage(reason));
      }
    } finally {
      if (requestId === requestCounter.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadOrders();

      return () => {
        // Descarta respuestas pendientes al salir de la pantalla.
        requestCounter.current += 1;
      };
    }, [loadOrders]),
  );

  const pendingOrders = orders.filter((order) => !order.completedAt);
  const pending = pendingOrders.length;
  const completed = orders.length - pending;
  const units = pendingOrders.reduce((sum, order) => {
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

  return {
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
  };
}
