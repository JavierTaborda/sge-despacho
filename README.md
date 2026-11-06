# SGE Despacho

App Expo SDK 58 / React Native para preparar órdenes de despacho en una secuencia
obligatoria. Interfaz móvil en español, con un tema centralizado, tarjetas y progreso
por unidad. Compatible con Android, iOS y web.

## Ejecutar

```bash
npm ci
# Copia .env.example a .env y configura los tres valores públicos.
npm start
# O vista web:
npm run web
```

Se requiere una cuenta existente de Supabase con acceso por correo/contraseña.
La app no registra usuarios ni incluye cuentas de prueba. Configura
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` y
`EXPO_PUBLIC_API_URL` según [`.env.example`](./.env.example). Reinicia Expo al
cambiar variables. En producción usa HTTPS; HTTP local se permite en desarrollo.

## Arquitectura y sesión

- `src/app/`: rutas finas; `/` y `/despacho/[id]` mantienen sus URLs, ahora
  protegidas con `Stack.Protected`. `/login` solo está disponible sin sesión.
- `src/features/auth/`: pantalla de login y control **Cerrar sesión**, accesible
  en la cabecera de la lista móvil. Reutiliza el tema y los componentes compartidos.
- `src/features/despacho/`: pantallas, hook de lista y servicios de despacho.
  Los contratos y validadores existentes siguen en `domain/` y
  `services/backend-dispatch.ts`; no se duplican por estética.
- `src/stores/useAuthStore.ts` y `auth-state.ts`: Zustand conserva sesión,
  token, `userId`, carga de restauración y operaciones login/logout.
  No se persiste un segundo JWT con Zustand.
- `src/providers/AuthProvider.tsx`: una sola instancia en el layout raíz.
  Espera la restauración antes de montar navegación, sincroniza eventos como
  `TOKEN_REFRESHED` y controla auto-refresh móvil según `AppState`, con limpieza.
- `src/lib/supabase.ts`: cliente único. Conserva AES-CTR + SecureStore +
  AsyncStorage en móvil y `localStorage` en web, sin migrar claves ni formato.
- `src/lib/axios.ts`: cliente REST único. Cada petición lee el token vigente del
  store; tras logout elimina Authorization. Los servicios no crean clientes
  propios en producción.

Los errores de configuración, restauración, login y logout son visibles.
Un logout fallido no simula éxito. Salir o cambiar de usuario borra las capturas
en memoria y remonta las pantallas; respuestas pendientes de otra sesión no
pueden repoblar la caché. Renovar el token del mismo usuario conserva el avance.

Las variables `EXPO_PUBLIC_*` son visibles en el bundle. Nunca uses una clave
`service_role`. RLS y la API deben validar identidad, permisos y escrituras;
los guards y el cifrado local no son autorización de backend. No se decodifican
JWTs para conceder permisos. Detalles en la
[guía de implementación](./docs/REPLICAR-SUPABASE-AUTH-AXIOS.md).

## Lógica de la lista de órdenes

[La pantalla de inicio](./src/app/index.tsx) muestra la interfaz y consume
[el hook `useDispatchOrders`](./src/features/despacho/hooks/use-dispatch-orders.ts):

1. Al entrar o volver a la pantalla, carga las órdenes desde el servicio.
   `loadOrders()` permite recargarlas al deslizar o reintentar.
2. Expone `loading` y `error` para mostrar la carga y los errores. Un contador
   evita que respuestas antiguas o recibidas después de salir cambien el estado.
3. `search` / `setSearch` y `filter` / `setFilter` controlan la búsqueda por
   despacho, pedido, cliente, zona o vendedor y las pestañas de en despacho/finalizadas.
   `visibleOrders` contiene el resultado que muestra la lista.
4. `orders` y `visibleOrders` conservan directamente el tipo `BackendDispatchOrder`
   de la respuesta. No se requieren `id`, `customer`, `items` ni `{ orders }`.
   `pending` y `completed` se calculan exclusivamente desde `conformado`.
   `dispatchQuantity` suma `cantdesp` de las órdenes en despacho y se presenta como
   **Cantidad en despacho**, no como unidades pendientes de escaneo.
5. Las tarjetas muestran `prednum`, `pednum`, `Cliente`, `co_cli`, `Zona`,
   `Vendedor`, `cantdesp`, `fecdesp`, `conformado` y `owneruser`; también duración,
   supervisor y fecha de finalización cuando corresponden. Si el nombre del
   cliente, zona o vendedor es `null`, se presenta su código.
   La lista no inventa cantidades por artículo ni progreso: se consultan en el detalle.

## Estilos con NativeWind

NativeWind 4.2.7 (versión estable) usa Tailwind CSS 3. La configuración de
[Tailwind](./tailwind.config.ts) detecta clases en `src/`, y
[el layout raíz](./src/app/_layout.tsx) importa [los estilos globales](./global.css).
La lista de órdenes, el detalle de despacho y los componentes compartidos usan
`className` en los componentes de React Native:

```tsx
<View className="flex-1 items-center justify-center bg-background">
  <Text className="text-[18px] font-bold text-primary">SGE Despacho</Text>
</View>
```

### Cambiar el tema

Edita [la paleta central](./src/constants/theme.ts), como antes. Tailwind importa
esos mismos valores: `bg-primary`, `text-primary-dark`, `bg-primary-light`,
`text-secondary`, `bg-secondary-light`, `text-danger`, `bg-danger-light`,
`bg-background`, `bg-surface`, `text-ink`, `text-muted` y `border-line`.
Los iconos, indicadores de carga y controles nativos siguen usando `colors`
desde ese archivo, sin duplicar valores.

La estrategia de NativeWind es `darkMode: "class"` para permitir la carga
asíncrona del CSS en web. Se conserva la paleta actual; no se añade modo oscuro.

El ancho máximo compartido usa `max-w-content` (680 px). Metro configura
`inlineRem: 16` para que el espaciado en clases como `p-4` sea de 16 px tanto
en móvil como en web. Los tamaños de texto explícitos conservan la tipografía
anterior. Los estilos nativos quedan limitados al ancho dinámico del progreso,
las sombras `boxShadow` y los números tabulares. Las sombras y la tipografía
numérica se centralizan en el mismo tema para preservar su aspecto con
NativeWind 4.

Después de cambiar el tema, Babel o Metro, reinicia el servidor limpiando la caché:

```bash
npx expo start --clear
```

## Backend

El backend real requiere `EXPO_PUBLIC_API_URL` y recibe
`Authorization: Bearer <access_token>` desde el cliente compartido.
Sin URL válida, la petición falla explícitamente antes del transporte:
no existe fallback demo en la app.

También se acepta una URL que termine en `/api` o `/api/`: el cliente evita
duplicar ese segmento. No incluyas `/dispatch/orders`, parámetros ni fragmentos
en la URL base.

[Los DTOs y el mapeo del backend](./src/services/backend-dispatch.ts) implementan
el contrato de consulta compartido:

| Método | Endpoint                                      | Respuesta directa, sin envoltorio     |
| ------ | --------------------------------------------- | ------------------------------------- |
| GET    | `/api/dispatch/orders`                        | `BackendDispatchOrder[]`              |
| GET    | `/api/dispatch/orders/:prednum/:pednum`       | `BackendDispatchOrder`                |
| GET    | `/api/dispatch/orders/:prednum/:pednum/items` | `BackendDispatchItem[]`               |
| GET    | `/api/dispatch/list`                          | `string[]` de códigos sin serial      |
| POST   | `/api/dispatch/orders/predispatch`            | Envía cabecera y artículos capturados |

- La primera pantalla hace una sola consulta `GET /api/dispatch/orders` y recibe
  un array plano con el tipo exacto de la API. Al abrir el detalle se consultan
  en paralelo la cabecera, los artículos y la lista de códigos sin serial.
- La identidad es **`prednum` + `pednum`**, no solo `prednum`. La ruta de la app
  usa, por ejemplo, `/despacho/6242-19665`; la UI muestra por separado el despacho
  y el pedido. La búsqueda admite ambos números.
- `conformado: "Finalizado"` determina el estado final, aunque `fecfinal` y
  `fecfinalStr` sean `null`. `"En despacho"` permanece en las órdenes abiertas.
  Las fechas no sustituyen ese estado.
- `Cliente`, `Zona` y `Vendedor` se muestran con sus códigos como alternativa
  cuando son `null`. `owneruser` y `recouser` conservan sus valores de texto.
- El contrato no incluye una cantidad por artículo: **cada fila es una unidad**.
  Se conserva exactamente el orden del array recibido; no se agrupan ni reordenan
  productos repetidos. `itemnum` identifica cada fila dentro de su despacho/pedido.
- `refbarra` es la referencia esperada; `codbarra` es la captura existente, no un
  reemplazo de la referencia. `serial1` restaura el serial capturado.
  `lectura: "Sin serial"` por sí sola no prueba que la unidad haya sido capturada.
- `cantdesp` se presenta como cantidad de despacho en la tarjeta de la lista,
  sin inferir un conteo de artículos ni progreso que el endpoint no proporciona.
- Se validan los tipos del contrato y la pertenencia de las filas a la pareja
  solicitada. Respuestas incorrectas o duplicadas muestran un error explícito,
  en lugar de convertirse silenciosamente en listas vacías.

### Artículos del despacho

`getDispatchOrderItems("6242-19665")`, en
[el servicio](./src/features/despacho/services/dispatch-api.ts), consulta
`GET /api/dispatch/orders/6242/19665/items` con `Accept: application/json`.
Devuelve directamente `BackendDispatchItem[]`, sin `{ items }` ni `{ data }`.

El detalle utiliza esta consulta junto con la cabecera. La descripción viene de
`Articulo` (con `artdes`/`codart` como alternativa), la ubicación de `codalma` y el
código esperado de `refbarra`. Cada fila conserva `itemnum`, `rennum`, los valores
numéricos de `compuesto`, el usuario textual `recouser`, `supervisor`, `horacapture`
y los indicadores `changed`, `selected`, `objectstate`, `objecticon`, `lectura` y
`objectstate2`.

La pantalla muestra la referencia, almacén, renglón y capturas existentes.
La pertenencia de `refbarra` a `/api/dispatch/list` determina si se pide serial:
si está en la lista no se pide; si no está, sí. `manjser` no controla el flujo
de escaneo del serial. `lectura: "Sin serial"` por sí sola no marca la unidad
como capturada.
`codbarra` y `serial1` no se usan como referencia:
son valores capturados que se conservan cuando vienen informados. Los textos
`"string"` de un ejemplo Swagger no se sustituyen ni se interpretan como `null`;
el backend debe enviar `null` para campos sin captura.

### Captura local con el backend real

Al configurar `EXPO_PUBLIC_API_URL`, la app consulta los datos reales y permite
**capturarlos localmente** hasta pulsar el envío del predespacho:

- Se debe escanear primero el código de barras, que se compara con `refbarra`.
  Si `refbarra` no está en `/api/dispatch/list`, se solicita un serial para esa fila. Un `codbarra`
  recibido del backend no autoriza por sí solo un nuevo intento de serial.
- El lector tipo teclado debe enviar **Enter** para capturar; también se puede
  usar el botón de validación. La cámara es opcional: se abre para leer un código
  y se cierra después de cada lectura, para no capturar el código de barras como
  serial mientras sigue apuntando al mismo artículo.
- Una captura válida llena `codbarra` o `serial1` y `horacapture` en el borrador
  del detalle. Los seriales se recortan y convierten a mayúsculas.
  Se respetan la secuencia del array y un código de barras por unidad
  capturada. Se rechazan valores vacíos y seriales duplicados dentro de la
  misma orden de predespacho, incluidos los capturados previamente por la API
  y los de otros artículos de esa orden. Un serial sí puede usarse en otra orden.
  Si se rechaza un serial, se reintenta solo el serial sin repetir el código de barras.
- Los borradores permanecen en memoria al volver a una orden durante la sesión.
  **Se pierden al recargar/cerrar la app, salir o cambiar de usuario**;
  no hay almacenamiento persistente de capturas.
  `getDispatchOrderItems` sigue devolviendo la respuesta del servidor, mientras
  `getDispatchOrder` devuelve el detalle con su borrador local si ya está cargado.
- La pantalla avisa que las capturas no se han enviado. La lista conserva el
  estado del servidor y no presenta el borrador como un despacho finalizado.
  Las órdenes finalizadas no admiten escaneo; si no hay ítems, no se puede confirmar.

El serial se comprueba localmente, no contra un endpoint de validación.
Tras completar todas las filas, **Enviar predespacho** hace
`POST /api/dispatch/orders/predispatch` con los DTOs existentes. Los errores
del servidor se muestran; no se simula éxito ni se marca la orden finalizada.
`completeDispatch` continúa bloqueado porque no existe endpoint de finalización.

## Flujo

1. Inicia sesión y selecciona una orden. Puedes buscar por número, cliente o zona.
2. Escanea el código de barras del **artículo actual**.
3. La validación local devuelve `valid: true` y `serial: true | false`.
   Un código incorrecto devuelve un error; **no** se interpreta como `serial: false`.
4. Si `serial: true`, escanea **código de barras → serial para cada unidad**.
   Después de cada serial válido se vuelve a pedir el código de barras, aunque siga
   siendo el mismo producto. Los seriales del artículo pueden capturarse en
   cualquier orden, pero cada uno requiere su propio escaneo previo del código.
   Un serial rechazado, vacío o repetido conserva la validación del código:
   reintenta solo el serial, sin volver a escanear el código de barras.
5. Si `serial: false`, una validación del código completa la cantidad de esa línea.
6. Al completar la línea se habilita el siguiente artículo, nunca antes.
7. Solo después de verificar todo puedes enviar el predespacho al backend.
   La lista sigue reflejando el estado que devuelve el servidor.

La pistola debe funcionar como teclado USB/Bluetooth (HID), con terminador Enter.
Toca el campo de código para darle foco y escanea. También puedes escribir y
validar manualmente. La app conserva el foco después de cada captura desde el
lector. La cámara opcional solicita permisos solo cuando se utiliza.

El backend debe volver a validar secuencia, cantidades, duplicados y permisos
al recibir el predespacho. Las validaciones no pueden depender solo de la UI.

## Validación

```bash
npm run lint
npx tsc --noEmit
npm test
```

Las pruebas de dominio, mapeo y clientes Axios usan el runner nativo de Node
(Node 22.18+ o 24 recomendado), sin dependencias de testing adicionales.
La integración HTTP se prueba con un servidor local: rutas exactas, URL con/sin
`/api`, carga separada y envío del predespacho. Los tests de auth usan Zustand
vanilla y puertos inyectados: restauración, carreras con eventos, renovación,
limpieza AppState, errores, Bearer vigente y caché aislada. No cargan RN/Supabase
en Node ni requieren credenciales. `createDispatchClient(url, adapter?)` se
mantiene como seam compatible en `src/services/dispatch-api.ts`; producción
inyecta únicamente `src/lib/axios.ts` en `createDispatchService`.

Fallo de baseline conocido: `tests/theme.test.ts` exige `text-[35px]`, que no
está en las pantallas actuales. No corresponde al flujo de autenticación.
La carpeta `example/` es el starter archivado y no forma parte de la app ni del
typecheck.
