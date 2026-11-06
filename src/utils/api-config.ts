import { DispatchError } from "../domain/dispatch.ts";

export function normalizeBackendUrl(value: string) {
  if (!value.trim()) {
    throw new DispatchError("Configura EXPO_PUBLIC_API_URL para conectar con el backend.", 500);
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new DispatchError("EXPO_PUBLIC_API_URL debe ser una URL HTTP o HTTPS válida.", 500);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash) {
    throw new DispatchError("EXPO_PUBLIC_API_URL debe usar HTTP o HTTPS, sin query ni fragmento.", 500);
  }
  return value.trim().replace(/\/+$/, "").replace(/\/api$/, "");
}
