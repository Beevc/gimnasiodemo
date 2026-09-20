// ============================================================
// horarios-demo.js — Horarios semanales del gimnasio + cupos (DEMO)
// ============================================================
// El admin configura BLOQUES (hora · entrenador · cupo) y elige en qué
// DÍAS de la semana corre cada bloque (vista semanal Lun→Dom). Además puede
// marcar un día como FERIADO con un mensaje (queda cerrado ese día).
//
// Modelo (localStorage gd_horarios_v1):
//   { bloques: [ {id, hora, entrenadorId, cupo, dias:[1..7]} ],
//     dias:    { '1':{feriado,mensaje}, ... '7':{...} } }   // 1=Lun ... 7=Dom
//
// El portal usa bloquesActivos() (los del día de HOY, salvo feriado) y
// feriadoHoy() para avisar cuando está cerrado. La ocupación sale de las
// reservas del día (Acceso.reservasDelDia).
// ============================================================

const Horarios = (() => {
    const KEY = 'gd_horarios_v1';

    // Días de la semana (1=Lunes ... 7=Domingo), para la vista semanal.
    const DIAS_META = [
        { i: 1, nombre: 'Lunes', abrev: 'Lun' },
        { i: 2, nombre: 'Martes', abrev: 'Mar' },
        { i: 3, nombre: 'Miércoles', abrev: 'Mié' },
        { i: 4, nombre: 'Jueves', abrev: 'Jue' },
        { i: 5, nombre: 'Viernes', abrev: 'Vie' },
        { i: 6, nombre: 'Sábado', abrev: 'Sáb' },
        { i: 7, nombre: 'Domingo', abrev: 'Dom' }
    ];

    // Config inicial: bloques Lun–Sáb; Domingo sin clases; sin feriados.
    const _defaults = () => ({
        bloques: [
            { id: 'b1', hora: '07:00', entrenadorId: 'st2', cupo: 8,  dias: [1, 2, 3, 4, 5, 6] },
            { id: 'b2', hora: '08:30', entrenadorId: 'st3', cupo: 8,  dias: [1, 2, 3, 4, 5] },
            { id: 'b3', hora: '10:00', entrenadorId: 'st2', cupo: 6,  dias: [1, 2, 3, 4, 5, 6] },
            { id: 'b4', hora: '12:00', entrenadorId: 'st3', cupo: 6,  dias: [1, 2, 3, 4, 5] },
            { id: 'b5', hora: '18:30', entrenadorId: 'st2', cupo: 12, dias: [1, 2, 3, 4, 5] },
            { id: 'b6', hora: '20:00', entrenadorId: 'st3', cupo: 10, dias: [1, 2, 3, 4, 5] }
        ],
        dias: { '1': f(), '2': f(), '3': f(), '4': f(), '5': f(), '6': f(), '7': f() }
    });
    function f() { return { feriado: false, mensaje: '' }; }

    const _load = () => { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (_) { return null; } };
    const _save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) { } };

    // Carga + migración desde el formato viejo (array plano de bloques con "activo").
    let cache = _load();
    if (!cache) {
        cache = _defaults();
    } else if (Array.isArray(cache)) {
        cache = {
            bloques: cache.map(b => ({ id: b.id, hora: b.hora, entrenadorId: b.entrenadorId, cupo: b.cupo, dias: b.activo === false ? [] : [1, 2, 3, 4, 5, 6] })),
            dias: _defaults().dias
        };
    }
    // Normaliza por si faltan piezas.
    if (!Array.isArray(cache.bloques)) cache.bloques = _defaults().bloques;
    if (!cache.dias) cache.dias = _defaults().dias;
    DIAS_META.forEach(d => { if (!cache.dias[d.i]) cache.dias[d.i] = f(); });
    cache.bloques.forEach(b => { if (!Array.isArray(b.dias)) b.dias = [1, 2, 3, 4, 5, 6]; });
    _save();

    const _uid = () => 'b_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

    // Índice de día de HOY (1=Lun ... 7=Dom) desde la fecha real.
    const diaHoyIdx = () => { const js = new Date().getDay(); return js === 0 ? 7 : js; };

    const entrenadores = () => (typeof STAFF_DEMO !== 'undefined' ? STAFF_DEMO : []);
    // El entrenador es opcional: sin asignar => "Sin entrenador".
    const entrenadorNombre = (id) => { if (!id) return 'Sin entrenador'; const s = entrenadores().find(x => x.id === id); return s ? s.nombre : '—'; };

    const getBloques = () => cache.bloques.map(b => ({ ...b, dias: [...b.dias] }));
    const getDiaEstado = (idx) => ({ ...(cache.dias[idx] || f()) });

    // Bloques que corren un día dado (vacío si el día es feriado). Ordenados por hora.
    const bloquesDeDia = (idx) => {
        if ((cache.dias[idx] || {}).feriado) return [];
        return cache.bloques.filter(b => b.dias.includes(Number(idx))).slice().sort((a, b) => a.hora.localeCompare(b.hora));
    };

    // Bloques activos HOY (respeta feriado). Lo usa el portal.
    const bloquesActivos = () => bloquesDeDia(diaHoyIdx());
    const bloquePorHora = (hora) => cache.bloques.find(b => b.hora === hora) || null;

    // Si HOY es feriado devuelve { mensaje }, si no null.
    const feriadoHoy = () => { const d = cache.dias[diaHoyIdx()] || {}; return d.feriado ? { mensaje: d.mensaje || '' } : null; };

    // Cuántos socios reservaron ese bloque en esa fecha (hoy por defecto).
    const ocupacion = (hora, fechaISO) => {
        const fe = fechaISO || Acceso.hoyISO();
        return Acceso.reservasDelDia(fe).filter(r => r.bloque === hora).length;
    };

    // --- Mutaciones (admin) ---
    const agregar = () => {
        cache.bloques.push({ id: _uid(), hora: '12:00', entrenadorId: null, cupo: 8, dias: [1, 2, 3, 4, 5] });
        _save();
    };
    const actualizar = (id, campos) => { const b = cache.bloques.find(x => x.id === id); if (b) { Object.assign(b, campos); _save(); } };
    const eliminar = (id) => { cache.bloques = cache.bloques.filter(x => x.id !== id); _save(); };

    // Prende/apaga un bloque en un día (para limitar las horas de un día).
    const toggleDia = (id, idx) => {
        const b = cache.bloques.find(x => x.id === id); if (!b) return;
        idx = Number(idx);
        b.dias = b.dias.includes(idx) ? b.dias.filter(d => d !== idx) : [...b.dias, idx].sort((a, c) => a - c);
        _save();
    };

    const setFeriado = (idx, feriado) => { cache.dias[idx] = { ...(cache.dias[idx] || f()), feriado: !!feriado }; _save(); };
    const setMensajeDia = (idx, mensaje) => { cache.dias[idx] = { ...(cache.dias[idx] || f()), mensaje: String(mensaje || '') }; _save(); };

    return {
        DIAS_META, diaHoyIdx,
        getBloques, getDiaEstado, bloquesDeDia, bloquesActivos, bloquePorHora, feriadoHoy,
        entrenadores, entrenadorNombre, ocupacion,
        agregar, actualizar, eliminar, toggleDia, setFeriado, setMensajeDia
    };
})();


// ============================================================
// Render de la sección "Horarios" del DASHBOARD (demo.html).
// Vista semanal (horas × días). Admin edita; entrenador ve solo lectura.
// ============================================================
function renderizarHorariosAdmin() {
    const cont = document.getElementById('horarios-contenido');
    if (!cont) return;

    const esAdmin = (typeof rolDemo === 'undefined') || rolDemo === 'admin';
    const _esc = (s) => (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s ?? '');
    const hoy = Acceso.hoyISO();
    const hoyLindo = hoy.split('-').reverse().join('/');
    const hoyIdx = Horarios.diaHoyIdx();
    const DIAS = Horarios.DIAS_META;
    const staff = Horarios.entrenadores();
    const bloques = Horarios.getBloques().sort((a, b) => a.hora.localeCompare(b.hora));

    // --- Encabezado de días (con toggle Feriado + mensaje) ---
    const thDias = DIAS.map(d => {
        const est = Horarios.getDiaEstado(d.i);
        const esHoy = d.i === hoyIdx;
        const base = `text-center align-top p-1.5 ${esHoy ? 'bg-emerald-500/10' : ''}`;
        const nombre = `<div class="text-[11px] font-black ${esHoy ? 'text-emerald-400' : 'text-white'}">${d.abrev}${esHoy ? ' ·hoy' : ''}</div>`;
        if (!esAdmin) {
            const tag = est.feriado ? `<div class="text-[9px] font-bold text-amber-400 mt-0.5">Feriado</div>` : '';
            return `<th class="${base} min-w-[46px]">${nombre}${tag}</th>`;
        }
        const btn = est.feriado
            ? `<button onclick="Horarios.setFeriado(${d.i},false); renderizarHorariosAdmin();" title="Quitar feriado" class="mt-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/50 w-full">Feriado</button>`
            : `<button onclick="Horarios.setFeriado(${d.i},true); renderizarHorariosAdmin();" title="Marcar feriado (cierra el día)" class="mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 w-full hover:text-amber-400 hover:border-amber-500/40">Abierto</button>`;
        const msg = est.feriado
            ? `<input type="text" value="${_esc(est.mensaje)}" placeholder="motivo…" onchange="Horarios.setMensajeDia(${d.i}, this.value); renderizarHorariosAdmin();" class="mt-1 w-full bg-black border border-amber-500/30 rounded px-1 py-0.5 text-[9px] text-amber-300">`
            : '';
        return `<th class="${base} min-w-[60px]">${nombre}${btn}${msg}</th>`;
    }).join('');

    // --- Filas: una por bloque (hora · entrenador · cupo) × 7 días ---
    const filas = bloques.map(b => {
        const ocupHoy = Horarios.ocupacion(b.hora, hoy);
        // Celda izquierda (config del bloque)
        let izq;
        if (esAdmin) {
            const opts = `<option value="" ${!b.entrenadorId ? 'selected' : ''}>Sin entrenador</option>` + staff.map(s => `<option value="${s.id}" ${s.id === b.entrenadorId ? 'selected' : ''}>${_esc(s.nombre)}</option>`).join('');
            izq = `<td class="p-1.5 align-top border-r border-slate-800 sticky left-0 bg-slate-950 z-10">
                <input type="time" value="${b.hora}" onchange="Horarios.actualizar('${b.id}',{hora:this.value}); renderizarHorariosAdmin();" class="bg-black border border-slate-800 rounded p-1 text-white text-xs font-bold w-[92px]">
                <div class="mt-1 flex items-center gap-1">
                    <select onchange="Horarios.actualizar('${b.id}',{entrenadorId:this.value||null})" class="bg-black border border-slate-800 rounded p-1 text-slate-300 text-[11px] max-w-[120px]">${opts}</select>
                </div>
                <div class="mt-1 flex items-center gap-1">
                    <span class="text-[10px] text-slate-500">cupo</span>
                    <input type="number" min="1" value="${b.cupo}" onchange="Horarios.actualizar('${b.id}',{cupo:parseInt(this.value)||1}); renderizarHorariosAdmin();" class="bg-black border border-slate-800 rounded p-1 text-white text-[11px] w-12">
                    <button onclick="if(confirm('¿Eliminar la hora ${b.hora}?')){Horarios.eliminar('${b.id}');renderizarHorariosAdmin();}" title="Eliminar hora" class="ml-auto text-rose-400 hover:text-rose-300 text-xs"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        } else {
            izq = `<td class="p-1.5 align-top border-r border-slate-800 sticky left-0 bg-slate-950 z-10">
                <div class="text-white text-xs font-bold">${b.hora}</div>
                <div class="text-[11px] text-slate-400">${_esc(Horarios.entrenadorNombre(b.entrenadorId))}</div>
                <div class="text-[10px] text-slate-500">cupo ${b.cupo}</div>
            </td>`;
        }
        // Celdas por día
        const celdas = DIAS.map(d => {
            const est = Horarios.getDiaEstado(d.i);
            const esHoy = d.i === hoyIdx;
            const bgHoy = esHoy ? 'bg-emerald-500/5' : '';
            if (est.feriado) {
                return `<td class="text-center p-1 ${bgHoy}"><span class="text-slate-700 text-xs">—</span></td>`;
            }
            const on = b.dias.includes(d.i);
            if (esAdmin) {
                const cls = on
                    ? 'bg-emerald-500 text-black border-emerald-500'
                    : 'bg-slate-900 text-slate-600 border-slate-800 hover:border-slate-600';
                const ico = on ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-plus"></i>';
                return `<td class="text-center p-1 ${bgHoy}"><button onclick="Horarios.toggleDia('${b.id}',${d.i}); renderizarHorariosAdmin();" class="w-7 h-7 rounded-lg border text-[11px] font-bold transition ${cls}">${ico}</button></td>`;
            }
            return `<td class="text-center p-1 ${bgHoy}">${on ? '<span class="text-emerald-400"><i class="fa-solid fa-check"></i></span>' : '<span class="text-slate-700">·</span>'}</td>`;
        }).join('');

        return `<tr class="border-b border-slate-900">${izq}${celdas}</tr>`;
    }).join('');

    const grilla = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div>
                    <h3 class="font-black text-white">Vista semanal ${esAdmin ? '' : '(solo lectura)'}</h3>
                    <p class="text-[11px] text-slate-500">${esAdmin ? 'Tocá cada celda para abrir/cerrar esa hora en ese día. Marcá un día como <b class="text-amber-400">Feriado</b> para cerrarlo con un motivo.' : 'Horarios de la semana.'}</p>
                </div>
                ${esAdmin ? `<button onclick="Horarios.agregar(); renderizarHorariosAdmin();" class="text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl hover:border-emerald-500/60 transition whitespace-nowrap"><i class="fa-solid fa-plus"></i> Agregar hora</button>` : ''}
            </div>
            <div class="overflow-x-auto">
                <table class="text-left border-collapse">
                    <thead><tr class="border-b border-slate-800">
                        <th class="p-1.5 text-[10px] uppercase text-slate-500 sticky left-0 bg-slate-950 z-10 text-left">Hora</th>
                        ${thDias}
                    </tr></thead>
                    <tbody>${filas || `<tr><td colspan="8" class="p-4 text-center text-slate-500 text-sm">Sin horas. Agregá una con "Agregar hora".</td></tr>`}</tbody>
                </table>
            </div>
            <div class="flex items-center gap-4 mt-3 text-[10px] text-slate-500 flex-wrap">
                <span><i class="fa-solid fa-check text-emerald-400"></i> Abierto ese día</span>
                <span><i class="fa-solid fa-plus text-slate-500"></i> Cerrado (tocar para abrir)</span>
                <span class="text-amber-400">Feriado = día cerrado con mensaje</span>
            </div>
        </div>`;

    // --- Reservas de hoy (por bloque activo hoy) ---
    const fer = Horarios.feriadoHoy();
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

    const cuerpoReservas = fer
        ? `<div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-300 text-sm font-bold"><i class="fa-solid fa-calendar-xmark"></i> Hoy es feriado${fer.mensaje ? ' · ' + _esc(fer.mensaje) : ''}. El gimnasio no toma reservas.</div>`
        : (reservasHtml || '<p class="text-slate-500 text-sm">Hoy no hay horas abiertas.</p>');

    const reservasCard = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <h3 class="font-black text-white mb-1">Reservas de hoy · ${hoyLindo}</h3>
            <p class="text-[11px] text-slate-500 mb-2">Los socios reservan desde su portal. Al reservar reciben su QR del día.</p>
            ${cuerpoReservas}
        </div>`;

    cont.innerHTML = grilla + '<div class="h-5"></div>' + reservasCard;
}
