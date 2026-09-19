-- ============================================================
-- JAVOFIT · Plan "Coach" (gratis e indefinido)
-- ============================================================
-- Pega TODO esto en Supabase → SQL Editor → New query → Run.
-- Es seguro y se puede correr varias veces. No borra datos.
--
-- Plan para entrenadores: precio 0 (no afecta finanzas) y duración
-- enorme (1200 meses = 100 años) para que en la práctica NUNCA venza.
-- Sirve para que los coaches entren como clientes y participen en los
-- PR que se muestran en la TV.
-- ============================================================

insert into planes (id, nombre, duracion_meses, precio) values
    ('coach', 'Coach', 1200, 0)
on conflict (id) do nothing;

-- ============================================================
-- FIN. Si terminó sin error en rojo, ¡el plan Coach ya existe!
-- ============================================================
