-- ============================================================
-- JAVOFIT · Esquema de base de datos para Supabase (Postgres)
-- ============================================================
-- Cómo usar este archivo:
-- 1. Entra a tu proyecto en https://app.supabase.com
-- 2. Ve a "SQL Editor" (menú lateral) -> "New query"
-- 3. Pega TODO este archivo y dale "Run"
-- Eso crea todas las tablas, relaciones y reglas de seguridad.
-- ============================================================

-- Extensión para generar IDs únicos (UUID)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PLANES (catálogo fijo de membresías)
-- ------------------------------------------------------------
create table if not exists planes (
    id text primary key,               -- ej: '5d_1m'
    nombre text not null,
    duracion_meses int not null,
    precio numeric not null
);

insert into planes (id, nombre, duracion_meses, precio) values
    ('beta',    'Beta Tester (1m)', 1,  15000),
    ('3d_1m',   '3 Días (1m)',      1,  20000),
    ('5d_1m',   '5 Días (1m)',      1,  25000),
    ('5d_3m',   '5 Días (3m)',      3,  70000),
    ('5d_6m',   '5 Días (6m)',      6,  130000),
    ('5d_12m',  '5 Días (12m)',     12, 240000),
    ('5d_1m_ant','5 Días (1m) Antiguo', 1, 20000),
    ('5d_3m_ant','5 Días (3m) Antiguo', 3, 55000),
    ('coach',   'Coach',            1200, 0)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. CLIENTES
-- ------------------------------------------------------------
create table if not exists clientes (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    apellido text not null,
    correo text,
    telefono text,
    telefono_emergencia text,     -- teléfono del contacto de emergencia 1
    emergencia1_nombre text,      -- nombre del contacto de emergencia 1
    emergencia2_nombre text,      -- nombre del contacto de emergencia 2
    emergencia2_telefono text,    -- teléfono del contacto de emergencia 2
    emergencia_lugar text,        -- dónde llevarlo/a en caso de emergencia
    observaciones text,           -- notas internas del cliente
    controles_al_dia boolean default false, -- (obsoleto) reemplazado por salud_controles_al_dia
    salud_controles_al_dia boolean default false, -- controles médicos al día
    salud_enfermedades text,      -- enfermedades / condiciones preexistentes
    salud_medicamentos text,      -- medicamentos que toma
    salud_alergias text,          -- alergias
    salud_lesiones text,          -- lesiones / cirugías previas
    salud_grupo_sanguineo text,   -- grupo sanguíneo
    salud_notas text,             -- notas médicas adicionales
    genero text,                  -- 'M' (Hombre), 'F' (Mujer) o NULL
    cumpleanos date,
    plan_id text references planes(id),
    racha_meses int not null default 1,
    vence date,
    fecha_ingreso date not null default current_date,
    estado text not null default 'Al día' check (estado in ('Al día','Pendiente','Vencido','Congelado')),
    contactado boolean default false,  -- "ya le hablé" para seguimiento de renovación de vencidos
    asistio_hoy boolean not null default false,
    asistencias_mes int not null default 0,
    premio_asistencia_reclamado boolean not null default false,
    qr_code text unique default encode(gen_random_bytes(12), 'hex'), -- token único para el QR de cada cliente
    contrato_firma text,    -- firma digital del contrato (imagen dataURL)
    contrato_fecha date,     -- fecha en que firmó el contrato
    contrato_nombre text,    -- nombre con el que firmó
    contrato_rut text,       -- RUT con el que firmó
    registrado_por text,     -- nombre del staff que registró al cliente (detectado de la sesión)
    creado_en timestamptz not null default now()
);

create index if not exists idx_clientes_estado on clientes(estado);
create index if not exists idx_clientes_qr on clientes(qr_code);

-- ------------------------------------------------------------
-- 3. PAGOS (historial de pagos/renovaciones por cliente)
-- ------------------------------------------------------------
create table if not exists pagos (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references clientes(id) on delete cascade,
    fecha date not null default current_date,
    concepto text not null,
    monto numeric not null,
    metodo text not null,
    creado_en timestamptz not null default now()
);

create index if not exists idx_pagos_cliente on pagos(cliente_id);

-- ------------------------------------------------------------
-- 4. MEDIDAS ANTROPOMÉTRICAS (historial por cliente)
-- ------------------------------------------------------------
create table if not exists medidas (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references clientes(id) on delete cascade,
    fecha date not null default current_date,
    peso numeric,
    pectoral numeric,
    brazo numeric,        -- obsoleta (reemplazada por brazo_izq/brazo_der)
    brazo_izq numeric,
    brazo_der numeric,
    cintura numeric,
    cadera numeric,
    piernas numeric,      -- obsoleta (reemplazada por pierna_izq/pierna_der)
    pierna_izq numeric,
    pierna_der numeric,
    gluteos numeric,
    creado_en timestamptz not null default now()
);

create index if not exists idx_medidas_cliente on medidas(cliente_id);

-- ------------------------------------------------------------
-- 5. RÉCORDS PERSONALES (PRs)
-- ------------------------------------------------------------
create table if not exists prs (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references clientes(id) on delete cascade,
    ejercicio text not null,
    marca numeric not null,
    fecha date not null default current_date,
    creado_en timestamptz not null default now()
);

create index if not exists idx_prs_cliente on prs(cliente_id);

-- ------------------------------------------------------------
-- 6. ASISTENCIAS (registro diario, uno por check-in)
-- ------------------------------------------------------------
-- Esta tabla es la que va a alimentar el QR de entrada más adelante:
-- cada vez que un cliente escanea/se marca, se inserta una fila aquí.
create table if not exists asistencias (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references clientes(id) on delete cascade,
    fecha date not null default current_date,
    hora timestamptz not null default now(),
    metodo text not null default 'manual' check (metodo in ('manual','qr'))
);

create index if not exists idx_asistencias_cliente_fecha on asistencias(cliente_id, fecha);
-- evita marcar dos veces el mismo día por error (opcional pero recomendado)
create unique index if not exists uq_asistencia_dia on asistencias(cliente_id, fecha);

-- ------------------------------------------------------------
-- 7. STAFF (personal con acceso al dashboard)
-- ------------------------------------------------------------
-- auth_user_id conecta esta fila con el usuario real de Supabase Auth
-- (el que usan para iniciar sesión). Se llena cuando el staff se registra.
create table if not exists staff (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique references auth.users(id) on delete set null,
    nombre text not null,
    rol text not null default 'Entrenador',
    permisos text[] not null default '{}',
    creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8. BIBLIOTECA DE EJERCICIOS (para la futura app de clientes)
-- ------------------------------------------------------------
create table if not exists ejercicios (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    grupo_muscular text,               -- ej: 'Pierna', 'Pecho', 'Espalda'
    descripcion text,
    video_url text,                    -- link a demo (YouTube, Supabase Storage, etc.)
    imagen_url text,
    creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 9. RUTINAS (para la futura app de clientes)
-- ------------------------------------------------------------
create table if not exists rutinas (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    descripcion text,
    cliente_id uuid references clientes(id) on delete cascade, -- null = rutina genérica/plantilla
    creado_en timestamptz not null default now()
);

create table if not exists rutina_ejercicios (
    id uuid primary key default gen_random_uuid(),
    rutina_id uuid not null references rutinas(id) on delete cascade,
    ejercicio_id uuid not null references ejercicios(id) on delete cascade,
    series int,
    repeticiones text,          -- texto porque a veces es "12" y a veces "AMRAP"
    orden int not null default 0
);

-- ------------------------------------------------------------
-- 11. EVENTOS DE RACHA (historial de rachas perdidas / reseteadas)
-- ------------------------------------------------------------
-- Cada vez que un cliente pierde/resetea su racha se guarda una fila
-- aquí. Permite medir a futuro EN QUÉ MES suelen perderla (racha_anterior)
-- y POR QUÉ (motivo, días de atraso).
create table if not exists racha_eventos (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid references clientes(id) on delete cascade,
    fecha date not null default current_date,
    racha_anterior int not null default 0,   -- en qué mes de racha estaba al perderla
    dias_atraso int,                          -- cuántos días de atraso tenía el pago (si aplica)
    motivo text,                              -- ej: 'Atraso en pago', 'Reset manual'
    creado_en timestamptz not null default now()
);

-- ============================================================
-- SEGURIDAD (Row Level Security)
-- ============================================================
-- Con RLS activado, la app usa la "anon key" (que es pública) pero
-- Postgres solo deja pasar las consultas que cumplan estas reglas.
-- Regla usada aquí: solo un usuario autenticado (staff logueado)
-- puede leer o escribir. Los clientes NO tienen login en esta fase.

alter table clientes enable row level security;
alter table pagos enable row level security;
alter table medidas enable row level security;
alter table prs enable row level security;
alter table asistencias enable row level security;
alter table staff enable row level security;
alter table ejercicios enable row level security;
alter table rutinas enable row level security;
alter table rutina_ejercicios enable row level security;
alter table racha_eventos enable row level security;
alter table planes enable row level security;

-- Planes: cualquiera con la anon key puede solo LEER (no son datos sensibles)
create policy "planes_lectura_publica" on planes for select using (true);

-- Todo lo demás: solo usuarios autenticados (staff con login) pueden leer/escribir
create policy "staff_lectura" on clientes for select using (auth.role() = 'authenticated');
create policy "staff_escritura" on clientes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_pagos" on pagos for select using (auth.role() = 'authenticated');
create policy "staff_escritura_pagos" on pagos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_medidas" on medidas for select using (auth.role() = 'authenticated');
create policy "staff_escritura_medidas" on medidas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_prs" on prs for select using (auth.role() = 'authenticated');
create policy "staff_escritura_prs" on prs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_asistencias" on asistencias for select using (auth.role() = 'authenticated');
create policy "staff_escritura_asistencias" on asistencias for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_staff" on staff for select using (auth.role() = 'authenticated');
create policy "staff_escritura_staff" on staff for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_ejercicios" on ejercicios for select using (auth.role() = 'authenticated');
create policy "staff_escritura_ejercicios" on ejercicios for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_rutinas" on rutinas for select using (auth.role() = 'authenticated');
create policy "staff_escritura_rutinas" on rutinas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_rutina_ejercicios" on rutina_ejercicios for select using (auth.role() = 'authenticated');
create policy "staff_escritura_rutina_ejercicios" on rutina_ejercicios for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff_lectura_racha_eventos" on racha_eventos for select using (auth.role() = 'authenticated');
create policy "staff_escritura_racha_eventos" on racha_eventos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- DATOS DE EJEMPLO (opcional, bórralo si quieres empezar limpio)
-- ============================================================
insert into clientes (nombre, apellido, correo, telefono, cumpleanos, plan_id, racha_meses, vence, fecha_ingreso, estado, asistio_hoy, asistencias_mes)
values
    ('Juan', 'Díaz', 'juan.diaz@gmail.com', '+56911223344', '1992-08-15', '5d_1m', 4, '2026-09-16', '2025-01-10', 'Al día', true, 22),
    ('Camila', 'Pérez', 'camila.perez@hotmail.com', '+56922334455', '1995-08-20', '5d_3m', 1, '2026-08-12', '2025-08-13', 'Vencido', false, 21)
on conflict do nothing;
