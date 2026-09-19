-- ============================================================
-- MIGRACIÓN: tabla de historial de rachas (racha_eventos)
-- ============================================================
-- Córrelo UNA sola vez en Supabase → SQL Editor → New query → Run.
-- Es seguro: usa "if not exists" y no toca tus datos actuales.
-- ============================================================

create table if not exists racha_eventos (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid references clientes(id) on delete cascade,
    fecha date not null default current_date,
    racha_anterior int not null default 0,   -- en qué mes de racha estaba al perderla
    dias_atraso int,                          -- días de atraso del pago (si aplica)
    motivo text,                              -- ej: 'Atraso en pago', 'Reset manual'
    creado_en timestamptz not null default now()
);

alter table racha_eventos enable row level security;

-- Solo staff logueado puede leer/escribir (igual que el resto de tablas)
create policy "staff_lectura_racha_eventos" on racha_eventos
    for select using (auth.role() = 'authenticated');
create policy "staff_escritura_racha_eventos" on racha_eventos
    for all using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
