// ============================================================
// cuentas-demo.js — Cuentas de acceso de los socios (DEMO)
// ============================================================
// Simula el manejo de credenciales del portal:
//   • Usuario = correo del socio (lo carga el admin en la ficha).
//   • Al matricularse la cuenta queda PENDIENTE con clave genérica
//     (Demogym2026). En el primer ingreso el socio elige su contraseña
//     y la cuenta pasa a ACTIVA.
//   • El socio NO puede cambiar la contraseña desde el portal.
//   • Solo el ADMIN puede resetearla (vuelve a PENDIENTE + clave genérica)
//     desde el expediente del socio en el Dashboard.
//
// Persistencia: localStorage (gd_cuentas_v1). Se limpia con "Reiniciar demo".
// Nota: el hash es un digest simple SOLO para la demo (no es seguridad real).
// ============================================================

const Cuentas = (() => {
    const KEY = 'gd_cuentas_v1';
    const CLAVE_GENERICA = 'Demogym2026';

    const _load = () => { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (_) { } return {}; };
    let store = _load();
    const _save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (_) { } };

    // Digest simple (djb2) — NO es criptografía, solo evita guardar la clave en claro en la demo.
    const _hash = (s) => {
        s = String(s); let h = 5381;
        for (let i = 0; i < s.length; i++) { h = (((h << 5) + h) + s.charCodeAt(i)) & 0xffffffff; }
        return 'h' + (h >>> 0).toString(36);
    };

    // Cuentas pre-creadas (baked) para la demo: el socio ya tiene su clave lista
    // (no pasa por el primer ingreso). Se re-aplica si falta (p.ej. tras reiniciar).
    const _SEED = {
        c19: { estado: 'activa', hash: _hash('Carlos.Socio2026'), datos: true } // Carlos Abarca Fuentes
    };
    let _seedChanged = false;
    Object.keys(_SEED).forEach(id => { if (!store[id]) { store[id] = _SEED[id]; _seedChanged = true; } });
    if (_seedChanged) _save();

    return {
        CLAVE_GENERICA,

        // 'pendiente' = todavía usa la clave genérica · 'activa' = ya eligió la suya
        estado: (id) => (store[id] && store[id].estado === 'activa') ? 'activa' : 'pendiente',

        // Verifica credenciales. Devuelve { ok, requiereCambio }.
        // Si la cuenta está pendiente, solo acepta la clave genérica y pide cambiarla.
        verificar: (id, clave) => {
            const rec = store[id];
            if (!rec || rec.estado !== 'activa') return { ok: clave === CLAVE_GENERICA, requiereCambio: true };
            return { ok: rec.hash === _hash(clave), requiereCambio: false };
        },

        // Primer ingreso: el socio define su contraseña (cuenta pasa a ACTIVA).
        // datos:false → todavía debe completar su ficha antes de usar el portal.
        definirClave: (id, clave) => { store[id] = { estado: 'activa', hash: _hash(clave), datos: false }; _save(); },

        // ¿El socio todavía debe completar su ficha? (true tras el primer ingreso hasta que la guarda)
        necesitaDatos: (id) => { const r = store[id]; return !!(r && r.estado === 'activa' && r.datos !== true); },
        // Marca la ficha como completada (fin del onboarding).
        marcarDatosListos: (id) => { if (store[id]) { store[id].datos = true; _save(); } },

        // Admin: resetea a la clave genérica (la cuenta vuelve a PENDIENTE + onboarding).
        resetear: (id) => { delete store[id]; _save(); }
    };
})();


// ============================================================
// Bloque "Cuenta del portal" en el expediente del socio (dashboard)
// ============================================================
function renderizarCuentaPortal(c) {
    const cont = document.getElementById('cuenta-portal');
    if (!cont || typeof Cuentas === 'undefined') return;
    const esc = (s) => (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s ?? '');
    const est = Cuentas.estado(c.id);

    const badge = est === 'activa'
        ? '<span class="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">Activa · el socio ya eligió su clave</span>'
        : '<span class="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40">Pendiente · usa la clave genérica</span>';

    const detalle = est === 'activa'
        ? 'El socio ya definió su contraseña. No puede cambiarla; si la olvidó, reseteala acá.'
        : `Aún no ingresó. Debe entrar con el correo y la clave genérica <b class="text-amber-400">${Cuentas.CLAVE_GENERICA}</b>, y ahí elige su contraseña.`;

    cont.innerHTML = `
        <h4 class="text-sm font-bold text-cyan-400"><i class="fa-solid fa-user-lock"></i> Cuenta del portal</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-2">
            <div><p class="text-slate-400 mb-1">Usuario (correo)</p><p class="text-white font-bold break-all">${esc(c.correo) || '<span class="text-rose-400">Sin correo — cargalo arriba para habilitar el acceso</span>'}</p></div>
            <div><p class="text-slate-400 mb-1">Estado</p>${badge}</div>
        </div>
        <div class="flex items-center justify-between flex-wrap gap-2 mt-3">
            <p class="text-[11px] text-slate-500 flex-1 min-w-[200px]">${detalle}</p>
            <button onclick="resetearCuentaSocio('${c.id}')" class="text-xs font-black bg-rose-500/15 text-rose-400 border border-rose-500/40 px-3 py-1.5 rounded-xl hover:brightness-110 whitespace-nowrap"><i class="fa-solid fa-rotate-left"></i> Resetear contraseña</button>
        </div>`;
}

function resetearCuentaSocio(id) {
    if (!confirm('¿Resetear la contraseña de este socio?\n\nVolverá a la clave genérica (' + Cuentas.CLAVE_GENERICA + '). La próxima vez que ingrese al portal deberá elegir una nueva.')) return;
    Cuentas.resetear(id);
    const c = (typeof clientesData !== 'undefined') ? clientesData.find(x => x.id === id) : null;
    if (c) renderizarCuentaPortal(c);
}
