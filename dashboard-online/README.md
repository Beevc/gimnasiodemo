# JavoFit Dashboard — versión online (Supabase + Vercel)

Esta es la Fase 1: tu dashboard de administración, ahora con una base de
datos real detrás en vez de datos que se borraban al recargar la página.
Sigue estos pasos en orden. Ninguno requiere saber programar.

## 1. Crear tu proyecto en Supabase (5-10 min)

1. Ve a https://supabase.com y crea una cuenta gratis (puedes usar tu cuenta de Google).
2. Click en "New Project". Ponle un nombre (ej. `javofit`) y una contraseña de base de datos (guárdala, la puedes necesitar después).
3. Espera 1-2 minutos mientras Supabase crea el proyecto.
4. En el menú lateral, ve a **SQL Editor** → **New query**.
5. Abre el archivo `schema.sql` que te entregué, copia TODO su contenido, pégalo ahí y dale **Run**.
   - Esto crea las tablas: `clientes`, `pagos`, `medidas`, `prs`, `asistencias`, `planes`, `staff`, `ejercicios`, `rutinas`.
   - También deja cargados los 6 planes de tu gimnasio y 2 clientes de ejemplo (los puedes borrar después desde el dashboard).
6. Ve a **Settings** (ícono de tuerca) → **API**. Ahí vas a ver dos datos que necesitas:
   - **Project URL**
   - **anon public key**

## 2. Configurar el proyecto con tus datos (2 min)

1. Abre el archivo `js/config.js`.
2. Reemplaza:
   ```js
   const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   const SUPABASE_ANON_KEY = "TU-ANON-KEY-AQUI";
   ```
   con los valores reales que copiaste en el paso anterior.
3. Guarda el archivo.

## 3. Crear tu primer usuario de staff (para poder iniciar sesión)

1. En Supabase, ve a **Authentication** → **Users** → **Add user** → **Create new user**.
2. Ingresa tu correo y una contraseña. Marca "Auto Confirm User" para no tener que verificar el correo.
3. (Opcional pero recomendado) Ve a **SQL Editor** y corre esto para vincular ese usuario a la tabla `staff` y que aparezca en la sección "Personal" del dashboard:
   ```sql
   insert into staff (auth_user_id, nombre, rol, permisos)
   values (
     (select id from auth.users where email = 'tu-correo@ejemplo.com'),
     'Tu Nombre',
     'Super Admin',
     array['Pagos','Asistencias','Clientes','Finanzas']
   );
   ```
   Repite este paso (Authentication → Add user) por cada entrenador/staff que necesite acceso.

## 4. Probar que funciona localmente (opcional pero recomendado)

Antes de subirlo a internet, puedes probarlo en tu computador:

1. Abre una terminal en la carpeta `dashboard-online`.
2. Corre: `python3 -m http.server 8080` (o cualquier servidor local; no sirve abrir el `index.html` con doble clic porque los navegadores bloquean algunas cosas si no hay servidor).
3. Abre `http://localhost:8080` en tu navegador.
4. Inicia sesión con el correo/contraseña que creaste en el paso 3.

Si ves el dashboard cargando tus clientes de ejemplo, ¡ya está conectado a la base de datos real!

## 5. Subir a internet con GitHub + Vercel (10-15 min)

1. Crea una cuenta gratis en https://github.com si no tienes una.
2. Crea un repositorio nuevo (puede ser privado) y sube esta carpeta completa (`dashboard-online`) — puedes arrastrar los archivos directamente desde la web de GitHub con "Add file" → "Upload files", no necesitas usar comandos.
3. Crea una cuenta gratis en https://vercel.com (te recomiendo entrar con "Continue with GitHub" para que quede todo conectado).
4. En Vercel, click "Add New..." → "Project" → selecciona el repositorio que acabas de subir.
5. Como es un sitio estático (sin build), deja la configuración por defecto y dale "Deploy".
6. En 1-2 minutos Vercel te da una URL pública (algo como `javofit-dashboard.vercel.app`). Esa es la dirección que va a usar tu equipo día a día.
7. Cada vez que subas cambios nuevos a GitHub, Vercel actualiza la web automáticamente sola.

## Qué quedó funcionando

- Login de staff (Supabase Auth) — nadie ve datos sin iniciar sesión.
- Clientes: crear, editar, eliminar, filtrar — todo persistido en la base de datos real.
- **Importación masiva por CSV** (botón "Importar CSV" en Gestión de Clientes): descarga una plantilla, llénala en Excel/Google Sheets, súbela y carga cientos de clientes de una sola vez. Ideal para migrar tu lista completa de una.
- Historial de pagos, medidas antropométricas y PRs por cliente — editables, con base de datos real.
- Renovaciones de plan (actualiza vencimiento, racha y registra el pago).
- Asistencia diaria y mensual — cada marca queda guardada en la tabla `asistencias`, lista para conectarse al QR más adelante.
- Modo TV / Leaderboard y Ruleta de premios — funcionan igual que antes, ahora con datos reales.
- Multi-dispositivo: cualquier computador o celular con la URL y su login puede entrar al mismo panel, al mismo tiempo, viendo los mismos datos.

## Qué falta / limitaciones conocidas de esta primera versión

- El "Rachas Reseteadas" en Finanzas es un contador de la sesión actual (se reinicia si recargas la página). Si quieres que quede guardado para siempre, se agrega fácilmente una columna extra — avísame y la sumamos.
- Los gráficos de "Crecimiento Histórico" (ingresos de los últimos 6 meses) y "Distribución de Planes" ahora usan datos REALES calculados desde tus pagos y clientes.
- La sección "Personal & Permisos" muestra el staff pero los permisos específicos por rol (qué puede ver cada entrenador) todavía no están aplicados de verdad — hoy cualquier staff logueado ve todo el dashboard. Se puede restringir por rol si te interesa.
- El envío automático de mensajes de cumpleaños/vencimiento (WhatsApp, correo) no está incluido todavía — hoy solo se muestran las listas.

## Próximas fases (según lo que conversamos)

- **Fase 2 — QR de asistencia:** ya dejé la tabla `asistencias` y un campo `qr_code` único por cliente preparados para esto. Cuando quieras, seguimos con la pantalla de escaneo.
- **Fase 3 — App nativa Android + Play Store:** ya tienes el backend (Supabase) listo para que la futura app converse con los mismos datos. Ver la sección "App nativa" que te mandé en el chat para los pasos y tiempos reales de esa parte.
