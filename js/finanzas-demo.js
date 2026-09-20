// ============================================================
// finanzas-demo.js — Gastos & Caja (egresos + resumen mensual)
// ============================================================
// Sección del dashboard para registrar EGRESOS (servicios básicos,
// insumos, sueldos, arriendo, mantención...) y ver la CAJA del mes:
// Ingresos (pagos de socios) vs Egresos = Resultado. Navegable por mes.
// Los egresos viven en memoria (EGRESOS_DEMO) y se resetean al recargar.
// ============================================================

let _cajaMes = null; // Date apuntando al día 1 del mes visto

const _MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const _METODOS_EGRESO = ['Efectivo', 'Transferencia', 'Débito', 'Crédito'];

function _cajaYM(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function _cajaMoney(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }
function _cajaEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s ?? ''); }
function _cajaHoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Ingresos (pagos de socios) del mes YYYY-MM, leídos de clientesData.
function _ingresosDelMes(ym) {
    let t = 0;
    (typeof clientesData !== 'undefined' ? clientesData : []).forEach(c => {
        (c.pagos || []).forEach(p => { if (String(p.fecha).slice(0, 7) === ym) t += Number(p.monto) || 0; });
    });
    return t;
}

async function renderizarCaja() {
    const cont = document.getElementById('caja-contenido');
    if (!cont) return;
    if (!_cajaMes) _cajaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const ym = _cajaYM(_cajaMes);
    const label = `${_MESES_ES[_cajaMes.getMonth()]} ${_cajaMes.getFullYear()}`;
    const esMesActual = ym === _cajaYM(new Date());

    const ingresos = _ingresosDelMes(ym);
    const todos = await Api.getEgresos();
    const egresosMes = todos.filter(e => String(e.fecha).slice(0, 7) === ym);
    const totalEgresos = egresosMes.reduce((s, e) => s + (Number(e.monto) || 0), 0);
    const resultado = ingresos - totalEgresos;

    // Totales por categoría
    const porCat = {};
    egresosMes.forEach(e => { porCat[e.categoria] = (porCat[e.categoria] || 0) + (Number(e.monto) || 0); });
    const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);

    const catColores = {
        'Servicios básicos': 'text-cyan-400', 'Insumos': 'text-purple-400', 'Sueldos': 'text-amber-400',
        'Arriendo': 'text-rose-400', 'Mantención': 'text-emerald-400', 'Otros': 'text-slate-400'
    };
    const catList = (typeof CATEGORIAS_EGRESO !== 'undefined') ? CATEGORIAS_EGRESO : ['Servicios básicos', 'Insumos', 'Sueldos', 'Arriendo', 'Mantención', 'Otros'];

    // --- Navegador de mes + 3 tarjetas ---
    const resColor = resultado >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const cabecera = `
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center gap-2">
                <button onclick="cajaMesDelta(-1)" class="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-white hover:border-slate-600"><i class="fa-solid fa-chevron-left"></i></button>
                <span class="text-white font-black capitalize min-w-[150px] text-center">${label}</span>
                <button onclick="cajaMesDelta(1)" class="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-white hover:border-slate-600"><i class="fa-solid fa-chevron-right"></i></button>
                ${!esMesActual ? '<button onclick="cajaMesHoy()" class="ml-1 text-xs font-bold bg-slate-800 text-white px-3 py-2 rounded-xl">Hoy</button>' : ''}
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
                <p class="text-[11px] text-slate-400 flex items-center gap-1"><i class="fa-solid fa-arrow-down text-emerald-400"></i> Ingresos del mes</p>
                <p class="text-2xl font-black text-emerald-400 mt-1">${_cajaMoney(ingresos)}</p>
            </div>
            <div class="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
                <p class="text-[11px] text-slate-400 flex items-center gap-1"><i class="fa-solid fa-arrow-up text-rose-400"></i> Egresos del mes</p>
                <p class="text-2xl font-black text-rose-400 mt-1">${_cajaMoney(totalEgresos)}</p>
            </div>
            <div class="bg-slate-900 border ${resultado >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'} rounded-2xl p-4">
                <p class="text-[11px] text-slate-400 flex items-center gap-1"><i class="fa-solid fa-scale-balanced ${resColor}"></i> Resultado (caja)</p>
                <p class="text-2xl font-black ${resColor} mt-1">${_cajaMoney(resultado)}</p>
            </div>
        </div>`;

    // --- Egresos por categoría ---
    const categoriaCard = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <h3 class="font-black text-white mb-2">Egresos por categoría</h3>
            ${cats.length ? cats.map(([cat, mto]) => {
                const pct = totalEgresos ? Math.round(mto / totalEgresos * 100) : 0;
                return `<div class="mb-2">
                    <div class="flex justify-between text-xs mb-1"><span class="${catColores[cat] || 'text-slate-300'} font-bold">${_cajaEsc(cat)}</span><span class="text-slate-300 font-bold">${_cajaMoney(mto)} · ${pct}%</span></div>
                    <div class="h-1.5 bg-slate-900 rounded-full overflow-hidden"><div class="h-full bg-slate-600" style="width:${pct}%"></div></div>
                </div>`;
            }).join('') : '<p class="text-slate-500 text-sm">Sin egresos este mes.</p>'}
        </div>`;

    // --- Tabla editable de egresos del mes ---
    const filas = egresosMes.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map(e => {
        const optCat = catList.map(c => `<option value="${c}" ${c === e.categoria ? 'selected' : ''}>${_cajaEsc(c)}</option>`).join('');
        const optMet = _METODOS_EGRESO.map(m => `<option value="${m}" ${m === e.metodo ? 'selected' : ''}>${m}</option>`).join('');
        return `<tr class="border-b border-slate-900">
            <td class="p-2"><input type="date" value="${e.fecha}" onchange="actualizarEgresoDemo('${e.id}','fecha',this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs"></td>
            <td class="p-2"><select onchange="actualizarEgresoDemo('${e.id}','categoria',this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs">${optCat}</select></td>
            <td class="p-2"><input type="text" value="${_cajaEsc(e.descripcion).replace(/"/g, '&quot;')}" onchange="actualizarEgresoDemo('${e.id}','descripcion',this.value)" placeholder="Detalle..." class="bg-black border border-slate-800 rounded p-1 text-slate-200 text-xs w-40"></td>
            <td class="p-2"><input type="number" min="0" value="${e.monto}" onchange="actualizarEgresoDemo('${e.id}','monto',this.value)" class="bg-black border border-slate-800 rounded p-1 text-rose-400 font-bold text-xs w-24"></td>
            <td class="p-2"><select onchange="actualizarEgresoDemo('${e.id}','metodo',this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs">${optMet}</select></td>
            <td class="p-2 text-right"><button onclick="eliminarEgresoDemo('${e.id}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`;
    }).join('');

    const tablaCard = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-x-auto">
            <div class="flex items-center justify-between mb-3 gap-2">
                <h3 class="font-black text-white">Egresos de ${label}</h3>
                <button onclick="agregarEgresoDemo()" class="text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl hover:border-rose-500/60 transition whitespace-nowrap"><i class="fa-solid fa-plus"></i> Registrar egreso</button>
            </div>
            <table class="w-full text-left min-w-[560px]">
                <thead><tr class="text-[10px] uppercase text-slate-500">
                    <th class="p-2">Fecha</th><th class="p-2">Categoría</th><th class="p-2">Descripción</th><th class="p-2">Monto</th><th class="p-2">Método</th><th></th>
                </tr></thead>
                <tbody>${filas || '<tr><td colspan="6" class="p-3 text-center text-slate-500 text-sm">Sin egresos este mes. Registrá uno.</td></tr>'}</tbody>
            </table>
        </div>`;

    cont.innerHTML = cabecera + '<div class="h-4"></div>' + categoriaCard + '<div class="h-4"></div>' + tablaCard;
}

// --- Navegación de mes ---
function cajaMesDelta(n) { if (!_cajaMes) _cajaMes = new Date(); _cajaMes = new Date(_cajaMes.getFullYear(), _cajaMes.getMonth() + n, 1); renderizarCaja(); }
function cajaMesHoy() { _cajaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderizarCaja(); }

// --- CRUD de egresos ---
async function agregarEgresoDemo() {
    const ym = _cajaYM(_cajaMes);
    const fecha = (ym === _cajaYM(new Date())) ? _cajaHoyISO() : `${ym}-01`;
    await Api.agregarEgreso({ fecha, categoria: 'Servicios básicos', descripcion: '', monto: 0, metodo: 'Efectivo' });
    await renderizarCaja();
}
async function actualizarEgresoDemo(id, campo, valor) {
    await Api.actualizarEgreso(id, { [campo]: valor });
    await renderizarCaja();
}
async function eliminarEgresoDemo(id) {
    await Api.eliminarEgreso(id);
    await renderizarCaja();
}
