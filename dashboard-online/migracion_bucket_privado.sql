-- ============================================================
-- JAVOFIT · Bucket "documentos" PRIVADO + políticas de staff
-- ============================================================
-- Pega TODO esto en Supabase → SQL Editor → New query → Run.
-- Hace 2 cosas: (1) cierra el acceso público al bucket de documentos
-- de salud, y (2) deja que el staff logueado siga pudiendo ver/subir/
-- borrar (necesario para que la app genere los enlaces firmados).
-- Es seguro y se puede correr varias veces.
-- ============================================================

-- 1) Bucket privado (cierra el acceso público)
update storage.buckets set public = false where id = 'documentos';

-- 1b) IMPORTANTE: borrar la política vieja de lectura PÚBLICA (dejaba leer a
--     cualquiera, incluso sin login). Sin esto, privatizar el bucket NO cierra
--     el acceso: los anónimos siguen pudiendo listar/descargar.
drop policy if exists "docs_lectura_publica" on storage.objects;

-- 2) Políticas para que el staff logueado siga operando
drop policy if exists "staff_lee_documentos" on storage.objects;
create policy "staff_lee_documentos" on storage.objects
  for select using (bucket_id = 'documentos' and auth.role() = 'authenticated');

drop policy if exists "staff_sube_documentos" on storage.objects;
create policy "staff_sube_documentos" on storage.objects
  for insert with check (bucket_id = 'documentos' and auth.role() = 'authenticated');

drop policy if exists "staff_borra_documentos" on storage.objects;
create policy "staff_borra_documentos" on storage.objects
  for delete using (bucket_id = 'documentos' and auth.role() = 'authenticated');

-- ============================================================
-- FIN. Refresca la pantalla de Storage: la etiqueta PÚBLICO
-- del bucket "documentos" debe desaparecer.
-- ============================================================
