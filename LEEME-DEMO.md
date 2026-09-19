# 🧪 JavoFit — COPIA DEMO (para vender)

Esta es una **copia independiente** del dashboard, para armar una **demo de venta**
sin tocar el original.

- **Original (producción, datos reales):** `F:\dashboard javofit\dashboard-online`
  → NO se modifica desde acá. Sigue en su repo GitHub y en https://javofit-dashboard.vercel.app
- **Esta copia (demo):** `F:\dashboard javofit DEMO\dashboard-online`
  → Acá se modifica todo libremente. **No tiene `.git`**, así que es imposible
  pushear por error al repo/Vercel de producción.

## ⚠️ IMPORTANTE antes de publicar la demo
El archivo `js/config.js` de esta copia **todavía apunta a la base de datos REAL**
(la misma anon key). Si la desplegás así, la demo mostraría datos reales (tras login).

**Antes de deployar la demo hay que hacer UNA de estas dos:**
1. **Datos falsos embebidos (recomendado):** reemplazar la capa de datos para que
   use clientes ficticios en memoria (sin Supabase, sin login). Es lo mejor para
   vender: funciona siempre, el comprador toca todo sin romper nada, y se resetea
   recargando.
2. **Supabase de demo separado:** crear OTRO proyecto Supabase con datos ficticios
   y poner esa URL/anon key en `config.js`.

## Cómo seguir en el OTRO chat de Claude
1. Abrí una **nueva sesión de Claude Code** apuntando a la carpeta:
   `F:\dashboard javofit DEMO`
2. Primer pedido sugerido al asistente:
   > "Esta es la copia DEMO de JavoFit. Quiero convertirla en una demo con datos
   > ficticios (sin Supabase ni login) para mostrar a compradores. El original no
   > se toca. Empecemos por reemplazar la capa de datos por clientes de ejemplo."

## Si más adelante querés que la demo tenga su propia web
- Crear un **repo GitHub NUEVO** (ej. `javofit-demo`) — nunca el de producción.
- Crear un **proyecto Vercel NUEVO** → URL tipo `javofit-demo.vercel.app`.
- Recién ahí `git init` en esta carpeta y push al repo nuevo.

## Estado del proyecto (referencia)
Es idéntico al original al momento de copiar: incluye el listado de clientes,
expediente, medidas, PRs, finanzas con detalle mensual navegable, Modo TV con
bebidas, sección Grupo WhatsApp, seguridad (RLS + signed URLs), etc.
