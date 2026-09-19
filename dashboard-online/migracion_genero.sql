-- ============================================================
-- JAVOFIT · Campo género (para dividir los TOP de la TV)
-- ============================================================
-- Pega esto en Supabase → SQL Editor → New query → Run.
-- Seguro y repetible (usa if not exists). No borra datos.
-- Valores esperados: 'M' (Hombre), 'F' (Mujer) o NULL (sin especificar).
-- ============================================================

alter table clientes add column if not exists genero text;

-- ============================================================
-- FIN. Si terminó sin error en rojo, ¡quedó activado!
-- ============================================================
