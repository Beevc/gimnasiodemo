# JavoFit — Contexto para continuar la app en Claude Code

Este documento resume todo lo que se decidió y se construyó en la sesión
anterior (en Cowork), para que puedas pegárselo a Claude Code como primer
mensaje y no tengas que explicar el proyecto desde cero.

## El negocio

Gimnasio JavoFit. El dueño (Matías) administra clientes, pagos, asistencia,
rachas de constancia y premios (ruleta de fin de mes). Ya existe una app
llamada "JavoFit" publicada en Google Play y App Store, pero no se tiene el
código fuente original (hay que pedírselo al desarrollador anterior) — se
decidió construir una app nueva desde cero, conectada al mismo backend que
el dashboard web.

**Nota:** el HTML del dashboard trae textos "PowerGym" como marca de
ejemplo/placeholder del archivo original que subió el dueño. Hay que
reemplazarlos por "JavoFit" en todos lados (o preguntarle al dueño si el
nombre comercial real es otro).

## Lo que ya existe (Fase 1 — dashboard de administración web)

Carpeta `dashboard-online/` (junto a este archivo):

- `index.html` + `js/app.js` + `js/api.js` + `js/supabaseClient.js` + `js/config.js`: dashboard admin funcional, con login de staff (Supabase Auth), gestión de clientes, pagos, medidas, PRs, asistencia diaria/mensual, renovaciones, ruleta de premios, modo TV leaderboard.
- `schema.sql`: esquema completo de Supabase (Postgres) con RLS. Tablas: `clientes`, `planes`, `pagos`, `medidas`, `prs`, `asistencias`, `staff`, `ejercicios`, `rutinas`, `rutina_ejercicios`.
- `README.md`: pasos para crear el proyecto de Supabase, cargar el schema, crear el primer usuario staff, y desplegar en Vercel.

**Importante:** el dueño todavía no ha creado su proyecto real de Supabase
(o puede que ya lo haya hecho — pregúntale primero). Sin eso, `js/config.js`
tiene valores de placeholder y nada funciona de verdad todavía.

### Detalles de diseño del esquema que la app nueva debe respetar

- `clientes.qr_code`: token único (texto) generado automáticamente por cliente — pensado exactamente para el QR de entrada. Ya existe, no hay que agregarlo.
- `asistencias`: una fila por check-in real (fecha + hora + método: `manual` o `qr`). Tiene un índice único `(cliente_id, fecha)` para evitar duplicados el mismo día.
- `ejercicios` y `rutinas` / `rutina_ejercicios`: ya están creadas pero vacías — la app nueva es quien las va a poblar y usar.
- RLS activado: hoy SOLO usuarios autenticados como staff pueden leer/escribir. **Los clientes finales todavía NO tienen su propio sistema de login ni políticas RLS** — hay que diseñarlo antes de que la app de clientes pueda leer sus propios datos. Opción recomendada: agregar una columna `auth_user_id` a `clientes` (igual que ya tiene `staff`), crear cuentas de Supabase Auth para cada cliente, y agregar políticas RLS tipo `auth.uid() = auth_user_id` para que cada cliente solo vea su propio expediente.

## Roadmap pedido por el dueño (en orden de prioridad que él definió)

1. ~~Dashboard admin online con base de datos real~~ — HECHO (Fase 1, arriba).
2. QR de entrada / control de asistencia.
3. App para Android (Play Store) y iOS (App Store) — el dueño YA tiene cuentas de desarrollador propias verificadas en ambas tiendas.
4. Biblioteca de ejercicios dentro de la app.
5. Rutinas asignadas por cliente, visibles en la app.
6. Todo esto viéndose reflejado en el dashboard de admin (ya construido).

## Recomendación técnica: Flutter

- Un solo código fuente sirve para Android e iOS.
- El dueño usa Windows y no tiene Mac. Xcode (obligatorio para compilar iOS) solo corre en macOS, sin excepción. La solución estándar es compilar el iOS build en un servicio en la nube — **Codemagic** es la opción más simple y con buen soporte para Flutter (tiene plan gratis para empezar). Alternativa: Expo EAS Build, pero esa es para React Native, no Flutter.
- Paquete oficial `supabase_flutter` para conectarse exactamente al mismo proyecto de Supabase que ya usa el dashboard web — un solo backend para las dos superficies.
- Para el QR: `mobile_scanner` (leer QR con la cámara) y `qr_flutter` (generar el QR de cada cliente, si se decide mostrarlo en vez de escanear un QR fijo del gimnasio).

## Cómo arrancar en Claude Code

1. Instalar Claude Code en Windows (PowerShell, sin ser administrador):
   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```
2. Confirmar que la cuenta de Claude tiene plan Pro, Max, Team o Enterprise (el plan gratis de claude.ai no incluye Claude Code).
3. Crear una carpeta para el proyecto nuevo de la app, por ejemplo junto a esta:
   `E:\dashboard javofit\javofit-app`
4. Abrir una terminal ahí y ejecutar `claude`.
5. Iniciar sesión (se abre el navegador).
6. Copiar este archivo (`CONTEXTO-APP-CLAUDE-CODE.md`) dentro de esa carpeta nueva y decirle a Claude Code: "Lee CONTEXTO-APP-CLAUDE-CODE.md antes de empezar, y arma el proyecto Flutter para la app de clientes de JavoFit."

## Decisiones pendientes que el dueño debe confirmar antes de programar

- **Bundle ID (iOS) / Package name (Android) de la app JavoFit ya publicada.** Esto es crítico: si la app nueva no usa el mismo identificador que la ya publicada, las tiendas la tratan como una app totalmente distinta — se pierden las reseñas, el historial y los usuarios no reciben la app nueva como "actualización", tendrían que reinstalarla a mano. El dueño puede ver estos datos en App Store Connect y Google Play Console aunque no tenga el código fuente. Hay que conseguir ese dato ANTES de crear el proyecto Flutter.
- Marca/nombre real a usar en toda la interfaz ("JavoFit" vs "PowerGym" vs otro).
- ¿Los clientes inician sesión con correo/contraseña propio, o entran solo con su QR/código sin crear cuenta?
- ¿Se quieren notificaciones push (vencimiento próximo, cumpleaños, rutina nueva asignada)? Eso requiere sumar Firebase Cloud Messaging además de Supabase.
- Confirmar si el dueño ya creó su proyecto real de Supabase o si hay que hacerlo desde cero (ver `dashboard-online/README.md`).
