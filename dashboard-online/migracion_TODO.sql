-- ============================================================
-- JAVOFIT · MIGRACIÓN COMPLETA (las 4 en una)
-- ============================================================
-- Pega TODO esto en Supabase → SQL Editor → New query → Run.
-- Es seguro y se puede correr varias veces (usa if not exists /
-- drop policy if exists / on conflict). No borra tus datos.
-- Si sale el aviso "destructive operations" es por los "drop policy"
-- (que solo recrean permisos) → dale "Run query" con confianza.
-- ============================================================

-- ------------------------------------------------------------
-- 1. HISTORIAL DE RACHAS
-- ------------------------------------------------------------
create table if not exists racha_eventos (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid references clientes(id) on delete cascade,
    fecha date not null default current_date,
    racha_anterior int not null default 0,
    dias_atraso int,
    motivo text,
    creado_en timestamptz not null default now()
);
alter table racha_eventos enable row level security;
drop policy if exists "staff_lectura_racha_eventos" on racha_eventos;
create policy "staff_lectura_racha_eventos" on racha_eventos for select using (auth.role() = 'authenticated');
drop policy if exists "staff_escritura_racha_eventos" on racha_eventos;
create policy "staff_escritura_racha_eventos" on racha_eventos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 2. SALUD: NUTRICIÓN + KINESIOLOGÍA
-- ------------------------------------------------------------
create table if not exists nutri_notas (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references clientes(id) on delete cascade,
    fecha date not null default current_date,
    objetivo text,
    peso_meta numeric,
    notas text,
    proximo_control date,
    creado_en timestamptz not null default now()
);
create table if not exists kine_notas (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references clientes(id) on delete cascade,
    fecha date not null default current_date,
    zona text,
    estado text default 'Apto',
    indicaciones text,
    proximo_control date,
    creado_en timestamptz not null default now()
);
alter table nutri_notas enable row level security;
alter table kine_notas enable row level security;
drop policy if exists "staff_lectura_nutri" on nutri_notas;
create policy "staff_lectura_nutri" on nutri_notas for select using (auth.role() = 'authenticated');
drop policy if exists "staff_escritura_nutri" on nutri_notas;
create policy "staff_escritura_nutri" on nutri_notas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "staff_lectura_kine" on kine_notas;
create policy "staff_lectura_kine" on kine_notas for select using (auth.role() = 'authenticated');
drop policy if exists "staff_escritura_kine" on kine_notas;
create policy "staff_escritura_kine" on kine_notas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 3. EXTRA: teléfono emergencia + contrato + planes antiguos
-- ------------------------------------------------------------
alter table clientes add column if not exists telefono_emergencia text;
alter table clientes add column if not exists contrato_firma text;
alter table clientes add column if not exists contrato_fecha date;
alter table clientes add column if not exists contrato_nombre text;
alter table clientes add column if not exists contrato_rut text;
alter table clientes add column if not exists registrado_por text;
alter table clientes add column if not exists observaciones text;
alter table clientes add column if not exists controles_al_dia boolean default false;
alter table clientes add column if not exists emergencia1_nombre text;
alter table clientes add column if not exists emergencia2_nombre text;
alter table clientes add column if not exists emergencia2_telefono text;
alter table clientes add column if not exists emergencia_lugar text;

-- Estado "Congelado" (membresías pausadas)
alter table clientes drop constraint if exists clientes_estado_check;
alter table clientes add constraint clientes_estado_check
    check (estado in ('Al día', 'Pendiente', 'Vencido', 'Congelado'));

-- Ficha de salud detallada
alter table clientes add column if not exists salud_controles_al_dia boolean default false;
alter table clientes add column if not exists salud_enfermedades text;
alter table clientes add column if not exists salud_medicamentos text;
alter table clientes add column if not exists salud_alergias text;
alter table clientes add column if not exists salud_lesiones text;
alter table clientes add column if not exists salud_grupo_sanguineo text;
alter table clientes add column if not exists salud_notas text;
alter table clientes add column if not exists genero text;

insert into planes (id, nombre, duracion_meses, precio) values
    ('5d_1m_ant', '5 Días (1m) Antiguo', 1, 20000),
    ('5d_3m_ant', '5 Días (3m) Antiguo', 3, 55000)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 4. STORAGE: subida de archivos (bucket + columnas)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do nothing;

drop policy if exists "docs_lectura_publica" on storage.objects;
create policy "docs_lectura_publica" on storage.objects for select using (bucket_id = 'documentos');
drop policy if exists "docs_subir_auth" on storage.objects;
create policy "docs_subir_auth" on storage.objects for insert to authenticated with check (bucket_id = 'documentos');
drop policy if exists "docs_borrar_auth" on storage.objects;
create policy "docs_borrar_auth" on storage.objects for delete to authenticated using (bucket_id = 'documentos');

alter table nutri_notas add column if not exists archivo_url text;
alter table nutri_notas add column if not exists archivo_nombre text;
alter table kine_notas  add column if not exists archivo_url text;
alter table kine_notas  add column if not exists archivo_nombre text;
alter table medidas     add column if not exists archivo_url text;
alter table medidas     add column if not exists archivo_nombre text;

-- ============================================================
-- FIN. Si terminó sin error en rojo, ¡todo quedó activado!
-- ============================================================
