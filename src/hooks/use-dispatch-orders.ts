import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import type { BackendDispatchOrder } from "@/services/backend-dispatch";
import { getDispatchOrders, getErrorMessage } from "@/services/dispatch-api";

export function useDispatchOrders() {
  const [orders, setOrders] = useState<BackendDispatchOrder[]>([]);
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
    error,
    search,
    setSearch,
    filter,
    setFilter,
    completed,
    pending,
    dispatchQuantity,
    loadOrders,
  };
}
