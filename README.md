# SGE Despacho

App Expo SDK 58 / React Native para preparar órdenes de despacho en una secuencia
obligatoria. Interfaz móvil en español, con un tema centralizado, tarjetas y progreso
por unidad. Compatible con Android, iOS y web.

## Ejecutar

```bash
npm install
npm start
# O vista web:
npm run web
```

## Lógica de la lista de órdenes

[La pantalla de inicio](./src/app/index.tsx) muestra la interfaz y consume
[el hook `useDispatchOrders`](./src/hooks/use-dispatch-orders.ts):

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

La demo no necesita variables de entorno, Supabase, login ni un servidor.
La [guía de autenticación](./docs/REPLICAR-SUPABASE-AUTH-AXIOS.md) queda como
referencia para la futura integración real.

Para conectar el backend real, define `EXPO_PUBLIC_API_URL` y reinicia Expo:

```env
EXPO_PUBLIC_API_URL=https://tu-api.example.com
```

También se acepta una URL que termine en `/api` o `/api/`: el cliente evita
duplicar ese segmento. No incluyas `/dispatch/orders`, parámetros ni fragmentos
en la URL base.

[Los DTOs y el mapeo del backend](./src/services/backend-dispatch.ts) implementan
el contrato de consulta compartido:

| Método | Endpoint | Respuesta directa, sin envoltorio |
| ------ | -------- | -------------------------------- |
| GET | `/api/dispatch/orders` | `BackendDispatchOrder[]` |
| GET | `/api/dispatch/orders/:prednum/:pednum` | `BackendDispatchOrder` |
| GET | `/api/dispatch/orders/:prednum/:pednum/items` | `BackendDispatchItem[]` |

- La primera pantalla hace una sola consulta `GET /api/dispatch/orders` y recibe
  un array plano con el tipo exacto de la API. La demo usa la misma ruta y forma de
  respuesta para la lista. Al abrir el detalle se consultan en paralelo
  la cabecera y los artículos.
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
  reemplazo de la referencia. `manjser` indica si requiere serial y `serial1`
  restaura el serial capturado. `lectura: "Sin serial"` por sí sola no prueba que
  la unidad haya sido capturada.
- `cantdesp` se presenta como cantidad de despacho en la tarjeta de la lista,
  sin inferir un conteo de artículos ni progreso que el endpoint no proporciona.
- Se validan los tipos del contrato y la pertenencia de las filas a la pareja
  solicitada. Respuestas incorrectas o duplicadas muestran un error explícito,
  en lugar de convertirse silenciosamente en listas vacías.

### Artículos del despacho

`getDispatchOrderItems("6242-19665")`, en
[el servicio](./src/services/dispatch-api.ts), consulta
`GET /api/dispatch/orders/6242/19665/items` con `Accept: application/json`.
Devuelve directamente `BackendDispatchItem[]`, sin `{ items }` ni `{ data }`.
La demo también implementa esta ruta con el mismo formato.

El detalle utiliza esta consulta junto con la cabecera. La descripción viene de
`Articulo` (con `artdes`/`codart` como alternativa), la ubicación de `codalma` y el
código esperado de `refbarra`. Cada fila conserva `itemnum`, `rennum`, los valores
numéricos de `compuesto`, el usuario textual `recouser`, `supervisor`, `horacapture`
y los indicadores `changed`, `selected`, `objectstate`, `objecticon`, `lectura` y
`objectstate2`.

La pantalla muestra la referencia, almacén, renglón y capturas existentes.
`manjser` es la fuente de verdad para requerir serial: `lectura: "Sin serial"`
no cambia un `manjser: true`. `codbarra` y `serial1` no se usan como referencia:
son valores capturados que se conservan cuando vienen informados. Los textos
`"string"` de un ejemplo Swagger no se sustituyen ni se interpretan como `null`;
el backend debe enviar `null` para campos sin captura.

### Captura local con el backend real

Al configurar `EXPO_PUBLIC_API_URL`, la app consulta los datos reales y permite
**capturarlos localmente**, sin enviar escrituras al backend:

- Se debe escanear primero el código de barras, que se compara con `refbarra`.
  Si `manjser` es `true`, se solicita un serial para esa fila. Un `codbarra`
  recibido del backend no autoriza por sí solo un nuevo intento de serial.
- El lector tipo teclado debe enviar **Enter** para capturar; también se puede
  usar el botón de validación. La cámara es opcional: se abre para leer un código
  y se cierra después de cada lectura, para no capturar el código de barras como
  serial mientras sigue apuntando al mismo artículo.
- Una captura válida llena `codbarra` o `serial1` y `horacapture` en el borrador
  del detalle. Los seriales se recortan y convierten a mayúsculas, igual que en
  la demo. Se respetan la secuencia del array y un código de barras por intento
  de serial; se rechazan valores vacíos y seriales duplicados en las órdenes
  cargadas durante esta sesión, incluidos los capturados previamente por la API.
- Los borradores permanecen en memoria al volver a una orden durante la sesión.
  **Se pierden al recargar o cerrar la app**; no hay almacenamiento persistente.
  `getDispatchOrderItems` sigue devolviendo la respuesta del servidor, mientras
  `getDispatchOrder` devuelve el detalle con su borrador local si ya está cargado.
- La pantalla avisa que las capturas no se han enviado. La lista conserva el
  estado del servidor y no presenta el borrador como un despacho finalizado.
  Las órdenes finalizadas no admiten escaneo; si no hay ítems, no se puede confirmar.

El contrato recibido no define endpoints de validación, guardado ni confirmación.
El serial se comprueba solo localmente, no contra el backend. La confirmación
permanece bloqueada en el servicio y oculta en la UI; tampoco se muestran códigos
de prueba en modo real. No se utilizan las rutas POST demo contra el backend ni
se simula un guardado exitoso.

Sin `EXPO_PUBLIC_API_URL` se conserva el modo demo con captura y confirmación
locales. Para habilitar escritura real más adelante será necesario definir los
endpoints, sus cuerpos, respuestas y la política de autenticación; no se añaden
tokens ni credenciales de prueba al cliente.

## Flujo

1. Selecciona una orden. Puedes buscar por número, cliente o dirección.
2. Escanea el código de barras del **artículo actual**.
3. El endpoint de validación devuelve `valid: true` y `serial: true | false`.
   Un código incorrecto devuelve un error; **no** se interpreta como `serial: false`.
4. Si `serial: true`, escanea **código de barras → serial para cada unidad**.
   Después de cada serial se vuelve a pedir el código de barras, aunque siga
   siendo el mismo producto. Los seriales del artículo pueden capturarse en
   cualquier orden, pero cada uno requiere su propio escaneo previo del código.
   Un serial incorrecto, vacío o repetido también consume la validación del
   código: vuelve a escanearlo antes de intentar otro serial.
5. Si `serial: false`, una validación del código completa la cantidad de esa línea.
6. Al completar la línea se habilita el siguiente artículo, nunca antes.
7. Solo después de verificar todo puedes confirmar el despacho. Se genera un
   comprobante demo y la orden aparece en **Finalizadas**.

La pistola debe funcionar como teclado USB/Bluetooth (HID), con terminador Enter.
Toca el campo de código para darle foco y escanea. También puedes escribir y
validar manualmente. La app conserva el foco después de cada captura desde el
lector. No se usa la cámara ni se solicitan permisos.

El botón **Usar código de prueba** envía el siguiente código válido al mismo
endpoint y pasa por las mismas validaciones; no salta pasos.

## Datos de prueba

En la orden **OD-1048**:

| Paso | Artículo                  | Código de barras | Cantidad | Seriales válidos                 |
| ---- | ------------------------- | ---------------- | -------- | -------------------------------- |
| 1    | Monitor de signos vitales | `7801234567012`  | 2        | `MSV2200-24081`, `MSV2200-24082` |
| 2    | Sensor de temperatura     | `7801234567029`  | 2        | Sin serial                       |
| 3    | Oxímetro de pulso         | `7801234567050`  | 1        | `OP50-88301`                     |

También hay otras dos órdenes en [los fixtures](./src/data/demo-orders.ts).
Prueba un código del segundo artículo antes de terminar el primero, un serial
repetido o un serial de otro artículo: el flujo debe bloquearlos.

Para las dos unidades del monitor, el orden es `7801234567012` →
`MSV2200-24081` → `7801234567012` → `MSV2200-24082`. Escanear el segundo
serial sin volver a validar el código de barras debe rechazarse.

**Persistencia de la demo:** el servidor simulado vive en memoria. El avance se
conserva al navegar entre pantallas, pero se reinicia al recargar o cerrar la app.
No es un sistema de despacho de producción ni un modo offline persistente.

## API simulada

[El servicio Axios](./src/services/dispatch-api.ts), **sin una URL de backend**,
utiliza un adaptador local con 400 ms de latencia. **En este modo no hace
peticiones HTTP reales.** El documento adjunto no
definía endpoints de despacho; este es el contrato de prueba propuesto:

| Método | Endpoint                          | Cuerpo                      | Respuesta                                 |
| ------ | --------------------------------- | --------------------------- | ----------------------------------------- |
| GET    | `/api/dispatch/orders`            | —                           | `BackendDispatchOrder[]`                  |
| GET    | `/ordenes-despacho/:id`           | —                           | `{ order: DispatchOrder }`                |
| POST   | `/check-codigo-barra`             | `{ orderId, itemId, code }` | `{ valid: true, serial: boolean, order }` |
| POST   | `/check-serial`                   | `{ orderId, itemId, code }` | `{ valid: true, order }`                  |
| POST   | `/ordenes-despacho/:id/confirmar` | —                           | `{ order }`                               |

Errores: `400` para peticiones incompletas, `404` para órdenes/rutas desconocidas,
`409` para saltos de secuencia, duplicados o confirmaciones prematuras, `422` para
códigos o seriales incorrectos. El cuerpo de error es
`{ message: string, order?: DispatchOrder }`. Los rechazos de escaneo incluyen
la orden actualizada para sincronizar la pantalla.

En artículos con serial, `barcodeChecked` significa que hay una validación
pendiente para **un solo intento de serial**. Cada intento la consume, sea
válido o rechazado. La finalización de esa línea depende de sus seriales
capturados, no de mantener ese indicador activo. Revalidar el mismo código
correcto renueva la autorización sin acumular permisos ni aumentar el progreso;
un código incorrecto la revoca.

Las respuestas incluyen el estado actualizado y los seriales capturados, pero no
la lista de seriales esperados. Los valores sugeridos para probar pertenecen
exclusivamente a los fixtures demo.

Excepto `GET /api/dispatch/orders`, compartido con el contrato real, los endpoints
anteriores son exclusivos de la demo y no se envían al backend. Para habilitar escritura real, define el
contrato de captura/confirmación y el interceptor de sesión si la API lo requiere.
El backend real debe conservar las validaciones transaccionales de secuencia, cantidades,
duplicados y confirmación, y consumir la autorización del código antes de
validar cada serial. También debe devolver la orden actualizada en los rechazos
de escaneo. Las validaciones no pueden depender solo de la UI.

## Validación

```bash
npm run lint
npx tsc --noEmit
npm test
```

Las pruebas de dominio, mapeo y clientes Axios usan el runner nativo de Node
(Node 22.18+ o 24 recomendado), sin dependencias de testing adicionales.
La integración HTTP se prueba con un servidor local: rutas exactas, URL con/sin
`/api`, carga separada de artículos y bloqueo de escrituras sin peticiones POST.
La carpeta `example/` es el starter archivado y no forma parte de la app ni del
typecheck.
