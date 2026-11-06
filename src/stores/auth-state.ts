import type { Session } from "@supabase/supabase-js";
import type { StateCreator } from "zustand/vanilla";

export type AuthFailure = { message: string; code?: string; status?: number };
export interface AuthGateway {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{
    data: { session: Session | null };
    error: AuthFailure | null;
  }>;
  signOut(): Promise<{ error: AuthFailure | null }>;
}

export class AuthError extends Error {}

export function authErrorMessage(error: unknown) {
  if (error instanceof AuthError) return error.message;
  const failure = error as AuthFailure | undefined;
  if (failure?.code === "invalid_credentials") return "Correo o contraseña incorrectos.";
  if (failure?.code === "email_not_confirmed") return "Confirma tu correo antes de iniciar sesión.";
  if (failure?.status === 429) return "Demasiados intentos. Espera un momento y vuelve a intentar.";
  return "No pudimos completar la autenticación. Revisa tu conexión e inténtalo nuevamente.";
}

export interface AuthState {
  session: Session | null;
  token: string | null;
  userId: string | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  // revision protege la restauración; epoch aísla UI y capturas por sesión.
  revision: number;
  sessionEpoch: number;
  setSession: (session: Session | null) => void;
  finishRestoration: (error?: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// El mismo estado se enlaza al hook React en producción y a vanilla en tests.
export function createAuthState(getAuth: () => AuthGateway): StateCreator<AuthState> {
  return (set, get) => ({
    session: null,
    token: null,
    userId: null,
    loading: true,
    busy: false,
    error: null,
    revision: 0,
    sessionEpoch: 0,
    setSession: (session) => set((state) => ({
      session,
      token: session?.access_token ?? null,
      userId: session?.user.id ?? null,
      revision: state.revision + 1,
      sessionEpoch: state.sessionEpoch + (state.userId !== (session?.user.id ?? null) ? 1 : 0),
    })),
    finishRestoration: (error) => set({ loading: false, error: error ?? null }),
    signIn: async (email, password) => {
      if (get().busy || get().loading) throw new AuthError("Espera a que termine la operación actual.");
      if (!email.trim() || !password) throw new AuthError("Introduce tu correo y contraseña.");
      set({ busy: true, error: null });
      try {
        const { data, error } = await getAuth().signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) throw new AuthError("No recibimos una sesión. Inténtalo nuevamente.");
        get().setSession(data.session);
      } catch (error) {
        throw new AuthError(authErrorMessage(error));
      } finally {
        set({ busy: false });
      }
    },
    signOut: async () => {
      if (get().busy) throw new AuthError("Espera a que termine la operación actual.");
      set({ busy: true, error: null });
      try {
        const { error } = await getAuth().signOut();
        if (error) throw error;
        get().setSession(null);
      } catch {
        // No fingir un logout si Supabase no pudo eliminar/revocar la sesión.
        throw new AuthError("No pudimos cerrar la sesión. Revisa tu conexión y vuelve a intentar.");
      } finally {
        set({ busy: false });
      }
    },
  });
}
