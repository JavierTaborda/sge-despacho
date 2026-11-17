import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import {
  getDispatchOrders,
  getErrorMessage,
  hasLocalCaptures,
  refreshDispatchOrders,
} from "@/features/despacho/services/dispatch-api";
import type { BackendDispatchOrder } from "@/services/backend-dispatch";

export function useDispatchOrders() {
  const [orders, setOrders] = useState<BackendDispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshConfirmation, setRefreshConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"open" | "completed">("open");
  const requestCounter = useRef(0);
  const checkingRefresh = useRef(false);

  const loadOrders = useCallback(async (refresh = false) => {
    const requestId = ++requestCounter.current;
    setLoading(true);
    setRefreshing(refresh);
    setError("");

    try {
      const data = await (refresh ? refreshDispatchOrders() : getDispatchOrders());
      if (requestId === requestCounter.current) setOrders(data);
    } catch (reason: unknown) {
      if (requestId === requestCounter.current) {
        setError(getErrorMessage(reason));
      }
    } finally {
      if (requestId === requestCounter.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    if (checkingRefresh.current || loading || refreshConfirmation) return;
    checkingRefresh.current = true;
    const requestId = requestCounter.current;
    setRefreshing(true);
    try {
      const needsConfirmation = await hasLocalCaptures();
      if (requestId !== requestCounter.current) return;
      if (needsConfirmation) {
        setRefreshing(false);
        setRefreshConfirmation(true);
      } else {
        await loadOrders(true);
      }
    } catch (reason) {
      if (requestId === requestCounter.current) {
        setRefreshing(false);
        setError(getErrorMessage(reason));
      }
    } finally {
      checkingRefresh.current = false;
    }
  }, [loadOrders, loading, refreshConfirmation]);

  const confirmRefresh = useCallback(() => {
    setRefreshConfirmation(false);
    return loadOrders(true);
  }, [loadOrders]);

  const cancelRefresh = useCallback(() => setRefreshConfirmation(false), []);

  useFocusEffect(
    useCallback(() => {
      void loadOrders();

      return () => {
        // Descarta respuestas pendientes al salir de la pantalla.
        requestCounter.current += 1;
      };
    }, [loadOrders]),
  );

  const pendingOrders = orders.filter((order) => order.conformado === "En despacho");
  const pending = pendingOrders.length;
  const completed = orders.length - pending;
  const dispatchQuantity = pendingOrders.reduce((sum, order) => sum + order.cantdesp, 0);

  const query = search.trim().toLocaleLowerCase();
  const visibleOrders = orders.filter(
    (order) =>
      (filter === "completed"
        ? order.conformado === "Finalizado"
        : order.conformado === "En despacho") &&
      [order.prednum, order.pednum, order.co_cli, order.Cliente, order.co_zon, order.Zona, order.co_ven, order.Vendedor]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
  );

  return {
    orders,
    visibleOrders,
    loading,
    refreshing,
    refreshConfirmation,
    confirmRefresh,
    cancelRefresh,
    error,
    search,
    setSearch,
    filter,
    setFilter,
    completed,
    pending,
    dispatchQuantity,
    loadOrders,
    refreshOrders,
  };
}
