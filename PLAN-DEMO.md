# 🗺️ Plan para convertir esta copia en DEMO de venta

Objetivo: una demo **con datos ficticios**, **sin Supabase ni login**, que
funcione en cualquier lado, que el comprador pueda tocar sin romper nada y que
**se resetee al recargar**. El original NO se toca (vive en otra carpeta).

Enfoque recomendado: **reemplazar la capa de datos (Supabase) por un `Api`
simulado en memoria**. `app.js` NO se toca: ya usa `Api.*` para todo, así que si
el `Api` es falso, toda la app funciona igual pero con datos de ejemplo.

---

## Fase 1 — Datos ficticios · crear `js/demo-data.js`
Un archivo con:
- `PLANES` (copiá los del `schema.sql`, **incluí `coach`** con precio 0 y duración 1200).
- `CLIENTES_DEMO`: ~18 clientes inventados, con la MISMA forma que devuelve
  `_mapCliente` en `js/api.js` (campos camelCase: `id, nombre, apellido, correo,
  telefono, genero, cumpleanos, planId, racha_meses, vence, estado, contactado,
  fechaIngreso, asistioHoy, asistenciasMes, salud..., pagos[], medidasHistorial[],
  prsHistorial[]`).

Armá la muestra para que se luzcan TODAS las funciones:
- **Estados variados:** varios "Al día", 1-2 "Pendiente", 2 "Vencido" (uno con
  `contactado:true`, otro `false`), 1 "Congelado".
- **1 Coach** (`planId:'coach'`) para mostrar el plan indefinido.
- **Géneros:** M y F repartidos, y **2 sin género** (para el filtro y el chip).
- **2 sin teléfono** (para el chip y la sección Grupo WhatsApp).
- **Pagos repartidos en los últimos ~6 meses** y con métodos variados
  (Efectivo/Transferencia/Débito/Crédito) → para que Finanzas y la navegación
  mensual muestren datos y comparaciones.
- **Medidas con 2+ registros** en algunos → para que se vea el gráfico de progreso.
- **PRs variados** por ejercicio y género → para los tops del Modo TV.
- **Cumpleaños y fechaIngreso cercanos a hoy** en 2-3 → para los paneles del inicio.

## Fase 2 — Api simulado · crear `js/api-demo.js`
Definí `const Api = { ... }` con TODOS estos métodos, trabajando sobre el array
en memoria (lecturas devuelven copias; escrituras mutan el array → el comprador
ve que "funciona", y al recargar vuelve al estado inicial):

- Sesión: `login()` (acepta cualquier cosa), `logout()` (`location.reload()`),
  `getSession()` → devolvé `{ user:{ email:'demo@javofit.cl' } }` (así entra directo).
- Catálogo/staff: `getPlanes()`, `getStaff()`, `getEventosRacha()`/`registrarEventoRacha()`.
- Clientes: `getClientes()`, `crearCliente()`, `actualizarCliente()`,
  `eliminarCliente()`, `crearClientesBulk()`.
- Pagos: `agregarPago()`, `actualizarPago()`, `eliminarPago()`.
- Medidas: `agregarMedida()`, `actualizarMedida()`, `eliminarMedida()`.
- PRs: `agregarPR()`, `actualizarPR()`, `eliminarPR()`.
- Asistencia: `marcarAsistenciaHoy()`, `desmarcarAsistenciaHoy()`.
- Salud: `getSaludCliente()`, `agregarNutri/Kine()`, `actualizarNutri/Kine()`,
  `eliminarNutri/Kine()`.
- Archivos: `subirArchivo()` (simular, guardar solo el nombre), `urlFirmada()`
  (devolver un PDF de ejemplo o `#`), `eliminarArchivoStorage()` (no-op).

> Tip: abrí `js/api.js` y replicá la MISMA firma de cada método, pero sin red.

## Fase 3 — Cambiar los `<script>` en `index.html`
Al final del archivo, reemplazar:
```html
<script src="js/config.js"></script>
<script src="js/supabaseClient.js"></script>
<script src="js/api.js"></script>
```
por:
```html
<script src="js/demo-data.js"></script>
<script src="js/api-demo.js"></script>
```
(También podés quitar el `<script src="...@supabase/supabase-js@2">` de arriba: la
demo no lo necesita.)

`js/app.js` **queda igual**.

## Fase 4 — Entrar directo (sin login)
No hay que tocar `app.js`: como el `getSession()` demo devuelve una sesión,
`app.js` llama solo a `mostrarApp()` y salta la pantalla de login.

## Fase 5 — Toques de venta (opcional pero recomendado)
- Cartel fijo en el header: **"MODO DEMO · datos de ejemplo"**.
- Botón **"Reiniciar demo"** (que haga `location.reload()`).
- **Marca:** si vas a vender a OTROS gimnasios, conviene una marca neutra
  ("Tu Gimnasio") y **sacar del contrato la razón social real** y los PDF legales
  reales. Decidilo vos; se puede dejar JavoFit como ejemplo también.
- Config TV ya usa localStorage → funciona igual en la demo.

## Fase 6 — Publicar la demo (cuando esté lista)
- **Repo GitHub NUEVO** (ej. `javofit-demo`) — nunca el de producción.
- **Proyecto Vercel NUEVO** → `javofit-demo.vercel.app`.
- Recién ahí: `git init` en esta carpeta y push al repo nuevo.
- (Para mostrarla sin deploy, alcanza con abrir `index.html` en el navegador.)

---

## ✅ Checklist de qué mostrarle al comprador
- Inicio: por vencer, cumpleaños/aniversarios, resumen activos/inactivos, chip de fichas.
- Lista + filtros (estado, **género**, teléfono, vencidos sin contactar).
- Expediente: datos, pagos, **medidas con gráfico**, **PRs con gráfico**, salud, contrato.
- Finanzas: métricas + **detalle mensual navegable** + retención.
- Modo TV: tops por género + **bebidas** + snacks/frappes.
- Grupo WhatsApp: comparador + rellenar teléfonos por nombre.

## Alternativa (si querés que la demo GUARDE cambios de verdad)
En vez de datos en memoria: crear un **Supabase de demo separado** con datos
ficticios sembrados, y poner esa URL/anon key en `js/config.js`. Más realista
(login real, persiste), pero el comprador puede ensuciar los datos y hay que
resembrar. Para vender, casi siempre conviene la versión en memoria (Fases 1-4).
