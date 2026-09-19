// ============================================================
// config-demo.js — Configuración del gimnasio (DEMO)
// ============================================================
// Sección del dashboard (solo admin) para gestionar:
//   • Planes y sus valores (id, nombre, duración, precio)
//   • Valor de la matrícula (ingreso)
//   • Pagos adicionales (conceptos con valor, para agregar rápido)
//   • Referidos (cuántas personas → cuánto descuento)
//   • Racha & Premios (en qué mes de racha, qué descuento/premio)
//
// Adicionales, Referidos y Racha tienen un botón Activo/Inactivo por fila:
// si está inactivo NO se aplica ni aparece (pero no se borra).
//
// Se guarda en localStorage (gd_config_v1) y CRUZA al portal (los planes).
// Al cargar, los planes guardados reemplazan el array global PLANES para
// que TODO (dashboard + portal) use los mismos. Se resetea con "Reiniciar demo".
// ============================================================

const ConfigGym = (() => {
    const KEY = 'gd_config_v1';

    const _defaults = () => ({
        planes: (typeof PLANES !== 'undefined' ? PLANES.map(p => ({ ...p })) : []),
        matricula: 15000,
        adicionales: [
            { id: 'ad1', concepto: 'Suplementos', valor: 20000, activo: true },
            { id: 'ad2', concepto: 'Personalizado extra', valor: 20000, activo: true },
            { id: 'ad3', concepto: 'Día de invitado', valor: 5000, activo: true }
        ],
        referidos: [
            { id: 'ref1', personas: 1, descuento: 5000, activo: true },
            { id: 'ref2', personas: 3, descuento: 15000, activo: true },
            { id: 'ref3', personas: 5, descuento: 30000, activo: true }
        ],
        rachaPremios: [
            { mes: 5, premio: 5000, activo: true },
            { mes: 10, premio: 10000, activo: true },
            { mes: 15, premio: 15000, activo: true },
            { mes: 20, premio: 'GRATIS', activo: true }
        ]
    });

    const _uid = (p) => p + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

    const _load = () => {
        try { const r = localStorage.getItem(KEY); if (r) return Object.assign(_defaults(), JSON.parse(r)); } catch (_) { }
        return _defaults();
    };
    let cfg = _load();

    // Normaliza configs viejas: garantiza el flag activo y la lista de referidos.
    const _normalize = () => {
        if (!Array.isArray(cfg.adicionales)) cfg.adicionales = _defaults().adicionales;
        cfg.adicionales.forEach(a => { if (a.activo === undefined) a.activo = true; });
        if (!Array.isArray(cfg.rachaPremios)) cfg.rachaPremios = _defaults().rachaPremios;
        cfg.rachaPremios.forEach(t => { if (t.activo === undefined) t.activo = true; });
        if (!Array.isArray(cfg.referidos)) cfg.referidos = _defaults().referidos;
        cfg.referidos.forEach(r => { if (r.activo === undefined) r.activo = true; if (!r.id) r.id = _uid('ref'); });
    };
    _normalize();

    const _save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) { } };

    // Reemplaza el contenido del array global PLANES con los planes guardados.
    const _aplicarPlanes = () => {
        if (typeof PLANES === 'undefined') return;
        PLANES.length = 0;
        cfg.planes.forEach(p => PLANES.push({ ...p }));
    };
    _aplicarPlanes();

    return {
        getPlanes: () => cfg.planes.map(p => ({ ...p })),
        getMatricula: () => Number(cfg.matricula) || 0,
        getAdicionales: () => cfg.adicionales.map(a => ({ ...a })),
        getReferidos: () => cfg.referidos.map(r => ({ ...r })),
        getRachaPremios: () => cfg.rachaPremios.map(t => ({ ...t })),
        // Descuento/premio por mes de racha (lo usa calcularDescuentoRacha). Solo tramos activos.
        descuentoRacha: (racha) => { const t = cfg.rachaPremios.find(x => x.activo && Number(x.mes) === Number(racha)); return t ? t.premio : 0; },
        // Descuento por N personas referidas: mayor tramo activo con personas <= N.
        descuentoReferidos: (n) => {
            const aplican = cfg.referidos.filter(r => r.activo && Number(r.personas) <= Number(n || 0));
            return aplican.reduce((m, r) => Math.max(m, Number(r.descuento) || 0), 0);
        },

        addPlan: () => { cfg.planes.push({ id: _uid('plan'), nombre: 'Nuevo plan', duracion_meses: 1, precio: 0 }); _save(); _aplicarPlanes(); },
        updatePlan: (id, campos) => { const p = cfg.planes.find(x => x.id === id); if (p) { Object.assign(p, campos); _save(); _aplicarPlanes(); } },
        removePlan: (id) => { cfg.planes = cfg.planes.filter(x => x.id !== id); _save(); _aplicarPlanes(); },

        setMatricula: (v) => { cfg.matricula = Number(v) || 0; _save(); },

        addAdicional: () => { cfg.adicionales.push({ id: _uid('ad'), concepto: 'Nuevo cargo', valor: 0, activo: true }); _save(); },
        updateAdicional: (id, campos) => { const a = cfg.adicionales.find(x => x.id === id); if (a) { Object.assign(a, campos); _save(); } },
        removeAdicional: (id) => { cfg.adicionales = cfg.adicionales.filter(x => x.id !== id); _save(); },

        addReferido: () => { cfg.referidos.push({ id: _uid('ref'), personas: 1, descuento: 0, activo: true }); _save(); },
        updateReferido: (id, campos) => { const r = cfg.referidos.find(x => x.id === id); if (r) { Object.assign(r, campos); _save(); } },
        removeReferido: (id) => { cfg.referidos = cfg.referidos.filter(x => x.id !== id); _save(); },

        addPremio: () => { cfg.rachaPremios.push({ mes: 1, premio: 0, activo: true }); _save(); },
        updatePremio: (i, campos) => { if (cfg.rachaPremios[i]) { Object.assign(cfg.rachaPremios[i], campos); _save(); } },
        removePremio: (i) => { cfg.rachaPremios.splice(i, 1); _save(); }
    };
})();


// ============================================================
// Render de la sección "Configuración" del dashboard (demo.html)
// ============================================================
function _cfgEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s ?? ''); }
function _cfgMoney(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }

// Botón Activo / Inactivo (pill). `onclick` es JS que se ejecuta al tocarlo.
function _cfgToggle(activo, onclick) {
    return activo
        ? `<button onclick="${onclick}" title="Tocar para desactivar" class="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 hover:brightness-110 whitespace-nowrap"><i class="fa-solid fa-circle-check"></i> Activo</button>`
        : `<button onclick="${onclick}" title="Tocar para activar" class="text-[10px] font-black px-2.5 py-1 rounded-lg bg-slate-700/30 text-slate-400 border border-slate-700 hover:brightness-110 whitespace-nowrap"><i class="fa-regular fa-circle"></i> Inactivo</button>`;
}

function renderizarConfig() {
    const cont = document.getElementById('config-contenido');
    if (!cont) return;

    // --- Planes ---
    const planes = ConfigGym.getPlanes();
    const filasPlanes = planes.map(p => `
        <tr class="border-b border-slate-900">
            <td class="p-2"><input type="text" value="${_cfgEsc(p.nombre)}" onchange="ConfigGym.updatePlan('${p.id}',{nombre:this.value}); refrescarPlanesUI();" class="bg-black border border-slate-800 rounded p-1 text-white text-xs w-40"></td>
            <td class="p-2"><input type="number" min="1" value="${p.duracion_meses}" onchange="ConfigGym.updatePlan('${p.id}',{duracion_meses:parseInt(this.value)||1}); refrescarPlanesUI();" class="bg-black border border-slate-800 rounded p-1 text-white text-xs w-16"></td>
            <td class="p-2"><input type="number" min="0" value="${p.precio}" onchange="ConfigGym.updatePlan('${p.id}',{precio:parseInt(this.value)||0}); refrescarPlanesUI();" class="bg-black border border-slate-800 rounded p-1 text-emerald-400 font-bold text-xs w-24"></td>
            <td class="p-2 text-right"><button onclick="if(confirm('¿Eliminar el plan «${_cfgEsc(p.nombre)}»?')){ConfigGym.removePlan('${p.id}'); refrescarPlanesUI(); renderizarConfig();}" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('');

    const cardPlanes = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-x-auto">
            <div class="flex items-center justify-between mb-3 gap-2">
                <h3 class="font-black text-white"><i class="fa-solid fa-tags text-cyan-400"></i> Planes y valores</h3>
                <button onclick="ConfigGym.addPlan(); refrescarPlanesUI(); renderizarConfig();" class="text-xs font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-3 py-1.5 rounded-xl hover:border-cyan-500/60 whitespace-nowrap"><i class="fa-solid fa-plus"></i> Agregar plan</button>
            </div>
            <table class="w-full text-left min-w-[420px]">
                <thead><tr class="text-[10px] uppercase text-slate-500"><th class="p-2">Nombre</th><th class="p-2">Duración (meses)</th><th class="p-2">Precio</th><th></th></tr></thead>
                <tbody>${filasPlanes || '<tr><td colspan="4" class="p-3 text-center text-slate-500 text-sm">Sin planes.</td></tr>'}</tbody>
            </table>
            <p class="text-[10px] text-slate-500 mt-2">Los planes se usan en el registro de socios, la renovación y el portal.</p>
        </div>`;

    // --- Matrícula ---
    const cardMatricula = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <h3 class="font-black text-white mb-2"><i class="fa-solid fa-id-card-clip text-amber-400"></i> Matrícula (valor de ingreso)</h3>
            <div class="flex items-center gap-3">
                <span class="text-slate-400 text-sm">$</span>
                <input type="number" min="0" value="${ConfigGym.getMatricula()}" onchange="ConfigGym.setMatricula(this.value)" class="bg-black border border-slate-800 rounded-xl p-2.5 text-emerald-400 font-black w-40">
            </div>
            <p class="text-[10px] text-slate-500 mt-2">Se usa como valor por defecto de la matrícula al registrar un socio o cobrar un pago.</p>
        </div>`;

    // --- Pagos adicionales ---
    const adic = ConfigGym.getAdicionales();
    const filasAdic = adic.map(a => `
        <tr class="border-b border-slate-900 ${a.activo ? '' : 'opacity-50'}">
            <td class="p-2"><input type="text" value="${_cfgEsc(a.concepto)}" onchange="ConfigGym.updateAdicional('${a.id}',{concepto:this.value})" class="bg-black border border-slate-800 rounded p-1 text-white text-xs w-40"></td>
            <td class="p-2"><input type="number" min="0" value="${a.valor}" onchange="ConfigGym.updateAdicional('${a.id}',{valor:parseInt(this.value)||0})" class="bg-black border border-slate-800 rounded p-1 text-emerald-400 font-bold text-xs w-24"></td>
            <td class="p-2">${_cfgToggle(a.activo, `ConfigGym.updateAdicional('${a.id}',{activo:${!a.activo}}); renderizarConfig();`)}</td>
            <td class="p-2 text-right"><button onclick="ConfigGym.removeAdicional('${a.id}'); renderizarConfig();" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('');

    const cardAdic = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-x-auto">
            <div class="flex items-center justify-between mb-3 gap-2">
                <h3 class="font-black text-white"><i class="fa-solid fa-cart-plus text-purple-400"></i> Pagos adicionales</h3>
                <button onclick="ConfigGym.addAdicional(); renderizarConfig();" class="text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded-xl hover:border-purple-500/60 whitespace-nowrap"><i class="fa-solid fa-plus"></i> Agregar</button>
            </div>
            <table class="w-full text-left min-w-[380px]">
                <thead><tr class="text-[10px] uppercase text-slate-500"><th class="p-2">Concepto</th><th class="p-2">Valor</th><th class="p-2">Estado</th><th></th></tr></thead>
                <tbody>${filasAdic || '<tr><td colspan="4" class="p-3 text-center text-slate-500 text-sm">Sin cargos adicionales.</td></tr>'}</tbody>
            </table>
            <p class="text-[10px] text-slate-500 mt-2">Aparecen como botones de "agregado rápido" en la pestaña Pagos del expediente. Solo los <b>Activos</b> se muestran.</p>
        </div>`;

    // --- Referidos ---
    const refs = ConfigGym.getReferidos();
    const filasRef = refs.map(r => `
        <tr class="border-b border-slate-900 ${r.activo ? '' : 'opacity-50'}">
            <td class="p-2"><input type="number" min="1" value="${r.personas}" onchange="ConfigGym.updateReferido('${r.id}',{personas:parseInt(this.value)||1})" class="bg-black border border-slate-800 rounded p-1 text-cyan-400 font-bold text-xs w-16"></td>
            <td class="p-2"><input type="number" min="0" value="${r.descuento}" onchange="ConfigGym.updateReferido('${r.id}',{descuento:parseInt(this.value)||0})" class="bg-black border border-slate-800 rounded p-1 text-emerald-400 font-bold text-xs w-24"></td>
            <td class="p-2">${_cfgToggle(r.activo, `ConfigGym.updateReferido('${r.id}',{activo:${!r.activo}}); renderizarConfig();`)}</td>
            <td class="p-2 text-right"><button onclick="ConfigGym.removeReferido('${r.id}'); renderizarConfig();" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('');

    const cardRef = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-x-auto">
            <div class="flex items-center justify-between mb-3 gap-2">
                <h3 class="font-black text-white"><i class="fa-solid fa-user-group text-teal-400"></i> Referidos (descuentos)</h3>
                <button onclick="ConfigGym.addReferido(); renderizarConfig();" class="text-xs font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30 px-3 py-1.5 rounded-xl hover:border-teal-500/60 whitespace-nowrap"><i class="fa-solid fa-plus"></i> Agregar</button>
            </div>
            <table class="w-full text-left min-w-[380px]">
                <thead><tr class="text-[10px] uppercase text-slate-500"><th class="p-2">Personas referidas</th><th class="p-2">Descuento</th><th class="p-2">Estado</th><th></th></tr></thead>
                <tbody>${filasRef || '<tr><td colspan="4" class="p-3 text-center text-slate-500 text-sm">Sin tramos de referidos.</td></tr>'}</tbody>
            </table>
            <p class="text-[10px] text-slate-500 mt-2">Definí cuántas personas trajo el socio y el descuento correspondiente. Aparecen como botones en la pestaña Pagos (solo los <b>Activos</b>).</p>
        </div>`;

    // --- Racha & Premios ---
    const premios = ConfigGym.getRachaPremios();
    const filasPrem = premios.map((t, i) => `
        <tr class="border-b border-slate-900 ${t.activo ? '' : 'opacity-50'}">
            <td class="p-2"><input type="number" min="1" value="${t.mes}" onchange="ConfigGym.updatePremio(${i},{mes:parseInt(this.value)||1})" class="bg-black border border-slate-800 rounded p-1 text-amber-400 font-bold text-xs w-16"></td>
            <td class="p-2"><input type="text" value="${_cfgEsc(t.premio)}" onchange="ConfigGym.updatePremio(${i},{premio: /^\\s*gratis\\s*$/i.test(this.value)?'GRATIS':(parseInt(this.value)||0)}); renderizarConfig();" placeholder="Monto o GRATIS" class="bg-black border border-slate-800 rounded p-1 text-emerald-400 font-bold text-xs w-28"></td>
            <td class="p-2">${_cfgToggle(t.activo, `ConfigGym.updatePremio(${i},{activo:${!t.activo}}); renderizarConfig();`)}</td>
            <td class="p-2 text-right"><button onclick="ConfigGym.removePremio(${i}); renderizarConfig();" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('');

    const cardPrem = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-x-auto">
            <div class="flex items-center justify-between mb-3 gap-2">
                <h3 class="font-black text-white"><i class="fa-solid fa-fire text-rose-400"></i> Racha & Premios</h3>
                <button onclick="ConfigGym.addPremio(); renderizarConfig();" class="text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl hover:border-rose-500/60 whitespace-nowrap"><i class="fa-solid fa-plus"></i> Agregar</button>
            </div>
            <table class="w-full text-left min-w-[380px]">
                <thead><tr class="text-[10px] uppercase text-slate-500"><th class="p-2">Mes de racha</th><th class="p-2">Premio / descuento</th><th class="p-2">Estado</th><th></th></tr></thead>
                <tbody>${filasPrem || '<tr><td colspan="4" class="p-3 text-center text-slate-500 text-sm">Sin premios.</td></tr>'}</tbody>
            </table>
            <p class="text-[10px] text-slate-500 mt-2">Al llegar a ese mes de racha, el socio recibe ese descuento al renovar (escribí "GRATIS" para plan gratis). Solo los tramos <b>Activos</b> se aplican.</p>
        </div>`;

    cont.innerHTML = `<div class="grid lg:grid-cols-2 gap-5">${cardPlanes}${cardMatricula}${cardAdic}${cardRef}${cardPrem}</div>`;
}

// Refresca los selects de planes del dashboard tras editar planes.
function refrescarPlanesUI() {
    try {
        if (typeof PLANES_GYM !== 'undefined' && typeof ConfigGym !== 'undefined') PLANES_GYM = ConfigGym.getPlanes();
        if (typeof poblarSelectPlanes === 'function') poblarSelectPlanes();
    } catch (_) { }
}

// Botones de "agregado rápido" (matrícula + adicionales activos + referidos activos)
// en la pestaña Pagos del expediente.
function renderizarQuickAdicionales() {
    const cont = document.getElementById('quick-adicionales');
    if (!cont || typeof ConfigGym === 'undefined') return;
    const chips = [];

    const mat = ConfigGym.getMatricula();
    if (mat > 0) chips.push(`<button onclick="agregarAdicionalExpediente('Matrícula (ingreso)', ${mat})" class="text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-xl hover:border-amber-500/60"><i class="fa-solid fa-plus"></i> Matrícula ${_cfgMoney(mat)}</button>`);

    ConfigGym.getAdicionales().filter(a => a.activo).forEach(a => {
        chips.push(`<button onclick="agregarAdicionalExpediente('${_cfgEsc(a.concepto).replace(/'/g, "\\'")}', ${a.valor})" class="text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded-xl hover:border-purple-500/60"><i class="fa-solid fa-plus"></i> ${_cfgEsc(a.concepto)} ${_cfgMoney(a.valor)}</button>`);
    });

    ConfigGym.getReferidos().filter(r => r.activo && Number(r.descuento) > 0).forEach(r => {
        const concepto = `Descuento ${r.personas} referido${r.personas == 1 ? '' : 's'}`;
        chips.push(`<button onclick="agregarAdicionalExpediente('${concepto}', ${-Math.abs(r.descuento)})" class="text-xs font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30 px-3 py-1.5 rounded-xl hover:border-teal-500/60"><i class="fa-solid fa-minus"></i> ${concepto} −${_cfgMoney(r.descuento)}</button>`);
    });

    cont.innerHTML = chips.length
        ? `<p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 w-full">Agregado rápido</p><div class="flex flex-wrap gap-2">${chips.join('')}</div>`
        : '';
}

async function agregarAdicionalExpediente(concepto, valor) {
    const clienteId = document.getElementById('edit-id').value;
    if (!clienteId) return;
    await Api.agregarPago(clienteId, { fecha: fechaHoyISO(), concepto, monto: valor, metodo: 'Efectivo' });
    await recargarClientes();
    abrirModalEditarCliente(clienteId);
    cambiarTabExpediente('tab-pagos');
}
