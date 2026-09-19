-- ============================================================
-- JAVOFIT · MIGRACIÓN EXPEDIENTE (observaciones + emergencia)
-- ============================================================
-- Pega TODO esto en Supabase → SQL Editor → New query → Run.
-- Es seguro y se puede correr varias veces (usa if not exists).
-- No borra datos.
-- ============================================================

-- Observaciones internas + estado de controles
alter table clientes add column if not exists observaciones text;
alter table clientes add column if not exists controles_al_dia boolean default false;

-- Contactos de emergencia (el contacto 1 reutiliza telefono_emergencia)
alter table clientes add column if not exists emergencia1_nombre text;
alter table clientes add column if not exists emergencia2_nombre text;
alter table clientes add column if not exists emergencia2_telefono text;
alter table clientes add column if not exists emergencia_lugar text;

-- ============================================================
-- FIN. Si terminó sin error en rojo, ¡todo quedó activado!
-- ============================================================
