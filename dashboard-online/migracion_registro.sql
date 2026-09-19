-- ============================================================
-- MIGRACIÓN: registrar quién (staff) creó cada cliente
-- ============================================================
-- Córrelo UNA vez en Supabase → SQL Editor → New query → Run.
-- Seguro y re-ejecutable.
-- ============================================================

alter table clientes add column if not exists registrado_por text;
