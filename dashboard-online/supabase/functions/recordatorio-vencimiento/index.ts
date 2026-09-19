// ============================================================
// Edge Function: recordatorio-vencimiento
// ============================================================
// Envía un correo automático a los clientes cuyo plan vence en
// EXACTAMENTE 3 días, recordándoles renovar para no perder su racha.
//
// Se ejecuta sola una vez al día (mediante Supabase Cron).
//
// Variables de entorno necesarias (se configuran como "secrets"):
//   RESEND_API_KEY  -> tu API key de https://resend.com
//   MAIL_FROM       -> remitente, ej: "JavoFit <avisos@tudominio.cl>"
//                      (mientras no tengas dominio: "JavoFit <onboarding@resend.dev>")
//
// Supabase ya inyecta automáticamente SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY (para leer la base de datos sin RLS).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Devuelve la fecha (AAAA-MM-DD) de Chile sumándole "dias" días.
function fechaChileMas(dias: number): string {
  const hoyStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const [y, m, d] = hoyStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12)); // mediodía UTC evita líos de horario
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

// AAAA-MM-DD -> DD/MM/AAAA para mostrar en el correo.
function formatoLindo(iso: string): string {
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

// Plantilla HTML del correo (bonita y responsiva).
function plantillaCorreo(nombre: string, vence: string, racha: number): string {
  const meses = racha === 1 ? "1 mes" : `${racha} meses`;
  return `
  <div style="background:#0f172a;padding:24px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:18px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#f59e0b,#facc15);padding:20px 24px">
        <h1 style="margin:0;color:#0f172a;font-size:20px;font-weight:800">⏰ ¡No pierdas tu racha, ${nombre}!</h1>
      </div>
      <div style="padding:24px;color:#e5e7eb;font-size:15px;line-height:1.6">
        <p>Hola <b>${nombre}</b> 👋</p>
        <p>Queríamos avisarte con cariño: tu plan en <b>JavoFit</b> vence el
          <b style="color:#facc15">${formatoLindo(vence)}</b> — te quedan solo <b>3 días</b>.</p>
        <p>Sabemos lo que te ha costado construir tu racha de <b style="color:#f59e0b">${meses}</b> 🔥,
          y no queremos que la pierdas. Recuerda que si el pago se atrasa <b>más de 4 días</b>,
          la racha se reinicia desde cero… y con ella los descuentos que ya tenías ganados.</p>
        <p>Renovar es rápido: pásate por recepción o escríbenos y lo dejamos listo en un minuto.</p>
        <p style="margin-top:20px">¡Te esperamos para seguir sumando meses (y músculos) juntos! 💪</p>
        <p style="color:#9ca3af;font-size:13px;margin-top:24px">— Equipo <b>JavoFit</b></p>
      </div>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "JavoFit <onboarding@resend.dev>";
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Falta configurar RESEND_API_KEY" }), { status: 500 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const objetivo = fechaChileMas(3); // vence en exactamente 3 días

    // Clientes que vencen ese día, con correo y que no estén ya vencidos.
    const { data: clientes, error } = await supabase
      .from("clientes")
      .select("nombre, correo, vence, racha_meses, estado")
      .eq("vence", objetivo)
      .not("correo", "is", null)
      .neq("estado", "Vencido");

    if (error) throw error;

    let enviados = 0;
    const errores: string[] = [];

    for (const c of clientes ?? []) {
      if (!c.correo) continue;
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: MAIL_FROM,
          to: [c.correo],
          subject: "⏰ ¡No pierdas tu racha en JavoFit! Te quedan pocos días",
          html: plantillaCorreo(c.nombre, c.vence, c.racha_meses ?? 0),
        }),
      });
      if (resp.ok) enviados++;
      else errores.push(`${c.correo}: ${await resp.text()}`);
    }

    return new Response(
      JSON.stringify({ fecha_objetivo: objetivo, candidatos: clientes?.length ?? 0, enviados, errores }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
