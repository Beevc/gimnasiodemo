// ============================================================
// horarios-demo.js — Horarios del gimnasio + cupos (DEMO)
// ============================================================
// El admin configura BLOQUES (hora · entrenador · cupo · activo). Se
// guardan en localStorage para compartirse con el portal del socio (otra
// página, mismo origen). El socio reserva un bloque respetando el cupo y
// recibe su QR del día. El entrenador ve los horarios y las reservas.
//
// La ocupación de cada bloque se calcula desde las reservas del día
// (Acceso.reservasDelDia), así no duplicamos estado.
// ============================================================

const Horarios = (() => {
    const KEY = 'gd_horarios_v1';

    // Config inicial (aplica todos los días). Entrenadores = ids de STAFF_DEMO.
    const DEFAULT = [
        { id: 'b1', hora: '07:00', entrenadorId: 'st2', cupo: 8,  activo: true },
        { id: 'b2', hora: '08:30', entrenadorId: 'st3', cupo: 8,  activo: true },
        { id: 'b3', hora: '10:00', entrenadorId: 'st2', cupo: 6,  activo: true },
        { id: 'b4', hora: '12:00', entrenadorId: 'st3', cupo: 6,  activo: false },
        { id: 'b5', hora: '18:30', entrenadorId: 'st2', cupo: 12, activo: true },
        { id: 'b6', hora: '20:00', entrenadorId: 'st3', cupo: 10, activo: true }
    ];

    const _load = () => { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (_) { return null; } };
    const _save = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (_) { } };

    let cache = _load();
    if (!cache) { cache = DEFAULT.map(b => ({ ...b })); _save(cache); }

    const _commit = () => _save(cache);
    const _uid = () => 'b_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

    const getBloques = () => cache.map(b => ({ ...b }));
    const bloquesActivos = () => cache.filter(b => b.activo).slice().sort((a, b) => a.hora.localeCompare(b.hora));
    const bloquePorHora = (hora) => cache.find(b => b.hora === hora) || null;

    const entrenadores = () => (typeof STAFF_DEMO !== 'undefined' ? STAFF_DEMO : []);
    const entrenadorNombre = (id) => { const s = entrenadores().find(x => x.id === id); return s ? s.nombre : '—'; };

    // Cuántos socios reservaron ese bloque en esa fecha (hoy por defecto).
    const ocupacion = (hora, fechaISO) => {
        const f = fechaISO || Acceso.hoyISO();
        return Acceso.reservasDelDia(f).filter(r => r.bloque === hora).length;
    };

    const agregar = () => {
        cache.push({ id: _uid(), hora: '12:00', entrenadorId: (entrenadores()[0] || {}).id || null, cupo: 8, activo: true });
        _commit();
    };
    const actualizar = (id, campos) => { const b = cache.find(x => x.id === id); if (b) { Object.assign(b, campos); _commit(); } };
    const eliminar = (id) => { cache = cache.filter(x => x.id !== id); _commit(); };

    return { getBloques, bloquesActivos, bloquePorHora, entrenadores, entrenadorNombre, ocupacion, agregar, actualizar, eliminar };
})();


// ============================================================
// Render de la sección "Horarios" del DASHBOARD (demo.html).
// Admin: edita bloques. Entrenador: solo lectura. Ambos ven reservas de hoy.
// ============================================================
function renderizarHorariosAdmin() {
    const cont = document.getElementById('horarios-contenido');
    if (!cont) return;

    const esAdmin = (typeof rolDemo === 'undefined') || rolDemo === 'admin';
    const hoy = Acceso.hoyISO();
    const hoyLindo = hoy.split('-').reverse().join('/');
    const bloques = Horarios.getBloques().sort((a, b) => a.hora.localeCompare(b.hora));
    const staff = Horarios.entrenadores();
    const _esc = (s) => (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s ?? '');

    // --- Tabla de configuración ---
    const filas = bloques.map(b => {
        const ocup = Horarios.ocupacion(b.hora, hoy);
        const cupoCls = ocup >= b.cupo ? 'text-rose-400' : 'text-emerald-400';
        if (esAdmin) {
            const opts = staff.map(s => `<option value="${s.id}" ${s.id === b.entrenadorId ? 'selected' : ''}>${_esc(s.nombre)}</option>`).join('');
            return `<tr class="border-b border-slate-900">
                <td class="p-2"><input type="time" value="${b.hora}" onchange="Horarios.actualizar('${b.id}',{hora:this.value}); renderizarHorariosAdmin();" class="bg-black border border-slate-800 rounded p-1 text-white text-xs"></td>
                <td class="p-2"><select onchange="Horarios.actualizar('${b.id}',{entrenadorId:this.value})" class="bg-black border border-slate-800 rounded p-1 text-white text-xs">${opts}</select></td>
                <td class="p-2"><input type="number" min="1" value="${b.cupo}" onchange="Horarios.actualizar('${b.id}',{cupo:parseInt(this.value)||1}); renderizarHorariosAdmin();" class="bg-black border border-slate-800 rounded p-1 text-white text-xs w-16"></td>
                <td class="p-2 text-center"><input type="checkbox" ${b.activo ? 'checked' : ''} onchange="Horarios.actualizar('${b.id}',{activo:this.checked}); renderizarHorariosAdmin();" class="accent-emerald-500 w-4 h-4"></td>
                <td class="p-2 text-center text-xs font-bold ${cupoCls}">${ocup}/${b.cupo}</td>
                <td class="p-2 text-right"><button onclick="if(confirm('¿Eliminar este bloque?')){Horarios.eliminar('${b.id}');renderizarHorariosAdmin();}" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
        }
        return `<tr class="border-b border-slate-900">
            <td class="p-2 text-white text-xs font-bold">${b.hora}</td>
            <td class="p-2 text-slate-300 text-xs">${_esc(Horarios.entrenadorNombre(b.entrenadorId))}</td>
            <td class="p-2 text-slate-300 text-xs">${b.cupo}</td>
            <td class="p-2 text-center text-xs">${b.activo ? '<span class="text-emerald-400 font-bold">Activo</span>' : '<span class="text-slate-500">Inactivo</span>'}</td>
            <td class="p-2 text-center text-xs font-bold ${cupoCls}">${ocup}/${b.cupo}</td>
            <td></td>
        </tr>`;
    }).join('');

    const tabla = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-x-auto">
            <div class="flex items-center justify-between mb-3 gap-2">
                <h3 class="font-black text-white">Bloques ${esAdmin ? '(editables)' : '(solo lectura)'}</h3>
                ${esAdmin ? `<button onclick="Horarios.agregar(); renderizarHorariosAdmin();" class="text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl hover:border-emerald-500/60 transition whitespace-nowrap"><i class="fa-solid fa-plus"></i> Agregar bloque</button>` : ''}
            </div>
            <table class="w-full text-left min-w-[420px]">
                <thead><tr class="text-[10px] uppercase text-slate-500">
                    <th class="p-2">Hora</th><th class="p-2">Entrenador</th><th class="p-2">Cupo</th>
                    <th class="p-2 text-center">Activo</th><th class="p-2 text-center">Reservados hoy</th><th></th>
                </tr></thead>
                <tbody>${filas || '<tr><td colspan="6" class="p-3 text-center text-slate-500 text-sm">Sin bloques. Agregá uno.</td></tr>'}</tbody>
            </table>
        </div>`;

    // --- Reservas de hoy (por bloque activo) ---
    const reservas = Acceso.reservasDelDia(hoy);
    const nombreDe = (cid) => { const c = (typeof clientesData !== 'undefined' ? clientesData : []).find(x => x.id === cid); return c ? `${c.nombre} ${c.apellido}` : cid; };
    const activos = Horarios.bloquesActivos();
    const reservasHtml = activos.map(b => {
        const socios = reservas.filter(r => r.bloque === b.hora);
        const lista = socios.length
            ? socios.map(r => `<span class="inline-block bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 mr-1 mb-1">${_esc(nombreDe(r.clienteId))}</span>`).join('')
            : '<span class="text-slate-500 text-xs">Sin reservas todavía</span>';
        return `<div class="py-2.5 border-b border-slate-900 last:border-0">
            <div class="flex items-center justify-between">
                <p class="font-bold text-white text-sm">${b.hora} · ${_esc(Horarios.entrenadorNombre(b.entrenadorId))}</p>
                <span class="text-xs font-bold ${socios.length >= b.cupo ? 'text-rose-400' : 'text-emerald-400'}">${socios.length}/${b.cupo}</span>
            </div>
            <div class="mt-1">${lista}</div>
        </div>`;
    }).join('');

    const reservasCard = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <h3 class="font-black text-white mb-1">Reservas de hoy · ${hoyLindo}</h3>
            <p class="text-[11px] text-slate-500 mb-2">Los socios reservan desde su portal. Al reservar reciben su QR del día.</p>
            ${reservasHtml || '<p class="text-slate-500 text-sm">No hay bloques activos.</p>'}
        </div>`;

    cont.innerHTML = tabla + '<div class="h-5"></div>' + reservasCard;
}
