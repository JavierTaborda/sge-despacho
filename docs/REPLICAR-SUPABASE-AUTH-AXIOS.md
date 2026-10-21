# Replicar Supabase, autenticación y Axios

Esta guía describe cómo trasladar el patrón usado en este proyecto a otra aplicación Expo/React Native con TypeScript.

La arquitectura tiene cuatro piezas:

1. `lib/supabase.ts`: cliente Supabase con persistencia de sesión.
2. `stores/useAuthStore.ts`: estado global de sesión, usuario y token.
3. `providers/AuthProvider.tsx`: inicialización y sincronización de renovaciones.
4. `lib/axios.ts`: cliente HTTP que añade el JWT a cada petición.

## 1. Requisitos

Instala las dependencias:

```bash
npx expo install @react-native-async-storage/async-storage expo-secure-store react-native-get-random-values react-native-url-polyfill
npm install @supabase/supabase-js axios zustand aes-js jwt-decode
npm install -D @types/aes-js
```

Para una app que solo funciona en web no hace falta `expo-secure-store`, `aes-js` ni `react-native-get-random-values`, pero sí el almacenamiento web.

## 2. Variables de entorno

Crea `.env` en la raíz del proyecto y no lo publiques:

```env
EXPO_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
EXPO_PUBLIC_API_URL=https://tu-api.example.com/api/
```

Puedes versionar únicamente un `.env.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url-here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
EXPO_PUBLIC_API_URL=your-api-url-here
```

Las variables `EXPO_PUBLIC_*` se incluyen en el cliente. La clave anon/publishable está diseñada para usarse en el cliente y debe estar protegida por las políticas RLS de Supabase. Nunca incluyas una `service_role` key ni secretos del backend.

Después de cambiar variables de entorno, reinicia Metro:

```bash
npx expo start -c
```

En EAS configura las variables en el entorno correspondiente; no dependas de un `.env` local durante el build.

## 3. Cliente Supabase

Crea `lib/supabase.ts`. En móvil, este proyecto cifra el valor de sesión con AES, guarda la clave en `SecureStore` y guarda el valor cifrado en `AsyncStorage`. En web usa `localStorage`.

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as aesjs from "aes-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const isWeb = Platform.OS === "web";

class CustomSecureStore {
  private async encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(
      encryptionKey,
      new aesjs.Counter(1),
    );
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(
      key,
      aesjs.utils.hex.fromBytes(encryptionKey),
    );
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const value = await AsyncStorage.getItem(key);
    return value ? this.decrypt(key, value) : null;
  }

  async setItem(key: string, value: string) {
    await AsyncStorage.setItem(key, await this.encrypt(key, value));
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

const webStorage = {
  getItem: async (key: string) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isWeb ? webStorage : new CustomSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb,
  },
});

if (!isWeb) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
```

### Consideraciones del almacenamiento

- La persistencia debe usar la misma implementación en toda la app.
- `localStorage` no ofrece el mismo nivel de protección que `SecureStore`; se usa aquí por compatibilidad web.
- El cifrado en el cliente no sustituye a RLS, validación del backend ni revocación de sesiones.
- Para una primera implementación también puedes usar `AsyncStorage` directamente, pero `SecureStore` es preferible para material sensible.

## 4. Store de autenticación

Crea un store Zustand que sea la única fuente de verdad para el token que consumirá Axios. El ejemplo mínimo cubre login, restauración y logout:

```ts
import { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  token: string | null;
  userId: string | undefined;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setToken: (token: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  token: null,
  userId: undefined,
  loading: true,

  setSession: (session) => set({ session }),
  setToken: (token) => set({ token }),

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (data.session) {
        set({
          session: data.session,
          token: data.session.access_token,
          userId: data.user.id,
        });
      }

      return { error };
    } catch (error) {
      return { error: error as Error };
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, token: null, userId: undefined, loading: false });
  },

  initializeAuth: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.getSession();
      const session = error ? null : data.session;
      set({
        session,
        token: session?.access_token ?? null,
        userId: session?.user.id,
      });
    } finally {
      set({ loading: false });
    }
  },
}));
```

El proyecto original añade al store `role`, `name`, login por OTP, biometría y un estado persistido `active/loggedOut`. Esas piezas se pueden copiar solo si la nueva app las necesita.

Para OTP:

```ts
await supabase.auth.signInWithOtp({ email });

await supabase.auth.verifyOtp({
  email,
  token,
  type: "email",
});
```

Para roles o claims personalizados, valida siempre el JWT en el backend. `jwt-decode` solo decodifica el contenido y no verifica su firma; no debe usarse como mecanismo de autorización.

## 5. Sincronizar renovaciones con `AuthProvider`

Monta este proveedor una sola vez, normalmente alrededor del contenido raíz de Expo Router. Debe inicializar la sesión almacenada y escuchar `TOKEN_REFRESHED`:

```tsx
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/useAuthStore";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    void initializeAuth();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        useAuthStore.getState().setSession(null);
        useAuthStore.getState().setToken(null);
        return;
      }

      if (session) {
        useAuthStore.getState().setSession(session);
        useAuthStore.getState().setToken(session.access_token);
      }
    });

    return () => data.subscription.unsubscribe();
  }, [initializeAuth]);

  return children;
}
```

En la app original este proveedor también controla splash, mantenimiento y estado de eliminación de cuenta. Mantén esas decisiones fuera de `lib/supabase.ts` para que el cliente quede reutilizable.

## 6. Cliente Axios con Bearer token

Crea `lib/axios.ts`:

```ts
import axios from "axios";
import { useAuthStore } from "@/stores/useAuthStore";

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

export default api;
```

Uso desde un servicio:

```ts
import api from "@/lib/axios";

export async function getOrders() {
  const response = await api.get("/orders");
  return response.data;
}
```

No guardes una copia fija del token al crear Axios. El interceptor debe leer `useAuthStore.getState().token` en cada request, porque el access token puede renovarse mientras la app está abierta.

### Respuestas 401

Puedes añadir un interceptor de respuesta para reaccionar a una sesión inválida:

```ts
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await useAuthStore.getState().signOut();
    }

    return Promise.reject(error);
  },
);
```

Hazlo solo si el backend devuelve `401` de forma consistente. No intentes renovar manualmente el token desde Axios si Supabase ya tiene `autoRefreshToken` activo, porque puedes provocar solicitudes duplicadas o carreras de estado.

## 7. Montaje en Expo Router

En `app/_layout.tsx`, coloca el proveedor sobre las rutas que necesitan autenticación:

```tsx
import { Stack } from "expo-router";
import { AuthProvider } from "@/providers/AuthProvider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}
```

La navegación debe esperar a que `loading` termine antes de decidir si muestra `(auth)` o `(main)`. Así se evita mostrar brevemente el login mientras Supabase restaura la sesión.

## 8. Configuración de Supabase

En el proyecto de Supabase:

1. Configura los proveedores de login que vas a utilizar.
2. Configura las URLs de redirección si usas magic links u OAuth.
3. Define las políticas RLS para cada tabla.
4. Si usas `user_roles`, garantiza una fila por usuario y consulta el rol desde una función o endpoint confiable.
5. Si agregas claims como `app-role`, `codven` o `name-user`, configura su emisión en el JWT y documenta sus tipos.

La clave pública no reemplaza las políticas RLS. Toda tabla accesible desde la app debe tener políticas explícitas para `authenticated` y, cuando corresponda, `anon`.

## 9. Lista de comprobación

- [ ] `.env` contiene las tres variables y `.env.example` no contiene secretos.
- [ ] Metro fue reiniciado después de cambiar variables.
- [ ] La app puede iniciar sesión y `session.access_token` llega al store.
- [ ] Al cerrar y abrir la app, `getSession()` restaura la sesión esperada.
- [ ] Al renovarse el token, Axios usa el nuevo valor.
- [ ] El logout limpia Supabase, Zustand y la navegación.
- [ ] Una petición protegida incluye `Authorization: Bearer <token>`.
- [ ] Un `401` se maneja según la política de la app.
- [ ] Las tablas de Supabase tienen RLS activo y probado.
- [ ] Web, iOS y Android fueron probados por separado.

## Archivos de referencia de este proyecto

- `lib/supabase.ts`: cliente y almacenamiento multiplataforma.
- `stores/useAuthStore.ts`: login, OTP, restauración y logout.
- `providers/AuthProvider.tsx`: ciclo de vida de la sesión.
- `lib/axios.ts`: interceptor Bearer.
- `.env.example`: nombres de variables requeridos.