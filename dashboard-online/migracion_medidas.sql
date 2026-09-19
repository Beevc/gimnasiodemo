-- ============================================================
-- JAVOFIT · Medidas: Cadera + Brazos/Piernas Izquierdo y Derecho
-- ============================================================
-- Pega TODO esto en Supabase → SQL Editor → New query → Run.
-- Es seguro y se puede correr varias veces (usa if not exists).
-- No borra datos: copia lo viejo de brazo/piernas al lado izquierdo.
-- ============================================================

-- 1. Columnas nuevas
alter table medidas add column if not exists brazo_izq  numeric;
alter table medidas add column if not exists brazo_der  numeric;
alter table medidas add column if not exists cadera     numeric;
alter table medidas add column if not exists pierna_izq numeric;
alter table medidas add column if not exists pierna_der numeric;

-- 2. Migra los valores viejos (una sola medida por brazo/pierna) al lado
--    IZQUIERDO, solo si el nuevo aún está vacío (no pisa datos ya cargados).
update medidas set brazo_izq  = brazo   where brazo_izq  is null and brazo   is not null;
update medidas set pierna_izq = piernas where pierna_izq is null and piernas is not null;

-- Las columnas viejas brazo / piernas quedan (obsoletas, no se usan en la UI).

-- ============================================================
-- FIN. Si terminó sin error en rojo, ¡todo quedó activado!
-- ============================================================
