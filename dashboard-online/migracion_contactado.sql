-- ============================================================
-- JAVOFIT · Marcador "Ya le hablé" (seguimiento de renovación)
-- ============================================================
-- Pega TODO esto en Supabase → SQL Editor → New query → Run.
-- Es seguro y se puede correr varias veces. No borra datos.
-- ============================================================

-- Marca si a un cliente vencido ya se le habló para renovar.
alter table clientes add column if not exists contactado boolean default false;

-- ============================================================
-- FIN. Si terminó sin error en rojo, ¡todo quedó activado!
-- ============================================================
