import { create } from "axios";

import { useAuthStore } from "@/stores/useAuthStore";

import { configureApi } from "./api-interceptors";

const api = create({
  timeout: 15_000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

configureApi(
  api,
  () => useAuthStore.getState().token,
  () => process.env.EXPO_PUBLIC_API_URL ?? "",
);

export default api;
