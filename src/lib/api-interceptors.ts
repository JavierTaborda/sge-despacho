import type { AxiosInstance } from "axios";

import { normalizeBackendUrl } from "../utils/api-config.ts";

export function configureApi(
  api: AxiosInstance,
  getToken: () => string | null,
  getBaseUrl: () => string,
) {
  const interceptor = api.interceptors.request.use((config) => {
    config.baseURL = normalizeBackendUrl(getBaseUrl());
    const token = getToken();
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
    else config.headers.delete("Authorization");
    return config;
  });
  return () => api.interceptors.request.eject(interceptor);
}
