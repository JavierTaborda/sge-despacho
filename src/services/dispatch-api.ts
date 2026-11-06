// Seam histórico para tests Node: no importa clientes nativos ni configuración.
// La app consume features/despacho/services/dispatch-api.
export {
  createDispatchClient,
  createDispatchService,
  normalizeBackendUrl,
  backendReadOnlyMessage,
  getErrorMessage,
  getErrorOrder,
} from "../features/despacho/services/dispatch-client.ts";
