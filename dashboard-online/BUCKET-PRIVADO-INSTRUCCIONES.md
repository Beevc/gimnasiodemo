# 🔒 Poner privado el bucket de documentos (datos de salud)

Los PDF de nutrición / kinesiología / medidas estaban en un bucket **público**
(cualquiera con el link los abría). El código ya se actualizó para usar
**enlaces firmados temporales**, así que ahora hay que cerrar el acceso público.

> ⚠️ Orden importante: el código nuevo ya está desplegado y funciona con el
> bucket público O privado. Recién ahí hacé este cambio.

## Paso 1 — Hacer el bucket privado (interfaz)
1. Entra a Supabase → **Storage** (menú lateral).
2. Clic en el bucket **documentos**.
3. Botón **⋯ / Edit bucket** → **desactiva** "Public bucket" → **Save**.

Con eso, los enlaces públicos dejan de funcionar y solo se puede acceder con
enlaces firmados (los que genera la app).

## Paso 2 — Asegurar que el staff logueado siga pudiendo ver/subir
Pega esto en Supabase → **SQL Editor** → New query → **Run**.
Es seguro: primero borra la política si ya existe y la vuelve a crear.

```sql
-- Staff logueado puede LEER (necesario para generar enlaces firmados)
drop policy if exists "staff_lee_documentos" on storage.objects;
create policy "staff_lee_documentos" on storage.objects
  for select using (bucket_id = 'documentos' and auth.role() = 'authenticated');

-- Staff logueado puede SUBIR
drop policy if exists "staff_sube_documentos" on storage.objects;
create policy "staff_sube_documentos" on storage.objects
  for insert with check (bucket_id = 'documentos' and auth.role() = 'authenticated');

-- Staff logueado puede BORRAR
drop policy if exists "staff_borra_documentos" on storage.objects;
create policy "staff_borra_documentos" on storage.objects
  for delete using (bucket_id = 'documentos' and auth.role() = 'authenticated');
```

## Cómo queda
- Ver un archivo desde el dashboard → enlace firmado que **dura 1 hora**.
- Enviar por WhatsApp al cliente → enlace firmado que **dura 7 días** (para que
  alcance a abrirlo) y después expira solo.
- Los archivos ya subidos (con URL pública antigua) siguen funcionando: la app
  extrae su ruta y les genera un enlace firmado igual.
