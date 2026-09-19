-- ============================================================
-- JAVOFIT · Estado "Congelado" + Ficha de salud detallada
-- ============================================================
-- Pega TODO esto en Supabase → SQL Editor → New query → Run.
-- Es seguro y se puede correr varias veces (usa if not exists /
-- drop constraint if exists). No borra tus datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. NUEVO ESTADO "Congelado" (para membresías pausadas)
-- ------------------------------------------------------------
-- Reemplaza la regla que solo permitía Al día / Pendiente / Vencido.
alter table clientes drop constraint if exists clientes_estado_check;
alter table clientes add constraint clientes_estado_check
    check (estado in ('Al día', 'Pendiente', 'Vencido', 'Congelado'));

-- ------------------------------------------------------------
-- 2. FICHA DE SALUD DETALLADA (por cliente)
-- ------------------------------------------------------------
alter table clientes add column if not exists salud_controles_al_dia boolean default false;
alter table clientes add column if not exists salud_enfermedades text;
alter table clientes add column if not exists salud_medicamentos text;
alter table clientes add column if not exists salud_alergias text;
alter table clientes add column if not exists salud_lesiones text;
alter table clientes add column if not exists salud_grupo_sanguineo text;
alter table clientes add column if not exists salud_notas text;

-- ============================================================
-- FIN. Si terminó sin error en rojo, ¡todo quedó activado!
-- ============================================================
