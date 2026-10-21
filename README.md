# SGE Despacho

App Expo SDK 58 / React Native para preparar órdenes de despacho en una secuencia
obligatoria. Interfaz móvil en español, con acentos naranjas, tarjetas y progreso
por unidad. Compatible con Android, iOS y web.

## Ejecutar

```bash
npm install
npm start
# O vista web:
npm run web
```

La demo no necesita variables de entorno, Supabase, login ni un servidor.
La [guía de autenticación](./docs/REPLICAR-SUPABASE-AUTH-AXIOS.md) queda como
referencia para la futura integración real.

Para conectar el backend real, define `EXPO_PUBLIC_API_URL` y reinicia Expo:

```env
EXPO_PUBLIC_API_URL=https://tu-api.example.com/api
```

El endpoint `GET /ordenes-despacho` puede devolver `{ orders }` con el modelo de
la app o `{ cbpredes, mvpredes }` con las filas de las tablas. En el segundo caso
se usa `prednum` como despacho, `itemnum` como línea, `codbarra` antes que
`refbarra`, `codalma` como ubicación y `manjser`/`serial1` para determinar si se
requieren seriales. La descripción usa `nombre`, `descripcion` o `codart`; la
cantidad usa `cantidad`, `cantped` o `1` como último respaldo.

## Flujo

1. Selecciona una orden. Puedes buscar por número, cliente o dirección.
2. Escanea el código de barras del **artículo actual**.
3. El endpoint de validación devuelve `valid: true` y `serial: true | false`.
   Un código incorrecto devuelve un error; **no** se interpreta como `serial: false`.
4. Si `serial: true`, registra un serial válido y distinto por cada unidad.
   Los seriales del mismo artículo pueden capturarse en cualquier orden.
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

**Persistencia de la demo:** el servidor simulado vive en memoria. El avance se
conserva al navegar entre pantallas, pero se reinicia al recargar o cerrar la app.
No es un sistema de despacho de producción ni un modo offline persistente.

## API simulada

[El servicio Axios](./src/services/dispatch-api.ts) utiliza un adaptador local con
400 ms de latencia. **No hace peticiones HTTP reales.** El documento adjunto no
definía endpoints de despacho; este es el contrato de prueba propuesto:

| Método | Endpoint                          | Cuerpo                      | Respuesta                                 |
| ------ | --------------------------------- | --------------------------- | ----------------------------------------- |
| GET    | `/ordenes-despacho`               | —                           | `{ orders: DispatchOrder[] }`             |
| GET    | `/ordenes-despacho/:id`           | —                           | `{ order: DispatchOrder }`                |
| POST   | `/check-codigo-barra`             | `{ orderId, itemId, code }` | `{ valid: true, serial: boolean, order }` |
| POST   | `/check-serial`                   | `{ orderId, itemId, code }` | `{ valid: true, order }`                  |
| POST   | `/ordenes-despacho/:id/confirmar` | —                           | `{ order }`                               |

Errores: `400` para peticiones incompletas, `404` para órdenes/rutas desconocidas,
`409` para saltos de secuencia, duplicados o confirmaciones prematuras, `422` para
códigos o seriales incorrectos. El cuerpo de error es `{ message: string }`.

Las respuestas incluyen el estado actualizado y los seriales capturados, pero no
la lista de seriales esperados. Los valores sugeridos para probar pertenecen
exclusivamente a los fixtures demo.

Para integrar el backend, reemplaza el adaptador con la URL real y el interceptor
de sesión del documento adjunto; retira los controles y fixtures demo. El backend
real debe conservar las validaciones transaccionales de secuencia, cantidades,
duplicados y confirmación. Las validaciones no pueden depender solo de la UI.

## Validación

```bash
npm run lint
npx tsc --noEmit
npm test
```

Las pruebas de dominio y del adaptador Axios usan el runner nativo de Node
(Node 22.18+ o 24 recomendado), sin dependencias de testing adicionales.
La carpeta `example/` es el starter archivado y no forma parte de la app ni del
typecheck.
