# Correo automático "quedan 3 días · cuida tu racha"

Guía para dejar funcionando el envío automático. No necesitas programar,
solo copiar/pegar y hacer clics. Son ~15 minutos, una sola vez.

---

## Paso 1 — Crear cuenta en Resend (servicio de correos)

1. Entra a https://resend.com y crea una cuenta gratis (puedes usar "Continue with Google").
   - Plan gratis: **3.000 correos al mes / 100 por día**. De sobra para un gimnasio.
2. En el menú, ve a **API Keys** → **Create API Key**.
   - Ponle un nombre (ej. `javofit`), permiso **Sending access**, y **Create**.
   - Copia la key (empieza con `re_...`). **Guárdala**, la usarás en el Paso 3.

### Sobre el remitente (de qué correo salen los avisos)
- **Para empezar YA (modo prueba):** puedes usar `onboarding@resend.dev`, pero
  Resend solo te deja enviar a **tu propio correo verificado**. Sirve para probar.
- **Para producción (enviar a tus clientes):** en Resend ve a **Domains** →
  **Add Domain**, agrega un dominio tuyo (ej. `javofit.cl`) y sigue los pasos de
  verificación (agregar unos registros DNS). Luego el remitente sería algo como
  `avisos@javofit.cl`. Si no tienes dominio, avísame y vemos alternativas.

---

## Paso 2 — Crear la Edge Function en Supabase

1. En tu proyecto de Supabase, menú lateral → **Edge Functions**.
2. Click en **Deploy a new function** → **Via Editor** (editor en el navegador).
3. Nombre de la función (EXACTO): `recordatorio-vencimiento`
4. Borra el código de ejemplo y **pega TODO** el contenido del archivo
   `supabase/functions/recordatorio-vencimiento/index.ts` (te lo entregué).
5. Si ves una opción **"Verify JWT"**, déjala **activada** (ON).
6. Click en **Deploy**.

---

## Paso 3 — Configurar los "secrets" (tus claves)

1. En **Edge Functions** → pestaña **Secrets** (o **Manage secrets**).
2. Agrega estos dos:
   - Nombre: `RESEND_API_KEY`  → Valor: la key `re_...` del Paso 1.
   - Nombre: `MAIL_FROM`       → Valor: `JavoFit <onboarding@resend.dev>`
     (o `JavoFit <avisos@tudominio.cl>` cuando tengas dominio verificado).
3. Guardar.

---

## Paso 4 — Probar que funciona

1. En la página de la función, botón **Invoke** / **Run** (o **Test**).
2. Deberías recibir una respuesta como:
   `{ "fecha_objetivo": "2026-08-24", "candidatos": 0, "enviados": 0, "errores": [] }`
   - `candidatos` = cuántos clientes vencen en exactamente 3 días hoy.
   - Si hay candidatos con correo, revisa que llegue el correo.
   - Truco para probar: edita un cliente (con TU correo) y pon su vencimiento a
     dentro de 3 días; invoca la función; te debería llegar el correo.

---

## Paso 5 — Programar que se ejecute sola cada día

1. En Supabase, menú lateral → **Integrations** → **Cron** (o **Database → Cron Jobs**).
2. **Create job**:
   - Nombre: `recordatorio-diario`
   - Tipo/Method: **Supabase Edge Function** → elige `recordatorio-vencimiento`.
   - Schedule (horario): `0 13 * * *`
     - Eso es **13:00 UTC ≈ 09:00 de la mañana en Chile**. Ajusta la hora si quieres.
3. **Create**. ¡Listo! Todos los días a esa hora revisa quién vence en 3 días y les escribe.

---

## Notas
- El correo solo se envía a clientes con **correo cargado** y que **no estén ya vencidos**.
- Cada cliente recibe UN correo el día que le quedan exactamente 3 días.
- Puedes cambiar el texto del correo editando la función (la parte `plantillaCorreo`).
- Si algo falla, la respuesta de la función trae un campo `errores` con el detalle.
