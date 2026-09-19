// ============================================================
// CLIENTE DE SUPABASE
// ============================================================
// Crea la conexión única que usa toda la app para hablar con la base
// de datos. Depende de que config.js se haya cargado antes en el HTML.
// La librería "supabase-js" viene del CDN (ver <script> en index.html).
// ============================================================

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
