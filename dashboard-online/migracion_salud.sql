-- ============================================================
-- MIGRACIÓN: sección Salud (Nutrición + Kinesiología)
-- ============================================================
-- Córrelo UNA sola vez en Supabase → SQL Editor → New query → Run.
-- Seguro: usa "if not exists" y no toca tus datos actuales.
-- ============================================================

-- Notas de NUTRICIÓN (una fila por control/consulta)
create table if not exists nutri_notas (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references clientes(id) on delete cascade,
    fecha date not null default current_date,
    objetivo text,                 -- ej: 'Bajar grasa', 'Subir masa'
    peso_meta numeric,             -- peso objetivo en kg
    notas text,                    -- indicaciones / plan alimenticio
    proximo_control date,
    creado_en timestamptz not null default now()
);

-- Notas de KINESIOLOGÍA (una fila por sesión/evaluación)
create table if not exists kine_notas (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references clientes(id) on delete cascade,
    fecha date not null default current_date,
    zona text,                     -- zona / lesión, ej: 'Hombro derecho'
    estado text default 'Apto',    -- 'Apto' | 'Precaución' | 'No apto'
    indicaciones text,             -- ejercicios de rehab / recomendaciones
    proximo_control date,
    creado_en timestamptz not null default now()
);

alter table nutri_notas enable row level security;
alter table kine_notas enable row level security;

create policy "staff_lectura_nutri" on nutri_notas
    for select using (auth.role() = 'authenticated');
create policy "staff_escritura_nutri" on nutri_notas
    for all using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

create policy "staff_lectura_kine" on kine_notas
    for select using (auth.role() = 'authenticated');
create policy "staff_escritura_kine" on kine_notas
    for all using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
