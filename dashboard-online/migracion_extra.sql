-- ============================================================
-- MIGRACIÓN: teléfono de emergencia + contrato + plan antiguo
-- ============================================================
-- Córrelo UNA sola vez en Supabase → SQL Editor → New query → Run.
-- Seguro: usa "if not exists" / "on conflict" y no borra nada.
-- ============================================================

-- 1) Teléfono de emergencia del cliente
alter table clientes add column if not exists telefono_emergencia text;

-- 2) Contrato del gimnasio (firma digital guardada como imagen base64)
alter table clientes add column if not exists contrato_firma text;   -- imagen de la firma (dataURL)
alter table clientes add column if not exists contrato_fecha date;    -- fecha en que firmó
alter table clientes add column if not exists contrato_nombre text;   -- nombre con el que firmó
alter table clientes add column if not exists contrato_rut text;      -- RUT con el que firmó

-- 3) Planes antiguos
insert into planes (id, nombre, duracion_meses, precio) values
    ('5d_1m_ant', '5 Días (1m) Antiguo', 1, 20000),
    ('5d_3m_ant', '5 Días (3m) Antiguo', 3, 55000)
on conflict (id) do nothing;
