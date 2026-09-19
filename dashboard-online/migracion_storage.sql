-- ============================================================
-- MIGRACIÓN: subida de archivos (Supabase Storage)
-- ============================================================
-- Córrelo UNA sola vez en Supabase → SQL Editor → New query → Run.
-- Crea el "bucket" de documentos y las columnas para guardar el link
-- del archivo en cada control de nutrición, sesión de kine y medida.
-- ============================================================

-- 1) Bucket público "documentos" (para poder compartir el link por WhatsApp)
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do nothing;

-- 2) Permisos del bucket:
--    - lectura pública (cualquiera con el link puede ver el PDF)
--    - subir/borrar solo staff logueado
drop policy if exists "docs_lectura_publica" on storage.objects;
create policy "docs_lectura_publica" on storage.objects
    for select using (bucket_id = 'documentos');

drop policy if exists "docs_subir_auth" on storage.objects;
create policy "docs_subir_auth" on storage.objects
    for insert to authenticated with check (bucket_id = 'documentos');

drop policy if exists "docs_borrar_auth" on storage.objects;
create policy "docs_borrar_auth" on storage.objects
    for delete to authenticated using (bucket_id = 'documentos');

-- 3) Columnas para guardar el archivo adjunto en cada fila
alter table nutri_notas add column if not exists archivo_url text;
alter table nutri_notas add column if not exists archivo_nombre text;

alter table kine_notas  add column if not exists archivo_url text;
alter table kine_notas  add column if not exists archivo_nombre text;

alter table medidas     add column if not exists archivo_url text;
alter table medidas     add column if not exists archivo_nombre text;
