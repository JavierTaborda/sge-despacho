# Supabase, autenticación y Axios: implementación actual

SGE Despacho es el proyecto destino del patrón modular. Usa Expo SDK 58,
Expo Router, React Native, TypeScript y npm (`package-lock.json`). Alias:
`@/*` apunta a `src/*`. No se añadieron OTP, biometría, roles, signup ni
`jwt-decode`.

## Configuración

Instala el lockfile con `npm ci`. Las dependencias Supabase, Axios, AsyncStorage,
SecureStore, AES y polyfills ya existían; se añadió solo Zustand 5 con:

```bash
EXPO_NO_DOTENV=1 npx expo install zustand
```

Para futuras dependencias usa `npx expo install`, consultando compatibilidad SDK.
No se migró a SQLite ni se modificaron proyectos nativos.

Copia `.env.example` a `.env` y sustituye los placeholders:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
EXPO_PUBLIC_API_URL=https://api.example.com
```

Son valores públicos incluidos en el bundle, no secretos. Nunca uses claves
`service_role` ni credenciales de usuario en el código. Los archivos `.env`
y `.env.local` no deben versionarse. Reinicia Metro al cambiar variables:

```bash
npx expo start --clear
```

En builds configura estas mismas variables en el entorno de despliegue.
La URL API admite `/api` final y prefijos de proxy; se normaliza sin duplicar
`/api`. HTTP local está permitido para desarrollo, HTTPS es necesario en
producción. La app muestra errores explícitos si faltan valores o las URLs
son inválidas, en vez de recurrir a un servidor demo.

## Límites de archivos

```text
src/
  app/                      Rutas finas /, /despacho/[id], /login y layout
  features/
    auth/
      components/           LogoutButton
      screens/              LoginScreen (email/password)
    despacho/
      hooks/                useDispatchOrders
      screens/              OrdersScreen y DispatchScreen existentes
      services/             Servicio producción y lógica inyectable
  lib/                      Supabase y Axios únicos, interceptor HTTP
  stores/                   Store Zustand y factory testable
  providers/                AuthProvider único
  services/                 Ciclo de vida auth y DTOs/mapeo existentes
  domain/                   Reglas y tipos de despacho existentes
  components/               UI compartida, sin duplicar tema
  utils/                    Validadores de configuración
```

No se crearon carpetas vacías ni se movió cada tipo/componente por estética.
`src/services/dispatch-api.ts` conserva las exportaciones puras para los tests
históricos. Las pantallas usan el servicio de producción de la feature.

## Sesión y navegación

1. `lib/supabase.ts` crea a lo sumo un cliente. Si la configuración es inválida,
   exporta el error y no crea un cliente ficticio.
2. `AuthProvider` se monta una vez en `app/_layout.tsx`. Su coordinador
   `services/auth-lifecycle.ts` suscribe `onAuthStateChange` y ejecuta
   `getSession`. Mientras restaura no monta los guards ni las pantallas privadas.
3. `stores/useAuthStore.ts` enlaza la factory `stores/auth-state.ts` con
   Supabase. Sesión, access token y `userId` se actualizan atómicamente.
   `loading` representa restauración; `busy` representa login/logout.
4. Los eventos, incluido `TOKEN_REFRESHED`, actualizan el store. Una revisión
   impide que una restauración tardía sobrescriba un evento más reciente.
   El callback de Supabase no espera llamadas auth, para evitar bloqueos.
5. En móvil el provider inicia/para auto-refresh con el estado inicial de
   `AppState` y sus cambios. Retira listener, suscripción y refresh al desmontar.
   En web Supabase administra visibilidad y renovación; no se añade AppState.
6. `Stack.Protected` restringe `/` y `/despacho/[id]`; solo `/login` está
   disponible sin sesión. No se cambian las URLs mediante grupos innecesarios.
   Login válido abre la lista; logout invalida el historial privado.
7. **Cerrar sesión**, visible en la cabecera móvil de la lista, usa Supabase
   `signOut` con su semántica predeterminada. Un fallo se muestra y no se
   fuerza un éxito local falso. Restauración fallida permite reintentar;
   credenciales inválidas muestran un mensaje en español.

La app necesita cuentas existentes configuradas en Supabase para email/password.
No crea usuarios ni depende de un JWT decodificado para autorizar.

## Persistencia preservada

- Móvil: mismo AES-256-CTR, contador y formato hexadecimal; clave de cifrado en
  SecureStore, ciphertext en AsyncStorage. No cambian las claves de Supabase.
- Web: mismo adaptador `localStorage`, compatible con ausencia de `window`
  durante renderizado en servidor.
- Zustand no usa middleware persist ni duplica el almacenamiento de tokens.
- Los listeners del ciclo de vida ya no se registran como efecto del módulo.
  Auto-refresh móvil se inicia explícitamente desde el provider.

El cifrado local no vuelve confiable una sesión ni sustituye RLS, permisos o
revocación. En web hay riesgos de XSS/localStorage; sigue siendo necesario
mantener dependencias, transporte seguro y controles de backend.

## HTTP y capturas

`lib/axios.ts` crea la única instancia REST de producción. El interceptor
lee `useAuthStore.getState().token` **en cada request** y establece
`Authorization: Bearer <token>` o elimina un header antiguo si no hay sesión.
Los errores HTTP siguen propagándose a la UI; no se ocultan 401 ni se hace
un logout automático por cualquier error de transporte.

`features/despacho/services/dispatch-api.ts` inyecta ese cliente en
`createDispatchService`. Conserva:

- GET `/api/dispatch/orders`.
- GET `/api/dispatch/orders/:prednum/:pednum`.
- GET `/api/dispatch/orders/:prednum/:pednum/items`.
- GET `/api/dispatch/list`.
- POST `/api/dispatch/orders/predispatch`, con cabecera/artículos originales.

Las validaciones y UX de escaneo permanecen. La finalización continúa bloqueada
porque no existe endpoint para ella. No se inventan rutas de captura remota.

El epoch de sesión cambia al salir o cambiar de usuario: limpia inmediatamente
las capturas en memoria y remonta las pantallas. Los detalles pendientes del
epoch anterior se rechazan antes de registrar una orden. Volver a entrar con el
mismo usuario después de logout no recupera sus borradores anteriores.
`TOKEN_REFRESHED` del mismo usuario no borra el avance.

`createDispatchClient(url, adapter?)` conserva normalización, timeout y semántica
de los tests; solo ese seam aislado crea instancias propias. No se usa en
producción. Los módulos puros importan `.ts` explícitamente para el runner Node,
sin arrastrar React Native, alias de Metro o el singleton Supabase.

## Verificación

```bash
node --experimental-strip-types --test tests/auth.test.ts tests/backend-dispatch.test.ts tests/dispatch.test.ts
npm test
EXPO_NO_DOTENV=1 npm run lint
npx tsc --noEmit
```

Las nuevas pruebas cubren restauración, eventos concurrentes, token renovado,
logout y errores, cleanup móvil, ausencia de config y aislamiento de capturas
incluidas respuestas en vuelo. No necesitan credenciales ni un proyecto remoto.
El test de tema `Missing native utility: text-[35px]` ya fallaba antes y queda
fuera del alcance.

Para smoke manual, con un backend de pruebas:

1. Abre `/` y un enlace `/despacho/6242-19665` sin sesión: deben ir a login.
2. Prueba campos vacíos y contraseña incorrecta; verifica el mensaje visible.
3. Inicia sesión y comprueba Bearer en el servidor sin registrar su valor.
4. Recarga: no debe aparecer la lista privada antes de restaurar.
5. Captura una fila, sal y vuelve a entrar (mismo usuario y otro usuario):
   no debe sobrevivir el borrador local.
6. En Android/iOS, pasa la app a background/foreground y verifica refresh y
   persistencia real en el dispositivo.

Los mocks/unit tests no demuestran conexión real, políticas RLS ni autorización
de la API. El backend debe validar firma/expiración del JWT, acceso a cada orden
y todas las escrituras. No se han aplicado migraciones ni conectado proyectos
remotos desde esta implementación.

Documentación consultada: [SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[índice](https://docs.expo.dev/llms.txt),
[auth Router](https://docs.expo.dev/router/advanced/authentication/),
[protected](https://docs.expo.dev/router/advanced/protected/),
[SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/),
[Supabase](https://docs.expo.dev/guides/using-supabase/).
