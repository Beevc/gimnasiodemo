// ============================================================
// CONFIGURACIÓN DE SUPABASE
// ============================================================
// Reemplaza estos dos valores por los de TU proyecto de Supabase.
// Los encuentras en: Supabase -> tu proyecto -> Settings -> API
//
//   SUPABASE_URL      -> "Project URL"
//   SUPABASE_ANON_KEY -> "anon public" key
//
// Importante: la "anon key" está pensada para ser pública (va dentro
// del código del navegador). La seguridad real la dan las reglas de
// RLS que ya quedaron configuradas en schema.sql, NO el secreto de
// esta key. Nunca pongas aquí la "service_role key" (esa sí es secreta).
// ============================================================

const SUPABASE_URL = "https://uirfpyjqrqluhpwoackf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcmZweWpxcnFsdWhwd29hY2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNzA0NDYsImV4cCI6MjEwMjg0NjQ0Nn0.o4gT5eue57Ar18uxNszr1QtDoT4Nil5QNuKqEXih87s";
