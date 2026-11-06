import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { StoreApi } from "zustand/vanilla";

import type { AuthFailure, AuthState } from "../stores/auth-state.ts";

export interface AuthLifecycleClient {
  getSession: () => Promise<{ data: { session: Session | null }; error: AuthFailure | null }>;
  onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
  startAutoRefresh: () => void | Promise<void>;
  stopAutoRefresh: () => void | Promise<void>;
}

export interface AppLifecycle {
  currentState: string | null;
  subscribe: (callback: (state: string) => void) => () => void;
}

// startAutoRefresh es async. Serializar por cliente evita que un start tardío
// sobreviva a background/cleanup (también durante el doble efecto de StrictMode).
const refreshQueues = new WeakMap<AuthLifecycleClient, Promise<void>>();

// Sin imports nativos: la restauración y sus carreras se prueban en Node.
export function startAuthLifecycle(
  auth: AuthLifecycleClient,
  store: StoreApi<AuthState>,
  appLifecycle?: AppLifecycle,
) {
  let active = true;
  store.setState({ loading: true, error: null });
  const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
    if (active) store.getState().setSession(session);
  });
  const revision = store.getState().revision;

  // Los callbacks de Supabase son síncronos: no hacemos llamadas auth en ellos.
  const ready = (async () => {
    try {
      const { data, error } = await auth.getSession();
      if (!active) return;
      if (store.getState().revision === revision) {
        if (error) throw error;
        store.getState().setSession(data.session);
      }
      store.getState().finishRestoration();
    } catch {
      if (active) {
        store.getState().finishRestoration(
          "No pudimos restaurar la sesión. Revisa la conexión y el almacenamiento y vuelve a intentar.",
        );
      }
    }
  })();

  function enqueueRefresh(operation: () => void | Promise<void>) {
    const queued = (refreshQueues.get(auth) ?? Promise.resolve()).then(operation).catch(() => {
      if (active) store.setState({ error: "No pudimos renovar la sesión. Revisa tu conexión." });
    });
    refreshQueues.set(auth, queued);
  }
  function refresh(state: string | null) {
    enqueueRefresh(() => {
      if (!active) return;
      return state === "active" ? auth.startAutoRefresh() : auth.stopAutoRefresh();
    });
  }
  const removeAppListener = appLifecycle?.subscribe(refresh);
  if (appLifecycle) refresh(appLifecycle.currentState);

  return {
    ready,
    dispose: () => {
      active = false;
      subscription.unsubscribe();
      removeAppListener?.();
      if (appLifecycle) enqueueRefresh(() => auth.stopAutoRefresh());
    },
  };
}
