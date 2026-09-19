// ============================================================
// app.js — Lógica de la interfaz (UI)
// ============================================================
// Mismo comportamiento visual que el dashboard original, pero ahora
// cada acción (guardar, editar, borrar, marcar asistencia...) llama
// a Api.* en vez de tocar un array en memoria. Los datos se recargan
// desde Supabase después de cada cambio para que siempre se vea lo
// que realmente quedó guardado en la base de datos.
// ============================================================

let PLANES_GYM = [];
let clientesData = [];
let staffData = [];
let rachaEventos = [];          // historial de rachas perdidas (tabla racha_eventos)
let rachaEventosDisponible = false; // false si la tabla aún no se ha creado en Supabase
let usuarioActual = null;       // usuario logueado (de la sesión de Supabase Auth)

let rachasReseteadasContador = 0; // contador de sesión (ver README para hacerlo persistente)

// Estado de la ruleta de premios
let ruletaParticipantes = [];   // [{ cliente, cumpleMeta }]
let ruletaGanadores = [];       // ids de clientes que ya ganaron (no se repiten)
let ruletaGiroAcumulado = 0;    // grados acumulados de giro visual

// ------------------------------------------------------------
// LOGIN / SESIÓN
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async function () {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errBox = document.getElementById('login-error');
        errBox.classList.add('hidden');
        try {
            await Api.login(email, password);
            await mostrarApp();
        } catch (err) {
            errBox.textContent = 'No se pudo iniciar sesión: ' + err.message;
            errBox.classList.remove('hidden');
        }
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
        await Api.logout();
        location.reload();
    });

    const session = await Api.getSession();
    if (session) {
        await mostrarApp();
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
    }
});

async function mostrarApp() {
    document.getElementById('login-screen').classList.add('hidden');
    const shell = document.getElementById('app-shell');
    shell.classList.remove('hidden');
    // "contents" hace que header/main/modales se comporten como hijos
    // directos del <body> (que es flex flex-col), sin que este wrapper
    // rompa el layout.
    shell.classList.add('contents');
    await inicializarApp();
}

async function inicializarApp() {
    mostrarCargando(true);
    try {
        const sesion = await Api.getSession();
        usuarioActual = sesion ? sesion.user : null;

        PLANES_GYM = await Api.getPlanes();
        staffData = await Api.getStaff();
        await cargarEventosRacha();
        await recargarClientes();

        poblarSelectPlanes();
        renderizarStaff();
        cargarConfigTV();
        inicializarGraficos();
        const fechaInput = document.getElementById('fecha-cierre-mes');
        if (fechaInput) fechaInput.value = fechaHoyISO();
    } catch (err) {
        alert('Error cargando datos desde Supabase: ' + err.message + '\n\nRevisa que hayas configurado js/config.js con tu URL y anon key, y que hayas corrido schema.sql en tu proyecto.');
        console.error(err);
    } finally {
        mostrarCargando(false);
    }
}

function mostrarCargando(activo) {
    const el = document.getElementById('loading-overlay');
    if (!el) return;
    el.classList.toggle('hidden', !activo);
}

// Carga el historial de rachas. Si la tabla todavía no existe en Supabase
// (no se ha corrido la migración), no rompe la app: deja la lista vacía.
async function cargarEventosRacha() {
    try {
        rachaEventos = await Api.getEventosRacha();
        rachaEventosDisponible = true;
    } catch (err) {
        rachaEventos = [];
        rachaEventosDisponible = false;
        console.warn('Tabla racha_eventos no disponible todavía (corre migracion_racha_eventos.sql):', err.message);
    }
}

// Cuando a un cliente se le acaba el plan (la fecha `vence` ya pasó) su
// etiqueta debe cambiar sola de "Al día"/"Pendiente" a "Vencido". Los
// "Congelado" (membresías pausadas) NO vencen. Devuelve los ids que
// cambiaron para poder persistirlos en la base.
// Planes indefinidos (no vencen): ej. "Coach" — gratis y sin vencimiento,
// para que entrenadores participen en los PR de la TV sin afectar finanzas.
function esPlanIndefinido(planId) {
    return planId === 'coach';
}

function aplicarVencimientoAutomatico(clientes) {
    const cambiados = [];
    clientes.forEach(c => {
        if (c.estado === 'Congelado' || c.estado === 'Vencido') return;
        if (esPlanIndefinido(c.planId)) return; // los planes indefinidos nunca vencen
        if (calcularDiasParaVencer(c.vence) < 0) {
            c.estado = 'Vencido';
            cambiados.push(c.id);
        }
    });
    return cambiados;
}

async function recargarClientes() {
    clientesData = await Api.getClientes();
    // Vence automático: pasa a "Vencido" a quienes se les acabó el plan,
    // ANTES de renderizar/filtrar para que todo lo muestre ya corregido.
    const vencidosAuto = aplicarVencimientoAutomatico(clientesData);
    // Persiste el cambio en la base en segundo plano (no bloquea la UI).
    // Una vez guardado quedan "Vencido" y no se vuelven a reescribir.
    if (vencidosAuto.length) {
        Promise.allSettled(
            vencidosAuto.map(id => Api.actualizarCliente(id, { estado: 'Vencido' }))
        ).catch(() => {}); // si falla el guardado, la UI ya quedó correcta igual
    }
    // Respeta el filtro/búsqueda/orden que el staff tenía puesto
    // (si aún no existe el buscador en el DOM, cae a la tabla completa).
    if (document.getElementById('filtro-buscar')) aplicarFiltrosClientes();
    else renderizarTablaAdmin();
    renderizarRenovaciones();
    renderizarAsistenciaMensual();
    renderizarAsistencias();
    renderizarRuleta();
    cargarCumpleanosYAniversarios();
    renderizarHome();
    actualizarResumenCartera();
    actualizarChipIncompletas();
    renderizarMensajesWhatsApp();
    calcularMetricas();
    renderizarDetalleMensual();
    inicializarGraficos();
    renderizarRetencion();
    renderizarAnalitica();
}

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
function calcularDescuentoRacha(racha) {
    // Los premios por racha son configurables desde Configuración (ConfigGym).
    if (typeof ConfigGym !== 'undefined' && ConfigGym.descuentoRacha) return ConfigGym.descuentoRacha(racha);
    if (racha === 5) return 5000;
    if (racha === 10) return 10000;
    if (racha === 15) return 15000;
    if (racha === 20) return "GRATIS";
    return 0;
}

// Meta de asistencias del mes según el plan del cliente:
// planes de 3 días/semana (id que empieza con "3d") -> 12 días,
// el resto (5 días/semana, beta, etc.) -> 20 días.
function metaAsistencia(cliente) {
    const plan = PLANES_GYM.find(p => p.id === cliente.planId);
    const id = (plan && plan.id) ? plan.id : (cliente.planId || '');
    return String(id).startsWith('3d') ? 12 : 20;
}

// Nombre del staff logueado (detectado de la sesión, no se escribe a mano).
// Busca en la tabla staff por auth_user_id; si no está, usa el correo.
function nombreStaffActual() {
    if (!usuarioActual) return 'Desconocido';
    const s = (staffData || []).find(x => x.auth_user_id === usuarioActual.id);
    return (s && s.nombre) ? s.nombre : (usuarioActual.email || 'Staff');
}

function calcularDescuentoReferidos(referidos, precioBase) {
    // Descuentos fijos por referidos (no dependen del precio del plan).
    if (referidos === 1) return 2000;
    if (referidos === 2) return 5000;
    if (referidos === 3) return 10000;
    if (referidos === 4) return 20000;
    return 0;
}

function calcularPrecioFinal(planObj, racha, referidos) {
    const descRacha = calcularDescuentoRacha(racha);
    let montoTrasRacha = planObj.precio;
    let valDescRachaNum = 0;

    if (descRacha === "GRATIS") {
        valDescRachaNum = planObj.precio;
        montoTrasRacha = 0;
    } else {
        valDescRachaNum = descRacha;
        montoTrasRacha = Math.max(0, planObj.precio - descRacha);
    }

    const descReferidos = calcularDescuentoReferidos(referidos, planObj.precio);
    const totalFinal = Math.max(0, montoTrasRacha - descReferidos);

    return {
        base: planObj.precio,
        descuentoRacha: valDescRachaNum,
        descuentoReferidos: descReferidos,
        final: totalFinal,
        esGratisRacha: descRacha === "GRATIS"
    };
}

function calcularDiasParaVencer(fechaVencStr) {
    if (!fechaVencStr) return 999;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const venc = new Date(fechaVencStr);
    return Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
}

function fechaHoyISO() {
    return new Date().toISOString().split('T')[0];
}

// Convierte una fecha guardada como "AAAA-MM-DD" (formato de la base de
// datos) a "DD/MM/AAAA" para mostrarla. Si viene vacía o rara, devuelve
// un guion para no romper la tabla.
function formatearFecha(iso) {
    if (!iso) return '—';
    const partes = String(iso).split('-'); // ["2026","09","16"]
    if (partes.length !== 3) return iso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Convierte "AAAA-MM-DD" a un Date en hora LOCAL (evita el desfase de un
// día que ocurre cuando new Date("...") lo interpreta como UTC).
function parseFechaLocal(iso) {
    if (!iso) return null;
    const partes = String(iso).split('-');
    if (partes.length !== 3) return new Date(iso);
    return new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
}

// Convierte un objeto Date a "AAAA-MM-DD" usando su fecha LOCAL (sin el
// desfase que produce toISOString(), que usa UTC).
function fechaLocalISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function poblarSelectPlanes() {
    ['form-plan', 'edit-plan', 'renov-select-plan', 'pago-exp-plan'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '';
        PLANES_GYM.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.nombre} - $${p.precio.toLocaleString('es-CL')}</option>`;
        });
    });
}

// Construye la lista de participantes de la ruleta:
// 1) todos los que cumplieron su meta (según su plan),
// 2) si son menos de 3, se completa con los más cercanos a la meta.
// Devuelve [{ cliente, cumpleMeta }].
function calcularParticipantesRuleta() {
    const finalistas = clientesData.filter(c => (c.asistenciasMes || 0) >= metaAsistencia(c));
    const participantes = finalistas.map(c => ({ cliente: c, cumpleMeta: true }));

    if (participantes.length < 3) {
        const yaEstan = new Set(finalistas.map(c => c.id));
        const cercanos = clientesData
            .filter(c => !yaEstan.has(c.id) && (c.asistenciasMes || 0) > 0)
            .sort((a, b) => (b.asistenciasMes || 0) - (a.asistenciasMes || 0));
        for (const c of cercanos) {
            if (participantes.length >= 3) break;
            participantes.push({ cliente: c, cumpleMeta: false });
        }
    }
    return participantes;
}

function renderizarRuleta() {
    const cont = document.getElementById('ruleta-participantes');
    if (!cont) return;
    ruletaParticipantes = calcularParticipantesRuleta();

    const conteo = document.getElementById('ruleta-conteo');
    if (conteo) conteo.innerText = `${ruletaParticipantes.length} en sorteo`;

    if (ruletaParticipantes.length === 0) {
        cont.innerHTML = `<p class="text-[11px] text-slate-600">Nadie tiene asistencias este mes todavía.</p>`;
        return;
    }

    cont.innerHTML = ruletaParticipantes.map(p => {
        const c = p.cliente;
        const gano = ruletaGanadores.includes(c.id);
        const tag = p.cumpleMeta
            ? `<span class="text-[9px] text-emerald-400 font-bold">✅ Meta (${c.asistenciasMes || 0}/${metaAsistencia(c)})</span>`
            : `<span class="text-[9px] text-amber-400 font-bold">≈ Casi (${c.asistenciasMes || 0}/${metaAsistencia(c)})</span>`;
        return `<div class="flex justify-between items-center p-2 bg-black rounded-xl ${gano ? 'opacity-40 line-through' : ''}">
            <span class="text-white font-bold text-xs">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</span>
            ${gano ? '<span class="text-[9px] text-slate-500">ya ganó</span>' : tag}
        </div>`;
    }).join('');
}

// ------------------------------------------------------------
// FILTROS Y TABLA DE CLIENTES
// ------------------------------------------------------------
// Escapa texto de datos del cliente antes de meterlo en innerHTML, para que
// un nombre/correo con "<script>" (ej. de un CSV) no se ejecute (anti-XSS).
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Quita acentos para comparar iniciales (Á->A, é->e), pero conserva la Ñ.
function quitarAcentos(s) {
    return (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function aplicarFiltrosClientes() {
    const texto = document.getElementById('filtro-buscar').value.toLowerCase();
    const estado = document.getElementById('filtro-estado').value;
    const racha = document.getElementById('filtro-racha').value;
    const letra = document.getElementById('filtro-letra') ? document.getElementById('filtro-letra').value : 'TODAS';
    const filTel = document.getElementById('filtro-telefono') ? document.getElementById('filtro-telefono').value : 'TODOS';
    const filGenero = document.getElementById('filtro-genero') ? document.getElementById('filtro-genero').value : 'TODOS';

    let filtrados = clientesData.filter(c => {
        const matchTexto = (c.nombre + " " + c.apellido + " " + (c.correo || '') + " " + (c.telefono || '')).toLowerCase().includes(texto);

        let matchEstado = true;
        const diasVenc = calcularDiasParaVencer(c.vence);
        if (estado === 'PROXIMO_VENCER') {
            matchEstado = (diasVenc <= 5 && diasVenc >= 0);
        } else if (estado === 'VENCIDO_SIN_CONTACTAR') {
            matchEstado = (c.estado === 'Vencido' && !c.contactado);
        } else if (estado === 'VENCIDO_CONTACTADO') {
            matchEstado = (c.estado === 'Vencido' && !!c.contactado);
        } else if (estado !== 'TODOS') {
            matchEstado = (c.estado === estado);
        }

        // Filtro por letra inicial del nombre (A-Z, Ñ, o "#" para otros).
        let matchLetra = true;
        if (letra !== 'TODAS') {
            let inicial = (c.nombre || '').trim().charAt(0).toUpperCase();
            if (inicial !== 'Ñ') inicial = quitarAcentos(inicial).toUpperCase();
            if (letra === '#') matchLetra = !/[A-ZÑ]/.test(inicial);
            else matchLetra = (inicial === letra);
        }

        // Filtro por presencia de teléfono.
        const tieneTel = !!(c.telefono && String(c.telefono).trim());
        let matchTel = true;
        if (filTel === 'CON') matchTel = tieneTel;
        else if (filTel === 'SIN') matchTel = !tieneTel;

        let matchRacha = true;
        if (racha === 'PROXIMO_BONO') {
            matchRacha = (c.racha_meses === 4 || c.racha_meses === 9 || c.racha_meses === 14 || c.racha_meses === 19);
        } else if (racha === 'MAXIMA') {
            matchRacha = (c.racha_meses === 20);
        }

        // Filtro por género (M/F o "SIN" para los que faltan completar).
        let matchGenero = true;
        if (filGenero === 'SIN') matchGenero = !c.genero;
        else if (filGenero !== 'TODOS') matchGenero = (c.genero === filGenero);

        return matchTexto && matchEstado && matchLetra && matchTel && matchRacha && matchGenero;
    });

    // Orden: recién agregados (orden original de la BD por creado_en desc) o alfabético.
    const orden = document.getElementById('filtro-orden') ? document.getElementById('filtro-orden').value : 'RECIENTES';
    if (orden === 'AZ' || orden === 'ZA') {
        filtrados = [...filtrados].sort((a, b) => {
            const na = `${a.nombre} ${a.apellido}`.toLowerCase();
            const nb = `${b.nombre} ${b.apellido}`.toLowerCase();
            return orden === 'AZ' ? na.localeCompare(nb, 'es') : nb.localeCompare(na, 'es');
        });
    } else if (orden === 'PAGOS') {
        // Historial por el momento REAL del último pago (creado_en, con hora): el más
        // reciente arriba. Sin pagos → al final.
        const momentoUltimoPago = c => {
            if (!c.pagos || !c.pagos.length) return -Infinity;
            return Math.max(...c.pagos.map(p => new Date(p.creado_en || p.fecha).getTime() || 0));
        };
        filtrados = [...filtrados].sort((a, b) => momentoUltimoPago(b) - momentoUltimoPago(a));
    }
    // 'RECIENTES' deja el orden tal cual viene de la base (creado_en desc = más nuevos primero).

    renderizarTablaAdmin(filtrados);
}

// Marcador de seguimiento para clientes VENCIDOS: distingue los inactivos
// nuevos (falta hablarles) de los ya contactados. Un solo toggle.
function marcadorContactado(c) {
    if (c.estado !== 'Vencido') return '';
    if (c.contactado) {
        return `<button onclick="toggleContactado('${c.id}')" title="Clic para desmarcar" class="mt-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1 hover:bg-emerald-500/25 transition"><i class="fa-solid fa-check"></i> Ya le hablé</button>`;
    }
    return `<button onclick="toggleContactado('${c.id}')" title="Clic si ya le hablaste" class="mt-1 bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1 hover:text-emerald-400 hover:border-emerald-500/40 transition"><i class="fa-solid fa-phone"></i> ¿Le hablaste?</button>`;
}

async function toggleContactado(id) {
    const c = clientesData.find(item => item.id === id);
    if (!c) return;
    const nuevo = !c.contactado;
    // Optimista: cambia el estado local y repinta la tabla al instante.
    c.contactado = nuevo;
    if (document.getElementById('filtro-buscar')) aplicarFiltrosClientes();
    else renderizarTablaAdmin();
    // Persiste en la base; si falla, revierte y avisa.
    try {
        await Api.actualizarCliente(id, { contactado: nuevo });
    } catch (err) {
        c.contactado = !nuevo;
        if (document.getElementById('filtro-buscar')) aplicarFiltrosClientes();
        else renderizarTablaAdmin();
        alert('No se pudo guardar el marcador: ' + err.message + '\n\n¿Corriste migracion_contactado.sql en Supabase?');
    }
}

function renderizarTablaAdmin(datosFiltrados = clientesData) {
    const tbody = document.getElementById('tabla-admin-body');

    tbody.innerHTML = datosFiltrados.map(c => {
        const plan = PLANES_GYM.find(p => p.id === c.planId) || PLANES_GYM[0] || { nombre: '—' };
        const diasVenc = calcularDiasParaVencer(c.vence);
        let badgeClass;
        if (c.estado === 'Al día') badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        else if (c.estado === 'Pendiente') badgeClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
        else if (c.estado === 'Congelado') badgeClass = 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
        else badgeClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
        const estadoIcono = c.estado === 'Congelado' ? '<i class="fa-solid fa-snowflake"></i> ' : '';
        const telTxt = (c.telefono && String(c.telefono).trim())
            ? `<span class="text-slate-400">${escapeHtml(c.telefono)}</span>`
            : `<span class="text-rose-400 font-bold"><i class="fa-solid fa-phone-slash"></i> Sin teléfono</span>`;

        const indefinido = esPlanIndefinido(c.planId);
        let venceTag = '';
        if (indefinido) {
            venceTag = '';
        } else if (diasVenc <= 5 && diasVenc >= 0) {
            venceTag = `<span class="bg-orange-500/20 text-orange-400 font-bold px-1.5 py-0.5 rounded text-[9px] block mt-0.5"><i class="fa-solid fa-clock"></i> Vence en ${diasVenc} días</span>`;
        } else if (diasVenc < 0) {
            venceTag = `<span class="bg-rose-500/20 text-rose-400 font-bold px-1.5 py-0.5 rounded text-[9px] block mt-0.5">Vencido hace ${Math.abs(diasVenc)} días</span>`;
        }

        return `
            <tr class="hover:bg-slate-900/80 transition">
                <td class="col-cliente p-4">
                    <div class="font-bold text-white text-sm">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</div>
                    <div class="text-[10px] text-slate-500">${escapeHtml(c.correo || 'sin correo')} · ${telTxt}</div>
                </td>
                <td class="col-plan p-4" data-label="Plan & Vencimiento">
                    <span class="font-bold text-slate-200 block">${plan.nombre}</span>
                    <span class="text-[10px] text-slate-400">${indefinido ? '<i class="fa-solid fa-infinity"></i> Indefinido (no vence)' : 'Vence: ' + formatearFecha(c.vence)}</span>
                    ${venceTag}
                </td>
                <td class="col-racha p-4" data-label="Racha (20M)"><div class="font-black text-amber-400">Mes ${c.racha_meses} / 20</div></td>
                <td class="col-cumple p-4" data-label="Cumpleaños"><span class="text-purple-300 font-bold">${formatearFecha(c.cumpleanos)}</span></td>
                <td class="col-estado p-4"><span class="${badgeClass} px-2.5 py-1 rounded-full font-bold text-[10px] inline-block whitespace-nowrap">${estadoIcono}${c.estado}</span><div>${marcadorContactado(c)}</div></td>
                <td class="col-acciones p-4 text-right space-x-1 whitespace-nowrap">
                    <button onclick="resetearRachaCliente('${c.id}')" class="bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-black px-2.5 py-1.5 rounded-xl font-bold text-[10px]"><i class="fa-solid fa-rotate-left"></i> Reset Racha</button>
                    <button onclick="abrirModalEditarCliente('${c.id}')" class="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white px-2.5 py-1.5 rounded-xl font-bold text-[10px]"><i class="fa-solid fa-id-card"></i> Expediente</button>
                    <button onclick="eliminarCliente('${c.id}')" class="bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white px-2 py-1.5 rounded-xl font-bold text-[10px]"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

async function resetearRachaCliente(id) {
    const c = clientesData.find(item => item.id === id);
    if (!c) return;
    if (confirm(`¿Deseas resetear la racha de ${c.nombre} ${c.apellido} a 1 mes por no haber pagado a tiempo?`)) {
        const rachaAnterior = c.racha_meses || 0;
        const dias = calcularDiasParaVencer(c.vence); // negativo = ya venció
        const diasAtraso = dias < 0 ? Math.abs(dias) : 0;
        const motivo = dias < 0 ? 'Atraso en pago' : 'Reset manual';

        await Api.actualizarCliente(id, { racha_meses: 1 });

        // Guarda el evento en el historial (si la tabla existe).
        try {
            await Api.registrarEventoRacha({ clienteId: id, rachaAnterior, diasAtraso, motivo });
            await cargarEventosRacha();
        } catch (err) {
            console.warn('No se pudo guardar el evento de racha:', err.message);
        }

        rachasReseteadasContador++;
        await recargarClientes();
        alert(`⚠️ La racha de ${c.nombre} ${c.apellido} ha sido restablecida a 1 (se registró en el historial: mes ${rachaAnterior}, ${motivo}).`);
    }
}

// ------------------------------------------------------------
// RENOVACIONES
// ------------------------------------------------------------
function renderizarRenovaciones() {
    const tbody = document.getElementById('tabla-renovaciones-body');
    tbody.innerHTML = '';
    let countVenc = 0, countProx = 0, countAldia = 0;

    // Los contadores se calculan sobre TODOS los clientes...
    clientesData.forEach(c => {
        const diasVenc = calcularDiasParaVencer(c.vence);
        if (diasVenc < 0 || c.estado === 'Vencido') countVenc++;
        else if (diasVenc <= 5) countProx++;
        else countAldia++;
    });

    // ...pero la tabla respeta el buscador, el filtro de estado y el orden.
    const filtroInput = document.getElementById('filtro-renov');
    const texto = (filtroInput ? filtroInput.value : '').toLowerCase().trim();
    const estadoFiltro = document.getElementById('filtro-renov-estado') ? document.getElementById('filtro-renov-estado').value : 'TODOS';
    const ordenFiltro = document.getElementById('filtro-renov-orden') ? document.getElementById('filtro-renov-orden').value : 'VENCE';

    let listaMostrar = clientesData.filter(c => {
        // Texto
        if (texto && !(c.nombre + ' ' + c.apellido + ' ' + (c.correo || '') + ' ' + (c.telefono || '')).toLowerCase().includes(texto)) return false;
        // Estado
        const dias = calcularDiasParaVencer(c.vence);
        if (estadoFiltro === 'VENCIDOS') return dias < 0 || c.estado === 'Vencido';
        if (estadoFiltro === 'PROXIMOS') return dias >= 0 && dias <= 5;
        if (estadoFiltro === 'ALDIA') return dias > 5 && c.estado !== 'Vencido';
        return true;
    });

    // Orden
    listaMostrar = [...listaMostrar].sort((a, b) => {
        if (ordenFiltro === 'AZ' || ordenFiltro === 'ZA') {
            const na = `${a.nombre} ${a.apellido}`.toLowerCase();
            const nb = `${b.nombre} ${b.apellido}`.toLowerCase();
            return ordenFiltro === 'AZ' ? na.localeCompare(nb, 'es') : nb.localeCompare(na, 'es');
        }
        // VENCE: el que vence antes primero (menor días para vencer)
        return calcularDiasParaVencer(a.vence) - calcularDiasParaVencer(b.vence);
    });

    if (listaMostrar.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">Sin resultados con esos filtros.</td></tr>`;
        document.getElementById('count-vencidos').innerText = countVenc;
        document.getElementById('count-proximos').innerText = countProx;
        document.getElementById('count-aldia').innerText = countAldia;
        return;
    }

    tbody.innerHTML = listaMostrar.map(c => {
        const plan = PLANES_GYM.find(p => p.id === c.planId) || PLANES_GYM[0] || { nombre: '—' };
        const diasVenc = calcularDiasParaVencer(c.vence);

        let ultPagosHtml = '';
        if (c.pagos && c.pagos.length > 0) {
            c.pagos.slice(0, 2).forEach(p => {
                ultPagosHtml += `<span class="block text-[10px] text-slate-400">▪ ${formatearFecha(p.fecha)}: $${Number(p.monto).toLocaleString('es-CL')} (${p.metodo})</span>`;
            });
        } else {
            ultPagosHtml = `<span class="text-[10px] text-slate-500">Sin pagos</span>`;
        }

        return `
            <tr class="hover:bg-slate-900/80 transition">
                <td class="p-4 font-bold text-white">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</td>
                <td class="p-4 text-slate-300">${plan.nombre}</td>
                <td class="p-4"><span class="font-bold ${diasVenc < 0 ? 'text-rose-400' : (diasVenc <= 5 ? 'text-amber-400' : 'text-emerald-400')}">${formatearFecha(c.vence)}</span></td>
                <td class="p-4">${ultPagosHtml}</td>
                <td class="p-4 text-right">
                    <button onclick="abrirModalRegistrarPago('${c.id}', true)" class="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-3 py-1.5 rounded-xl text-xs shadow"><i class="fa-solid fa-rotate-right"></i> Renovar Plan...</button>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('count-vencidos').innerText = countVenc;
    document.getElementById('count-proximos').innerText = countProx;
    document.getElementById('count-aldia').innerText = countAldia;
}

function abrirModalRenovacion(id) {
    const c = clientesData.find(item => item.id === id);
    if (!c) return;
    document.getElementById('renov-cliente-id').value = c.id;
    document.getElementById('renov-select-plan').value = c.planId;
    const plan = PLANES_GYM.find(p => p.id === c.planId) || PLANES_GYM[0];
    document.getElementById('renov-monto').value = plan ? plan.precio : 0;
    document.getElementById('renov-fecha').value = fechaHoyISO();
    document.getElementById('modal-renovar-plan').classList.remove('hidden');
}

function cerrarModalRenovacion() { document.getElementById('modal-renovar-plan').classList.add('hidden'); }

async function ejecutarRenovacionPersonalizada() {
    const clienteId = document.getElementById('renov-cliente-id').value;
    const c = clientesData.find(item => item.id === clienteId);
    if (!c) return;

    const planId = document.getElementById('renov-select-plan').value;
    const plan = PLANES_GYM.find(p => p.id === planId) || PLANES_GYM[0];
    const fechaPago = document.getElementById('renov-fecha').value;
    const monto = parseFloat(document.getElementById('renov-monto').value) || plan.precio;
    const tipoPago = document.getElementById('renov-tipo-pago').value;

    let nuevaVenc = parseFechaLocal(fechaPago);
    nuevaVenc.setMonth(nuevaVenc.getMonth() + plan.duracion_meses);

    await Api.actualizarCliente(clienteId, {
        planId: planId,
        estado: "Al día",
        racha_meses: c.racha_meses + 1,
        vence: fechaLocalISO(nuevaVenc)
    });

    await Api.agregarPago(clienteId, { fecha: fechaPago, concepto: plan.nombre, monto: monto, metodo: tipoPago });

    cerrarModalRenovacion();
    await recargarClientes();
    alert(`¡Renovación personalizada aplicada con éxito para ${c.nombre} ${c.apellido}!`);
}

// ------------------------------------------------------------
// ASISTENCIA MENSUAL Y PREMIOS
// ------------------------------------------------------------
function renderizarAsistenciaMensual() {
    const tbody = document.getElementById('tabla-asistencia-mensual-body');
    if (!tbody) return; // sección removida en la demo

    tbody.innerHTML = clientesData.map(c => {
        const meta = metaAsistencia(c); // 12 o 20 según el plan
        const asist = c.asistenciasMes || 0;
        const porcentaje = Math.min(100, Math.round((asist / meta) * 100));
        let estadoPremio = asist >= meta ? `<span class="bg-amber-500/20 text-amber-400 font-bold px-2.5 py-1 rounded-full text-[10px]">🌟 Finalista Ruleta (${meta}✓)</span>` : `<span class="text-slate-500 text-[10px]">Faltan ${meta - asist} días (meta ${meta})</span>`;

        return `
            <tr class="hover:bg-slate-900/80 transition">
                <td class="p-4 font-bold text-white">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</td>
                <td class="p-4"><span class="text-emerald-400 font-black text-sm">${asist} días</span></td>
                <td class="p-4">
                    <div class="flex items-center gap-2">
                        <div class="w-32 bg-slate-800 rounded-full h-2 overflow-hidden"><div class="bg-emerald-500 h-full" style="width: ${porcentaje}%"></div></div>
                        <span class="text-[10px] font-bold text-slate-400">${porcentaje}%</span>
                    </div>
                </td>
                <td class="p-4">${estadoPremio}</td>
                <td class="p-4 text-right"><button onclick="sumarAsistenciaMes('${c.id}')" class="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-xl text-[10px] font-bold">+1 Asist.</button></td>
            </tr>
        `;
    }).join('');
    renderizarRuleta();
}

async function sumarAsistenciaMes(id) {
    const c = clientesData.find(item => item.id === id);
    if (!c) return;
    await Api.actualizarCliente(id, { asistenciasMes: (c.asistenciasMes || 0) + 1 });
    await recargarClientes();
}

async function otorgarPremiosAsistenciaMasiva() {
    const candidatos = clientesData.filter(c => (c.asistenciasMes || 0) >= 20 && !c.premioAsistenciaReclamado);
    for (const c of candidatos) {
        await Api.actualizarCliente(c.id, { premioAsistenciaReclamado: true });
    }
    await recargarClientes();
    alert(`¡Se han procesado ${candidatos.length} finalistas para la ruleta de premios de fin de mes!`);
}

// ------------------------------------------------------------
// RULETA DE PREMIOS
// Sortea 3 premios entre los participantes. La rueda elige a la
// persona (no el premio): 1er giro = 1er premio, 2do = 2do, etc.
// No puede repetir ganador.
// ------------------------------------------------------------
const RULETA_PREMIOS = [
    { medalla: '🥇', texto: '1er Lugar — Cupón $10.000 para cualquier plan' },
    { medalla: '🥈', texto: '2do Lugar — Frappé + Snack' },
    { medalla: '🥉', texto: '3er Lugar — Frappé o Snack' }
];

function girarRuleta() {
    const wheel = document.getElementById('wheel');
    const btnGirar = document.getElementById('btn-girar');
    const mensaje = document.getElementById('ruleta-mensaje');

    if (ruletaGanadores.length >= RULETA_PREMIOS.length) {
        mensaje.innerText = 'Ya se sortearon los 3 premios. Presiona ↺ para reiniciar.';
        return;
    }

    // Disponibles = participantes que aún no han ganado.
    const disponibles = ruletaParticipantes.filter(p => !ruletaGanadores.includes(p.cliente.id));
    if (disponibles.length === 0) {
        mensaje.innerText = 'No quedan participantes disponibles para sortear.';
        return;
    }

    btnGirar.disabled = true;
    const grados = Math.floor(Math.random() * 360) + 1440;
    // Acumula el giro para que se sienta que sigue girando en cada premio.
    ruletaGiroAcumulado += grados;
    wheel.style.transform = `rotate(${ruletaGiroAcumulado}deg)`;

    setTimeout(() => {
        const ganador = disponibles[Math.floor(Math.random() * disponibles.length)];
        ruletaGanadores.push(ganador.cliente.id);
        const premio = RULETA_PREMIOS[ruletaGanadores.length - 1];

        const cont = document.getElementById('ruleta-ganadores');
        cont.innerHTML += `<div class="flex items-center gap-3 p-3 bg-black rounded-2xl border border-amber-500/30">
            <span class="text-2xl">${premio.medalla}</span>
            <div>
                <div class="text-white font-black text-sm">${ganador.cliente.nombre} ${ganador.cliente.apellido}</div>
                <div class="text-[10px] text-amber-400 font-bold">${premio.texto}</div>
            </div>
        </div>`;

        renderizarRuleta(); // refresca la lista tachando al ganador

        const quedan = RULETA_PREMIOS.length - ruletaGanadores.length;
        const mensaje = document.getElementById('ruleta-mensaje');
        if (quedan > 0 && ruletaParticipantes.length > ruletaGanadores.length) {
            const siguiente = RULETA_PREMIOS[ruletaGanadores.length];
            mensaje.innerText = `Presiona «Girar» para el ${siguiente.texto.split(' — ')[0]}.`;
            btnGirar.disabled = false;
        } else {
            mensaje.innerText = '¡Sorteo terminado! Presiona ↺ para reiniciar.';
            btnGirar.disabled = true;
        }
    }, 4000);
}

function reiniciarRuleta() {
    ruletaGanadores = [];
    ruletaGiroAcumulado = 0;
    document.getElementById('ruleta-ganadores').innerHTML = '';
    document.getElementById('btn-girar').disabled = false;
    document.getElementById('ruleta-mensaje').innerText = 'Presiona «Girar» para sortear el 1er premio. No se puede repetir ganador.';
    document.getElementById('wheel').style.transform = 'rotate(0deg)';
    renderizarRuleta();
}

// ------------------------------------------------------------
// EXPEDIENTE COMPLETO (datos, pagos, medidas, PRs)
// ------------------------------------------------------------
function abrirModalEditarCliente(id) {
    const c = clientesData.find(item => item.id === id);
    if (!c) return;

    document.getElementById('edit-id').value = c.id;
    const elRut = document.getElementById('edit-rut');
    if (elRut) elRut.value = c.rut || "";
    document.getElementById('edit-nombre').value = c.nombre;
    document.getElementById('edit-apellido').value = c.apellido;
    document.getElementById('edit-cumpleanos').value = c.cumpleanos || "";
    document.getElementById('edit-genero').value = c.genero || "";
    document.getElementById('edit-correo').value = c.correo || "";
    document.getElementById('edit-telefono').value = c.telefono || "";
    document.getElementById('edit-telefono-emergencia').value = c.telefonoEmergencia || "";
    document.getElementById('edit-emergencia1-nombre').value = c.emergencia1Nombre || "";
    document.getElementById('edit-emergencia2-nombre').value = c.emergencia2Nombre || "";
    document.getElementById('edit-emergencia2-telefono').value = c.emergencia2Telefono || "";
    document.getElementById('edit-emergencia-lugar').value = c.emergenciaLugar || "";
    document.getElementById('edit-observaciones').value = c.observaciones || "";
    document.getElementById('edit-salud-controles').checked = !!c.saludControlesAlDia;
    document.getElementById('edit-salud-enfermedades').value = c.saludEnfermedades || "";
    document.getElementById('edit-salud-medicamentos').value = c.saludMedicamentos || "";
    document.getElementById('edit-salud-alergias').value = c.saludAlergias || "";
    document.getElementById('edit-salud-lesiones').value = c.saludLesiones || "";
    document.getElementById('edit-salud-grupo').value = c.saludGrupo || "";
    document.getElementById('edit-salud-notas').value = c.saludNotas || "";
    document.getElementById('edit-plan').value = c.planId;
    document.getElementById('edit-racha').value = c.racha_meses;
    document.getElementById('edit-vencimiento').value = c.vence || "";
    document.getElementById('edit-estado').value = c.estado;
    document.getElementById('edit-registrado-por').innerText = c.registradoPor || '— (registro antiguo)';

    renderizarPagosEditable(c);
    renderizarMedidasEditable(c);
    renderizarPRsHistorial(c);
    renderizarContrato(c);
    if (typeof renderizarCuentaPortal === 'function') renderizarCuentaPortal(c); // cuenta del portal (usuario/clave)
    cargarSaludCliente(c.id); // carga Nutri/Kine bajo demanda (async, no bloquea)

    // Si el expediente YA estaba abierto, esto es un re-render tras
    // agregar/editar/borrar un dato: conserva la pestaña donde estaba el
    // staff (PRs, Pagos, Medidas...). Si se abre nuevo desde la lista,
    // arranca en "Datos".
    const modal = document.getElementById('modal-editar-cliente');
    const yaAbierto = !modal.classList.contains('hidden');
    cambiarTabExpediente(yaAbierto ? tabExpedienteActiva : 'tab-datos');
    modal.classList.remove('hidden');
}

function cerrarModalEditarCliente() { document.getElementById('modal-editar-cliente').classList.add('hidden'); }

// Recuerda en qué pestaña del expediente está el staff, para no saltar a
// "Datos" cada vez que se agrega/edita un dato y se reabre el modal.
let tabExpedienteActiva = 'tab-datos';

function cambiarTabExpediente(tabId) {
    tabExpedienteActiva = tabId;
    ['tab-datos', 'tab-pagos', 'tab-medidas', 'tab-prs', 'tab-salud', 'tab-contrato'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
        document.getElementById(`btn-${id}`).className = "px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white";
    });
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById(`btn-${tabId}`).className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-black";

    // El canvas de firma necesita su ancho real (solo se conoce al ser visible).
    if (tabId === 'tab-contrato') inicializarCanvasFirma();

    // Los gráficos de progreso se dibujan al entrar a su pestaña, con el canvas
    // ya visible (si no, Chart.js mide 0px y sale deforme).
    if (tabId === 'tab-medidas' || tabId === 'tab-prs') {
        const c = clientesData.find(x => x.id === document.getElementById('edit-id').value);
        if (c && tabId === 'tab-medidas') renderizarGraficoMedidas(c);
        if (c && tabId === 'tab-prs') renderizarGraficoPRs(c);
    }
}

// --- Pagos dentro del expediente ---
// Opciones de método de pago (select). Conserva un valor antiguo ya guardado
// (ej. registros previos con "Tarjeta..." o "Convenio Zinfio") para no perderlo.
function opcionesMetodoPago(sel) {
    const metodos = ['Transferencia Bancaria', 'Efectivo', 'Débito', 'Crédito'];
    let html = metodos.map(m => `<option value="${m}" ${sel === m ? 'selected' : ''}>${m === 'Transferencia Bancaria' ? 'Transferencia' : m}</option>`).join('');
    if (sel && !metodos.includes(sel)) html += `<option value="${sel}" selected>${sel} (anterior)</option>`;
    return html;
}

function renderizarPagosEditable(c) {
    if (typeof renderizarQuickAdicionales === 'function') renderizarQuickAdicionales();
    const tbody = document.getElementById('lista-historial-pagos-editable');
    tbody.innerHTML = '';
    if (!c.pagos || c.pagos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-500">Sin pagos registrados.</td></tr>`;
        return;
    }
    c.pagos.forEach((p) => {
        let optionsPlanes = '';
        PLANES_GYM.forEach(plan => {
            let selected = (p.concepto === plan.nombre) ? 'selected' : '';
            optionsPlanes += `<option value="${plan.nombre}" ${selected}>${plan.nombre}</option>`;
        });
        let customSelected = !PLANES_GYM.some(plan => plan.nombre === p.concepto) ? 'selected' : '';
        optionsPlanes += `<option value="${p.concepto}" ${customSelected}>${p.concepto} (Personalizado)</option>`;

        tbody.innerHTML += `
            <tr>
                <td class="p-2"><input type="date" value="${p.fecha}" onchange="actualizarPagoCliente('${p.id}', 'fecha', this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs"></td>
                <td class="p-2"><select onchange="actualizarPagoCliente('${p.id}', 'concepto', this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs w-full font-bold">${optionsPlanes}</select></td>
                <td class="p-2"><input type="number" value="${p.monto}" onchange="actualizarPagoCliente('${p.id}', 'monto', this.value)" class="bg-black border border-slate-800 rounded p-1 text-emerald-400 font-bold text-xs w-24"></td>
                <td class="p-2">
                    <select onchange="actualizarPagoCliente('${p.id}', 'metodo', this.value)" class="bg-black border border-slate-800 rounded p-1 text-slate-300 text-xs">${opcionesMetodoPago(p.metodo)}</select>
                </td>
                <td class="p-2 text-right"><button onclick="eliminarPagoCliente('${p.id}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `;
    });
}

async function actualizarPagoCliente(pagoId, campo, valor) {
    const payload = { [campo]: campo === 'monto' ? (parseFloat(valor) || 0) : valor };
    await Api.actualizarPago(pagoId, payload);
    await recargarClientes();
    // Reabre el expediente que estaba editando para no perder el contexto
    const idCliente = document.getElementById('edit-id').value;
    if (idCliente) abrirModalEditarCliente(idCliente);
}

async function agregarPagoManualExpediente() {
    const clienteId = document.getElementById('edit-id').value;
    if (!clienteId || !PLANES_GYM[0]) return;
    await Api.agregarPago(clienteId, { fecha: fechaHoyISO(), concepto: PLANES_GYM[0].nombre, monto: PLANES_GYM[0].precio, metodo: "Efectivo" });
    await recargarClientes();
    abrirModalEditarCliente(clienteId);
}

async function eliminarPagoCliente(pagoId) {
    const clienteId = document.getElementById('edit-id').value;
    await Api.eliminarPago(pagoId);
    await recargarClientes();
    if (clienteId) abrirModalEditarCliente(clienteId);
}

// --- Modal "Registrar Pago" (dentro del expediente) ---
// Replica la lógica de alta de cliente: plan, fecha, método, matrícula,
// referidos y descuento por racha, con monto editable y opción de renovar.
// clienteId opcional: si no se pasa, usa el del expediente abierto (edit-id).
// renovarDefault: true cuando se abre desde Renovaciones (marca el checkbox
// de renovar y pre-carga la racha del PRÓXIMO mes que va a pagar).
function abrirModalRegistrarPago(clienteId, renovarDefault) {
    clienteId = clienteId || document.getElementById('edit-id').value;
    const c = clientesData.find(x => x.id === clienteId);
    if (!c) return;
    document.getElementById('pago-exp-cliente-id').value = clienteId;
    document.getElementById('pago-exp-nombre').innerText = `${c.nombre} ${c.apellido}`;
    poblarSelectPlanes(); // asegura que el select de planes tenga opciones
    document.getElementById('pago-exp-plan').value = c.planId || (PLANES_GYM[0] && PLANES_GYM[0].id) || '';
    document.getElementById('pago-exp-fecha').value = fechaHoyISO();
    document.getElementById('pago-exp-metodo').value = 'Efectivo';
    document.getElementById('pago-exp-racha').value = renovarDefault ? Math.min(20, (c.racha_meses || 0) + 1) : (c.racha_meses || 1);
    document.getElementById('pago-exp-referidos').value = '0';
    document.getElementById('pago-exp-matricula').value = (typeof ConfigGym !== 'undefined') ? ConfigGym.getMatricula() : '0';
    document.getElementById('pago-exp-renovar').checked = !!renovarDefault;
    calcularPagoExpediente();
    document.getElementById('modal-registrar-pago').classList.remove('hidden');
}

function cerrarModalRegistrarPago() { document.getElementById('modal-registrar-pago').classList.add('hidden'); }

function calcularPagoExpediente() {
    const plan = PLANES_GYM.find(p => p.id === document.getElementById('pago-exp-plan').value) || PLANES_GYM[0];
    if (!plan) return;
    const racha = parseInt(document.getElementById('pago-exp-racha').value) || 1;
    const referidos = parseInt(document.getElementById('pago-exp-referidos').value) || 0;
    const matricula = parseInt(document.getElementById('pago-exp-matricula').value) || 0;
    const calc = calcularPrecioFinal(plan, racha, referidos);

    document.getElementById('pago-exp-calc-base').innerText = `$${plan.precio.toLocaleString('es-CL')}`;
    document.getElementById('pago-exp-calc-desc-racha').innerText = `-$${(calc.esGratisRacha ? plan.precio : calc.descuentoRacha).toLocaleString('es-CL')}${calc.esGratisRacha ? ' (100% Racha 20M)' : ''}`;
    document.getElementById('pago-exp-calc-desc-referidos').innerText = `-$${calc.descuentoReferidos.toLocaleString('es-CL')}`;
    document.getElementById('pago-exp-calc-matricula').innerText = `+$${matricula.toLocaleString('es-CL')}`;
    document.getElementById('pago-exp-calc-total').innerText = `$${(calc.final + matricula).toLocaleString('es-CL')}`;
    document.getElementById('pago-exp-monto').value = calc.final; // monto del plan (editable)
}

async function registrarPagoExpediente() {
    const clienteId = document.getElementById('pago-exp-cliente-id').value || document.getElementById('edit-id').value;
    const c = clientesData.find(x => x.id === clienteId);
    if (!clienteId || !c) return;

    const plan = PLANES_GYM.find(p => p.id === document.getElementById('pago-exp-plan').value) || PLANES_GYM[0];
    const fecha = document.getElementById('pago-exp-fecha').value || fechaHoyISO();
    const metodo = document.getElementById('pago-exp-metodo').value;
    const montoStr = document.getElementById('pago-exp-monto').value;
    const monto = parseFloat(montoStr);
    const montoFinal = isNaN(monto) ? (plan ? plan.precio : 0) : monto;
    const matricula = parseInt(document.getElementById('pago-exp-matricula').value) || 0;
    const racha = parseInt(document.getElementById('pago-exp-racha').value) || 1;

    // Pago del plan
    await Api.agregarPago(clienteId, { fecha, concepto: plan ? plan.nombre : 'Pago', monto: montoFinal, metodo });
    // Matrícula (pago aparte), solo si se cobró
    if (matricula > 0) {
        await Api.agregarPago(clienteId, { fecha, concepto: 'Matrícula (ingreso)', monto: matricula, metodo });
    }
    // Renovar membresía si se marcó: fija racha, estado y extiende el vencimiento
    if (document.getElementById('pago-exp-renovar').checked && plan) {
        let venc = parseFechaLocal(fecha);
        venc.setMonth(venc.getMonth() + plan.duracion_meses);
        await Api.actualizarCliente(clienteId, { planId: plan.id, estado: 'Al día', racha_meses: racha, vence: fechaLocalISO(venc) });
    }

    cerrarModalRegistrarPago();
    await recargarClientes();
    // Si veníamos del expediente de este mismo cliente, lo reabrimos en Pagos.
    // Si veníamos de Renovaciones, solo recargamos (la tabla ya se actualizó).
    const expedienteAbierto = !document.getElementById('modal-editar-cliente').classList.contains('hidden');
    if (expedienteAbierto && document.getElementById('edit-id').value === clienteId) {
        abrirModalEditarCliente(clienteId);
        cambiarTabExpediente('tab-pagos');
    }
}

// --- Medidas dentro del expediente ---
function renderizarMedidasEditable(c) {
    const tbody = document.getElementById('lista-medidas-editable');
    if (!c.medidasHistorial || c.medidasHistorial.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="p-3 text-center text-slate-500">Sin medidas antropométricas registradas.</td></tr>`;
        return;
    }
    // Celda numérica editable reutilizable (evita repetir el markup por columna).
    const celdaNum = (m, campo, color) =>
        `<td class="p-2"><input type="number" step="0.5" value="${m[campo] ?? 0}" onchange="actualizarMedidaCliente('${m.id}', '${campo}', this.value)" class="bg-black border border-slate-800 rounded p-1 ${color} text-xs w-16"></td>`;
    tbody.innerHTML = c.medidasHistorial.map(m => `
            <tr>
                <td class="p-2"><input type="date" value="${m.fecha}" onchange="actualizarMedidaCliente('${m.id}', 'fecha', this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs"></td>
                <td class="p-2"><input type="number" step="0.1" value="${m.peso ?? 0}" onchange="actualizarMedidaCliente('${m.id}', 'peso', this.value)" class="bg-black border border-slate-800 rounded p-1 text-emerald-400 font-bold text-xs w-16"></td>
                ${celdaNum(m, 'pectoral', 'text-white')}
                ${celdaNum(m, 'brazo_izq', 'text-white')}
                ${celdaNum(m, 'brazo_der', 'text-white')}
                ${celdaNum(m, 'cintura', 'text-white')}
                ${celdaNum(m, 'cadera', 'text-white')}
                ${celdaNum(m, 'pierna_izq', 'text-white')}
                ${celdaNum(m, 'pierna_der', 'text-white')}
                ${celdaNum(m, 'gluteos', 'text-pink-400 font-bold')}
                <td class="p-2">${celdaArchivo(m, 'medida')}</td>
                <td class="p-2 text-right"><button onclick="eliminarMedidaCliente('${m.id}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `).join('');
}

async function actualizarMedidaCliente(medidaId, campo, valor) {
    const payload = { [campo]: campo === 'fecha' ? valor : (parseFloat(valor) || 0) };
    await Api.actualizarMedida(medidaId, payload);
    await recargarClientes();
    const idCliente = document.getElementById('edit-id').value;
    if (idCliente) abrirModalEditarCliente(idCliente);
}

async function agregarMedidaAntropometrica() {
    const clienteId = document.getElementById('edit-id').value;
    if (!clienteId) return;
    await Api.agregarMedida(clienteId, { fecha: fechaHoyISO(), peso: 70.0, pectoral: 100, brazo_izq: 35, brazo_der: 35, cintura: 80, cadera: 90, pierna_izq: 55, pierna_der: 55, gluteos: 95 });
    await recargarClientes();
    abrirModalEditarCliente(clienteId);
}

async function eliminarMedidaCliente(medidaId) {
    const clienteId = document.getElementById('edit-id').value;
    await Api.eliminarMedida(medidaId);
    await recargarClientes();
    if (clienteId) abrirModalEditarCliente(clienteId);
}

// Ejercicios de PR disponibles y su unidad. Flexiones y Dominadas se miden
// en repeticiones (reps); el resto en kilos (KG).
const EJERCICIOS_PR = ["Press banca", "Fondos", "Sentadilla", "Hip thrust", "Bíceps", "Flexiones", "Dominadas"];
function unidadEjercicio(nombre) {
    const n = (nombre || '').toLowerCase();
    return (n.includes('flexiones') || n.includes('dominadas')) ? 'reps' : 'KG';
}

// --- PRs dentro del expediente ---
function renderizarPRsHistorial(c) {
    const tbody = document.getElementById('lista-prs-historial');
    tbody.innerHTML = '';
    if (!c.prsHistorial || c.prsHistorial.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-slate-500">Sin récords PRs registrados.</td></tr>`;
        return;
    }

    const opcionesEjercicios = EJERCICIOS_PR;
    c.prsHistorial.forEach((pr) => {
        let optionsSelect = '';
        opcionesEjercicios.forEach(ej => {
            let selected = (pr.ejercicio.toLowerCase() === ej.toLowerCase()) ? 'selected' : '';
            optionsSelect += `<option value="${ej}" ${selected}>${ej}</option>`;
        });

        tbody.innerHTML += `
            <tr>
                <td class="p-2"><select onchange="actualizarPRCliente('${pr.id}', 'ejercicio', this.value)" class="bg-black border border-slate-800 rounded p-1 text-amber-400 font-bold text-xs w-full">${optionsSelect}</select></td>
                <td class="p-2"><input type="number" value="${pr.marca}" onchange="actualizarPRCliente('${pr.id}', 'marca', this.value)" class="bg-black border border-slate-800 rounded p-1 text-amber-400 font-bold text-xs w-20"> <span class="text-slate-400 font-bold">${unidadEjercicio(pr.ejercicio)}</span></td>
                <td class="p-2"><input type="date" value="${pr.fecha}" onchange="actualizarPRCliente('${pr.id}', 'fecha', this.value)" class="bg-black border border-slate-800 rounded p-1 text-slate-300 text-xs"></td>
                <td class="p-2 text-right"><button onclick="eliminarPRCliente('${pr.id}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `;
    });
}

async function actualizarPRCliente(prId, campo, valor) {
    const payload = { [campo]: campo === 'marca' ? (parseFloat(valor) || 0) : valor };
    await Api.actualizarPR(prId, payload);
    await recargarClientes();
    const idCliente = document.getElementById('edit-id').value;
    if (idCliente) abrirModalEditarCliente(idCliente);
}

async function agregarNuevoPRCliente() {
    const clienteId = document.getElementById('edit-id').value;
    if (!clienteId) return;
    await Api.agregarPR(clienteId, { ejercicio: "Press banca", marca: 50, fecha: fechaHoyISO() });
    await recargarClientes();
    abrirModalEditarCliente(clienteId);
}

async function eliminarPRCliente(prId) {
    const clienteId = document.getElementById('edit-id').value;
    await Api.eliminarPR(prId);
    await recargarClientes();
    if (clienteId) abrirModalEditarCliente(clienteId);
}

// --- Gráficos de progreso dentro del expediente ---
// Se dibujan al entrar a la pestaña (canvas visible) para que Chart.js mida bien.
let chartMedidasInstance = null;
let chartPRsInstance = null;

// Fecha corta DD/MM para los ejes.
function fechaCorta(iso) {
    const p = String(iso || '').split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}` : (iso || '');
}

function renderizarGraficoMedidas(c) {
    const wrap = document.getElementById('medidas-grafico-wrap');
    const ctx = document.getElementById('chartMedidasProgreso');
    if (!wrap || !ctx || typeof Chart === 'undefined') return;
    // Historial ascendente por fecha (el guardado viene descendente).
    const data = (c.medidasHistorial || []).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    if (data.length < 2) { // con 1 sola medida no hay progreso que mostrar
        wrap.classList.add('hidden');
        if (chartMedidasInstance) { chartMedidasInstance.destroy(); chartMedidasInstance = null; }
        return;
    }
    wrap.classList.remove('hidden');
    const series = [
        { campo: 'peso', label: 'Peso (kg)', color: '#10b981' },
        { campo: 'cintura', label: 'Cintura', color: '#f59e0b' },
        { campo: 'cadera', label: 'Cadera', color: '#ec4899' },
        { campo: 'gluteos', label: 'Glúteos', color: '#8b5cf6' },
        { campo: 'brazo_izq', label: 'Brazo Izq', color: '#06b6d4' }
    ];
    const datasets = series.map(s => ({
        label: s.label,
        data: data.map(m => (m[s.campo] == null ? null : Number(m[s.campo]))),
        borderColor: s.color,
        backgroundColor: s.color,
        spanGaps: true,
        tension: 0.3,
        pointRadius: 3
    }));
    if (chartMedidasInstance) chartMedidasInstance.destroy();
    chartMedidasInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: data.map(m => fechaCorta(m.fecha)), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12 } } },
            scales: {
                x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } },
                y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } }
            }
        }
    });
}

function renderizarGraficoPRs(c) {
    const wrap = document.getElementById('prs-grafico-wrap');
    const ctx = document.getElementById('chartPRsProgreso');
    if (!wrap || !ctx || typeof Chart === 'undefined') return;
    const prs = (c.prsHistorial || []).slice();
    if (prs.length < 2) {
        wrap.classList.add('hidden');
        if (chartPRsInstance) { chartPRsInstance.destroy(); chartPRsInstance = null; }
        return;
    }
    wrap.classList.remove('hidden');
    // Eje X = todas las fechas únicas ordenadas; cada ejercicio es una línea.
    const fechas = [...new Set(prs.map(p => p.fecha))].sort((a, b) => String(a).localeCompare(String(b)));
    const ejercicios = [...new Set(prs.map(p => p.ejercicio))];
    const PALETA = ['#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#ef4444', '#64748b'];
    const datasets = ejercicios.map((ej, i) => ({
        label: ej,
        data: fechas.map(f => {
            const reg = prs.find(p => p.ejercicio === ej && p.fecha === f);
            return reg ? Number(reg.marca) : null;
        }),
        borderColor: PALETA[i % PALETA.length],
        backgroundColor: PALETA[i % PALETA.length],
        spanGaps: true, tension: 0.3, pointRadius: 3
    }));
    if (chartPRsInstance) chartPRsInstance.destroy();
    chartPRsInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: fechas.map(fechaCorta), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12 } } },
            scales: {
                x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } },
                y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } }
            }
        }
    });
}

// ------------------------------------------------------------
// SALUD: NUTRICIÓN + KINESIOLOGÍA (dentro del expediente)
// ------------------------------------------------------------
// Se carga bajo demanda al abrir el expediente. Si las tablas todavía
// no existen (no se corrió migracion_salud.sql), no rompe nada.
let saludActual = { clienteId: null, nutri: [], kine: [] };

async function cargarSaludCliente(clienteId) {
    const aviso = document.getElementById('salud-aviso');
    try {
        const { nutri, kine } = await Api.getSaludCliente(clienteId);
        saludActual = { clienteId, nutri: nutri || [], kine: kine || [] };
        if (aviso) aviso.classList.add('hidden');
    } catch (err) {
        saludActual = { clienteId, nutri: [], kine: [] };
        if (aviso) aviso.classList.remove('hidden'); // muestra el recordatorio de la migración
        console.warn('Tablas de salud no disponibles (corre migracion_salud.sql):', err.message);
    }
    renderizarNutri();
    renderizarKine();
}

// --- Nutrición ---
function renderizarNutri() {
    const tbody = document.getElementById('lista-nutri');
    if (!tbody) return;
    if (!saludActual.nutri.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-3 text-center text-slate-500">Sin controles de nutrición.</td></tr>`;
        return;
    }
    tbody.innerHTML = saludActual.nutri.map(n => `
        <tr>
            <td class="p-2"><input type="date" value="${n.fecha || ''}" onchange="actualizarNutri('${n.id}','fecha',this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs"></td>
            <td class="p-2"><input type="text" value="${(n.objetivo || '').replace(/"/g, '&quot;')}" placeholder="Bajar grasa..." onchange="actualizarNutri('${n.id}','objetivo',this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs w-28"></td>
            <td class="p-2"><input type="number" step="0.1" value="${n.peso_meta ?? ''}" onchange="actualizarNutri('${n.id}','peso_meta',this.value)" class="bg-black border border-slate-800 rounded p-1 text-emerald-400 font-bold text-xs w-16"></td>
            <td class="p-2"><input type="text" value="${(n.notas || '').replace(/"/g, '&quot;')}" placeholder="Indicaciones..." onchange="actualizarNutri('${n.id}','notas',this.value)" class="bg-black border border-slate-800 rounded p-1 text-slate-300 text-xs w-40"></td>
            <td class="p-2"><input type="date" value="${n.proximo_control || ''}" onchange="actualizarNutri('${n.id}','proximo_control',this.value)" class="bg-black border border-slate-800 rounded p-1 text-amber-400 text-xs"></td>
            <td class="p-2">${celdaArchivo(n, 'nutri')}</td>
            <td class="p-2 text-right"><button onclick="eliminarNutri('${n.id}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('');
}

async function agregarNutriCliente() {
    const clienteId = document.getElementById('edit-id').value;
    if (!clienteId) return;
    try {
        await Api.agregarNutri(clienteId, { fecha: fechaHoyISO(), objetivo: '', peso_meta: null, notas: '', proximo_control: null });
        await cargarSaludCliente(clienteId);
    } catch (err) { alert('No se pudo agregar (¿corriste migracion_salud.sql?): ' + err.message); }
}

async function actualizarNutri(id, campo, valor) {
    const payload = { [campo]: campo === 'peso_meta' ? (parseFloat(valor) || null) : (valor || null) };
    await Api.actualizarNutri(id, payload);
    await cargarSaludCliente(saludActual.clienteId);
}

async function eliminarNutri(id) {
    await Api.eliminarNutri(id);
    await cargarSaludCliente(saludActual.clienteId);
}

// --- Kinesiología ---
function renderizarKine() {
    const tbody = document.getElementById('lista-kine');
    if (!tbody) return;
    if (!saludActual.kine.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-3 text-center text-slate-500">Sin sesiones de kinesiología.</td></tr>`;
        return;
    }
    const estados = ['Apto', 'Precaución', 'No apto'];
    tbody.innerHTML = saludActual.kine.map(k => {
        const opts = estados.map(e => `<option value="${e}" ${k.estado === e ? 'selected' : ''}>${e}</option>`).join('');
        const colorEstado = k.estado === 'No apto' ? 'text-rose-400' : (k.estado === 'Precaución' ? 'text-amber-400' : 'text-emerald-400');
        return `
        <tr>
            <td class="p-2"><input type="date" value="${k.fecha || ''}" onchange="actualizarKine('${k.id}','fecha',this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs"></td>
            <td class="p-2"><input type="text" value="${(k.zona || '').replace(/"/g, '&quot;')}" placeholder="Hombro derecho..." onchange="actualizarKine('${k.id}','zona',this.value)" class="bg-black border border-slate-800 rounded p-1 text-white text-xs w-28"></td>
            <td class="p-2"><select onchange="actualizarKine('${k.id}','estado',this.value)" class="bg-black border border-slate-800 rounded p-1 ${colorEstado} font-bold text-xs">${opts}</select></td>
            <td class="p-2"><input type="text" value="${(k.indicaciones || '').replace(/"/g, '&quot;')}" placeholder="Ejercicios de rehab..." onchange="actualizarKine('${k.id}','indicaciones',this.value)" class="bg-black border border-slate-800 rounded p-1 text-slate-300 text-xs w-40"></td>
            <td class="p-2"><input type="date" value="${k.proximo_control || ''}" onchange="actualizarKine('${k.id}','proximo_control',this.value)" class="bg-black border border-slate-800 rounded p-1 text-amber-400 text-xs"></td>
            <td class="p-2">${celdaArchivo(k, 'kine')}</td>
            <td class="p-2 text-right"><button onclick="eliminarKine('${k.id}')" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`;
    }).join('');
}

async function agregarKineCliente() {
    const clienteId = document.getElementById('edit-id').value;
    if (!clienteId) return;
    try {
        await Api.agregarKine(clienteId, { fecha: fechaHoyISO(), zona: '', estado: 'Apto', indicaciones: '', proximo_control: null });
        await cargarSaludCliente(clienteId);
    } catch (err) { alert('No se pudo agregar (¿corriste migracion_salud.sql?): ' + err.message); }
}

async function actualizarKine(id, campo, valor) {
    await Api.actualizarKine(id, { [campo]: valor || null });
    await cargarSaludCliente(saludActual.clienteId);
}

async function eliminarKine(id) {
    await Api.eliminarKine(id);
    await cargarSaludCliente(saludActual.clienteId);
}

// ------------------------------------------------------------
// ARCHIVOS ADJUNTOS (PDF) en Nutri / Kine / Medidas
// ------------------------------------------------------------
function clienteActualExpediente() {
    const id = document.getElementById('edit-id').value;
    return clientesData.find(c => c.id === id);
}

// Devuelve el HTML de la celda de archivo: si hay archivo muestra el link,
// botón de WhatsApp y botón de quitar; si no, un botón "Subir".
const ETIQUETAS_ARCHIVO = { nutri: 'tu pauta nutricional', kine: 'tu informe de kinesiología', medida: 'tu archivo de medidas' };

// Ubica el valor guardado en archivo_url para una fila (nutri/kine/medida).
function archivoDeFila(tipo, filaId) {
    if (tipo === 'nutri') return (saludActual.nutri.find(n => n.id === filaId) || {}).archivo_url;
    if (tipo === 'kine') return (saludActual.kine.find(k => k.id === filaId) || {}).archivo_url;
    if (tipo === 'medida') { const c = clienteActualExpediente(); return ((c && c.medidasHistorial || []).find(m => m.id === filaId) || {}).archivo_url; }
    return null;
}

function celdaArchivo(fila, tipo) {
    if (fila.archivo_url) {
        const c = clienteActualExpediente();
        const nombre = escapeHtml(fila.archivo_nombre || 'ver');
        let wsp = '';
        if (c && limpiarTelefonoWhatsApp(c.telefono)) {
            wsp = `<button onclick="enviarArchivoWhatsApp('${tipo}','${fila.id}')" class="text-green-400 hover:text-green-300" title="Enviar por WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>`;
        }
        return `<div class="flex items-center gap-2">
            <button onclick="abrirArchivo('${tipo}','${fila.id}')" class="text-cyan-400 hover:text-cyan-300 truncate max-w-[110px]" title="${nombre}"><i class="fa-solid fa-file-pdf"></i> ${nombre}</button>
            ${wsp}
            <button onclick="eliminarArchivo('${tipo}','${fila.id}')" class="text-rose-400 hover:text-rose-300" title="Quitar archivo"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    }
    return `<button onclick="subirArchivo('${tipo}','${fila.id}')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap"><i class="fa-solid fa-upload"></i> Subir</button>`;
}

// Abre el archivo con un enlace firmado temporal (1 hora). El bucket es
// privado, así que nunca se expone una URL permanente.
async function abrirArchivo(tipo, filaId) {
    const archivo = archivoDeFila(tipo, filaId);
    if (!archivo) return;
    try {
        const url = await Api.urlFirmada(archivo, 3600);
        if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
        alert('No se pudo abrir el archivo: ' + e.message);
    }
}

// Comparte el archivo por WhatsApp con un enlace firmado de 7 días (para que
// el cliente alcance a abrirlo). Luego expira solo.
async function enviarArchivoWhatsApp(tipo, filaId) {
    const c = clienteActualExpediente();
    const archivo = archivoDeFila(tipo, filaId);
    if (!c || !archivo) return;
    try {
        const url = await Api.urlFirmada(archivo, 604800);
        const etiqueta = ETIQUETAS_ARCHIVO[tipo] || 'tu archivo';
        const msg = `Hola ${c.nombre} 👋 Aquí está ${etiqueta} de Gimnasio Demo (el enlace vence en unos días): ${url}`;
        window.open(enlaceWhatsApp(c.telefono, msg), '_blank', 'noopener');
    } catch (e) {
        alert('No se pudo generar el enlace: ' + e.message);
    }
}

function subirArchivo(tipo, filaId) {
    const clienteId = document.getElementById('edit-id').value;
    if (!clienteId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,image/*,.doc,.docx,.xls,.xlsx';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
            mostrarCargando(true);
            const { url, nombre } = await Api.subirArchivo(clienteId, tipo, file);
            const payload = { archivo_url: url, archivo_nombre: nombre };
            await aplicarCambioArchivo(tipo, filaId, payload, clienteId);
        } catch (err) {
            alert('No se pudo subir el archivo (¿corriste migracion_storage.sql?): ' + err.message);
        } finally {
            mostrarCargando(false);
        }
    };
    input.click();
}

async function eliminarArchivo(tipo, filaId) {
    const clienteId = document.getElementById('edit-id').value;
    if (!confirm('¿Quitar el archivo adjunto?')) return;

    // Ubica el archivo actual para borrarlo del Storage.
    const url = archivoDeFila(tipo, filaId);

    try { if (url) await Api.eliminarArchivoStorage(url); } catch (e) { console.warn('No se borró del storage:', e.message); }
    await aplicarCambioArchivo(tipo, filaId, { archivo_url: null, archivo_nombre: null }, clienteId);
}

// Guarda el cambio de archivo en la fila correcta y refresca la vista.
async function aplicarCambioArchivo(tipo, filaId, payload, clienteId) {
    if (tipo === 'nutri') { await Api.actualizarNutri(filaId, payload); await cargarSaludCliente(clienteId); }
    else if (tipo === 'kine') { await Api.actualizarKine(filaId, payload); await cargarSaludCliente(clienteId); }
    else if (tipo === 'medida') { await Api.actualizarMedida(filaId, payload); await recargarClientes(); abrirModalEditarCliente(clienteId); cambiarTabExpediente('tab-medidas'); }
}

// ------------------------------------------------------------
// CONTRATO DEL GIMNASIO (firma digital)
// ------------------------------------------------------------
let firmaDibujando = false;
let firmaHayTrazo = false;
let firmaCanvasListo = false;

function renderizarContrato(c) {
    const box = document.getElementById('contrato-estado-firmado');
    const info = document.getElementById('contrato-info');
    const img = document.getElementById('contrato-firma-img');
    const nombreInput = document.getElementById('contrato-nombre-input');

    // Si ya firmó, muestra el estado firmado.
    if (c.contratoFirma) {
        box.classList.remove('hidden');
        img.src = c.contratoFirma;
        const rut = c.contratoRut ? ` · RUT ${c.contratoRut}` : '';
        info.innerText = `Firmado por ${c.contratoNombre || (c.nombre + ' ' + c.apellido)}${rut} el ${formatearFecha(c.contratoFecha)}`;
    } else {
        box.classList.add('hidden');
        img.removeAttribute('src');
        info.innerText = '';
    }
    // Prellena nombre y RUT con lo del cliente.
    if (nombreInput) nombreInput.value = c.contratoNombre || `${c.nombre} ${c.apellido}`;
    const rutInput = document.getElementById('contrato-rut-input');
    if (rutInput) rutInput.value = c.contratoRut || '';

    limpiarFirma();
    inicializarCanvasFirma();
}

function inicializarCanvasFirma() {
    const canvas = document.getElementById('contrato-canvas');
    if (!canvas) return;
    // Ajusta el ancho real del canvas a su tamaño en pantalla (una vez visible).
    const ancho = canvas.clientWidth || 400;
    if (canvas.width !== ancho) canvas.width = ancho;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (firmaCanvasListo) return; // no re-enlazar eventos
    firmaCanvasListo = true;

    const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        const p = e.touches ? e.touches[0] : e;
        return { x: p.clientX - r.left, y: p.clientY - r.top };
    };
    const start = (e) => { firmaDibujando = true; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); };
    const move = (e) => { if (!firmaDibujando) return; const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); firmaHayTrazo = true; e.preventDefault(); };
    const end = () => { firmaDibujando = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
}

function limpiarFirma() {
    const canvas = document.getElementById('contrato-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    firmaHayTrazo = false;
}

async function guardarContratoFirma() {
    const clienteId = document.getElementById('edit-id').value;
    if (!clienteId) return;
    if (!firmaHayTrazo) return alert('Primero dibuja la firma en el recuadro blanco.');

    const nombre = document.getElementById('contrato-nombre-input').value.trim();
    if (!nombre) return alert('Escribe el nombre de quien firma.');
    const rut = document.getElementById('contrato-rut-input').value.trim();
    if (!rut) return alert('Escribe el RUT o Pasaporte de quien firma.');

    const canvas = document.getElementById('contrato-canvas');
    const firmaDataUrl = canvas.toDataURL('image/png');

    try {
        await Api.actualizarCliente(clienteId, {
            contratoFirma: firmaDataUrl,
            contratoFecha: fechaHoyISO(),
            contratoNombre: nombre,
            contratoRut: rut
        });
        await recargarClientes();
        abrirModalEditarCliente(clienteId);
        cambiarTabExpediente('tab-contrato');
        alert('✅ Contrato firmado y guardado correctamente.');
    } catch (err) {
        alert('No se pudo guardar la firma (¿corriste migracion_extra.sql?): ' + err.message);
    }
}

// Genera una vista imprimible del contrato firmado (texto legal + datos + firma)
// para guardarla como PDF y enviarla por correo. Usa la impresión del navegador.
function descargarContratoFirmado() {
    const clienteId = document.getElementById('edit-id').value;
    const c = clientesData.find(x => x.id === clienteId);
    if (!c) return;
    if (!c.contratoFirma) return alert('Este cliente todavía no ha firmado el contrato.');

    const textoLegal = document.getElementById('contrato-texto-legal').innerHTML;
    const nombre = c.contratoNombre || `${c.nombre} ${c.apellido}`;
    const rut = c.contratoRut ? `RUT / Pasaporte: ${c.contratoRut}` : '';
    const fecha = formatearFecha(c.contratoFecha);

    const win = window.open('', '_blank');
    if (!win) return alert('El navegador bloqueó la ventana. Permite las ventanas emergentes e inténtalo de nuevo.');

    win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
        <title>Contrato Gimnasio Demo - ${nombre}</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; line-height: 1.5; font-size: 12px; }
            h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
            h3 { font-size: 13px; margin: 14px 0 4px; border-top: 1px solid #ccc; padding-top: 8px; }
            p { margin: 6px 0; }
            .sub { text-align: center; color: #555; margin-bottom: 16px; }
            .firma-box { margin-top: 28px; border-top: 2px solid #111; padding-top: 14px; }
            .firma-box img { height: 90px; border: 1px solid #ccc; border-radius: 6px; padding: 4px; }
            .datos { margin-bottom: 8px; }
            .datos b { display: inline-block; min-width: 130px; }
            @media print { body { margin: 12mm; } }
        </style></head><body>
        <h1>GIMNASIO DEMO SpA</h1>
        <p class="sub">Contrato de inscripción y aceptación de reglamentos</p>
        <div>${textoLegal}</div>
        <div class="firma-box">
            <p class="datos"><b>Firmado por:</b> ${nombre}</p>
            ${rut ? `<p class="datos"><b>${rut.split(':')[0]}:</b> ${c.contratoRut}</p>` : ''}
            <p class="datos"><b>Fecha de firma:</b> ${fecha}</p>
            <p class="datos"><b>Firma:</b></p>
            <img src="${c.contratoFirma}" alt="Firma">
            <p style="color:#777;font-style:italic;margin-top:10px;">Documento firmado electrónicamente. La firma electrónica tiene el mismo valor que una firma manuscrita.</p>
        </div>
        <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
        </body></html>`);
    win.document.close();
}

async function guardarEdicionClienteCompleta() {
    const id = document.getElementById('edit-id').value;
    if (!id) return;

    await Api.actualizarCliente(id, {
        rut: document.getElementById('edit-rut') ? (document.getElementById('edit-rut').value.trim() || null) : undefined,
        nombre: document.getElementById('edit-nombre').value,
        apellido: document.getElementById('edit-apellido').value,
        cumpleanos: document.getElementById('edit-cumpleanos').value || null,
        genero: document.getElementById('edit-genero').value || null,
        correo: document.getElementById('edit-correo').value,
        telefono: document.getElementById('edit-telefono').value,
        telefonoEmergencia: document.getElementById('edit-telefono-emergencia').value || null,
        emergencia1Nombre: document.getElementById('edit-emergencia1-nombre').value || null,
        emergencia2Nombre: document.getElementById('edit-emergencia2-nombre').value || null,
        emergencia2Telefono: document.getElementById('edit-emergencia2-telefono').value || null,
        emergenciaLugar: document.getElementById('edit-emergencia-lugar').value || null,
        observaciones: document.getElementById('edit-observaciones').value || null,
        saludControlesAlDia: document.getElementById('edit-salud-controles').checked,
        saludEnfermedades: document.getElementById('edit-salud-enfermedades').value || null,
        saludMedicamentos: document.getElementById('edit-salud-medicamentos').value || null,
        saludAlergias: document.getElementById('edit-salud-alergias').value || null,
        saludLesiones: document.getElementById('edit-salud-lesiones').value || null,
        saludGrupo: document.getElementById('edit-salud-grupo').value || null,
        saludNotas: document.getElementById('edit-salud-notas').value || null,
        planId: document.getElementById('edit-plan').value,
        racha_meses: parseInt(document.getElementById('edit-racha').value) || 1,
        vence: document.getElementById('edit-vencimiento').value || null,
        estado: document.getElementById('edit-estado').value
    });

    cerrarModalEditarCliente();
    await recargarClientes();
    alert("¡Expediente actualizado con éxito!");
}

// ------------------------------------------------------------
// CONTROL DIARIO DE ASISTENCIAS
// ------------------------------------------------------------
function renderizarAsistencias() {
    const cont = document.getElementById('grid-asistencias');
    if (!cont) return;

    // Contador de presentes (sobre el total, no sobre el filtro).
    const presentes = clientesData.filter(c => c.asistioHoy).length;
    const elCont = document.getElementById('asist-contador');
    if (elCont) elCont.innerText = `✅ ${presentes} presentes hoy · ${clientesData.length} clientes`;

    // Filtra por el buscador (sin acentos, para que "angela" encuentre "Ángela").
    const q = quitarAcentos((document.getElementById('buscar-asistencia')?.value || '').toLowerCase().trim());
    const lista = q
        ? clientesData.filter(c => quitarAcentos(`${c.nombre} ${c.apellido}`.toLowerCase()).includes(q))
        : clientesData;

    cont.innerHTML = lista.map(c => `
            <div class="bg-black border border-slate-800 p-3 rounded-2xl flex justify-between items-center text-xs gap-2">
                <div class="min-w-0"><span class="font-bold text-white block truncate">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</span><span class="text-[10px] text-slate-500">Asistencias mes: ${c.asistenciasMes || 0}</span></div>
                <button onclick="toggleAsistencia('${c.id}')" class="${c.asistioHoy ? 'bg-emerald-500 text-black font-black' : 'bg-slate-800 text-slate-400'} px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap">
                    ${c.asistioHoy ? '✓ Presente Hoy' : 'Marcar Presente'}
                </button>
            </div>
        `).join('') || '<p class="text-slate-500 text-xs text-center p-4 col-span-full">Sin resultados para tu búsqueda.</p>';
}

async function toggleAsistencia(id) {
    const c = clientesData.find(item => item.id === id);
    if (!c) return;
    const marcar = !c.asistioHoy;
    const baseAsist = c.asistenciasMes || 0; // valor ANTES de tocar (la API recalcula desde acá)

    // 1) Optimista: actualiza el objeto local y repinta al instante SOLO lo que
    //    depende de la asistencia (sin refetch de red ni re-render de todo).
    c.asistioHoy = marcar;
    c.asistenciasMes = Math.max(0, baseAsist + (marcar ? 1 : -1));
    renderizarAsistencias();
    renderizarAsistenciaMensual();
    renderizarRuleta();
    calcularMetricas();

    // 2) Persiste en la base en segundo plano. Le paso el valor base para que
    //    su +1/-1 dé el resultado correcto en Supabase.
    try {
        const snapshot = { id: c.id, asistenciasMes: baseAsist };
        if (marcar) await Api.marcarAsistenciaHoy(snapshot, 'manual');
        else await Api.desmarcarAsistenciaHoy(snapshot);
    } catch (err) {
        // Si falla el guardado, revierte el cambio local y avisa.
        c.asistioHoy = !marcar;
        c.asistenciasMes = baseAsist;
        renderizarAsistencias();
        renderizarAsistenciaMensual();
        renderizarRuleta();
        calcularMetricas();
        alert('No se pudo guardar la asistencia: ' + err.message);
    }
}

// ------------------------------------------------------------
// CUMPLEAÑOS Y ANIVERSARIOS
// ------------------------------------------------------------
function cargarCumpleanosYAniversarios() {
    const listaCumple = document.getElementById('lista-cumpleanos');
    const listaAniv = document.getElementById('lista-aniversarios');
    if (!listaCumple) return;
    listaCumple.innerHTML = clientesData.map(c =>
        `<div class="bg-black/60 p-3 rounded-2xl border border-slate-800 flex justify-between items-center"><h4 class="font-bold text-white text-xs">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</h4><span class="text-[10px] text-purple-300"><i class="fa-solid fa-cake-candles"></i> ${escapeHtml(c.cumpleanos || '—')}</span></div>`
    ).join('');
    listaAniv.innerHTML = clientesData.map(c =>
        `<div class="bg-black/60 p-3 rounded-2xl border border-slate-800 flex justify-between items-center"><h4 class="font-bold text-white text-xs">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</h4><span class="text-[10px] text-emerald-300">Ingreso: ${escapeHtml(c.fechaIngreso || '—')}</span></div>`
    ).join('');
}

// Días hasta la próxima ocurrencia anual de una fecha (0 = hoy). Ignora el año.
function diasHastaAnual(fechaISO) {
    if (!fechaISO) return null;
    const p = String(fechaISO).split('-');
    if (p.length < 3) return null;
    const mes = parseInt(p[1]) - 1, dia = parseInt(p[2]);
    if (isNaN(mes) || isNaN(dia)) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let prox = new Date(hoy.getFullYear(), mes, dia);
    if (prox < hoy) prox = new Date(hoy.getFullYear() + 1, mes, dia);
    return Math.round((prox - hoy) / 86400000);
}

function textoCuando(dias) {
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    return `en ${dias} días`;
}

// Paneles del inicio (home): por vencer esta semana + cumpleaños/aniversarios.
function renderizarHome() {
    // --- Por vencer esta semana (0-7 días, sin contar congelados) ---
    const cont = document.getElementById('home-vencer-lista');
    if (cont) {
        const porVencer = clientesData
            .filter(c => c.estado !== 'Congelado' && !esPlanIndefinido(c.planId))
            .map(c => ({ c, dias: calcularDiasParaVencer(c.vence) }))
            .filter(x => x.dias >= 0 && x.dias <= 7)
            .sort((a, b) => a.dias - b.dias);
        const cnt = document.getElementById('home-vencer-count');
        if (cnt) cnt.innerText = `${porVencer.length} cliente${porVencer.length === 1 ? '' : 's'}`;
        cont.innerHTML = porVencer.length ? porVencer.map(({ c, dias }) => {
            const num = limpiarTelefonoWhatsApp(c.telefono);
            const msg = `Hola ${c.nombre} 👋 Te recordamos que tu plan en Gimnasio Demo vence ${textoCuando(dias)} (${formatearFecha(c.vence)}). Renueva a tiempo para no perder tu racha 🔥 ¡Te esperamos! 💪`;
            const btn = num
                ? `<a href="${enlaceWhatsApp(c.telefono, msg)}" target="_blank" rel="noopener" class="bg-green-500 hover:bg-green-400 text-black font-black px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap"><i class="fa-brands fa-whatsapp"></i> Avisar</a>`
                : `<span class="text-[9px] text-rose-400 whitespace-nowrap">📵 sin teléfono</span>`;
            const color = dias <= 1 ? 'text-rose-400' : (dias <= 3 ? 'text-amber-400' : 'text-slate-400');
            return `<div class="bg-black/50 p-3 rounded-2xl border border-slate-800 flex justify-between items-center gap-2">
                <div class="min-w-0"><span class="font-bold text-white text-xs block truncate">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</span><span class="text-[10px] ${color} font-bold">Vence ${textoCuando(dias)} · ${formatearFecha(c.vence)}</span></div>
                ${btn}
            </div>`;
        }).join('') : '<p class="text-slate-500 text-xs text-center p-3">Nadie vence en los próximos 7 días 🎉</p>';
    }

    // --- Cumpleaños & aniversarios (próximos 7 días) ---
    const contC = document.getElementById('home-cumple-lista');
    if (contC) {
        const items = [];
        const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
        clientesData.forEach(c => {
            const dCumple = diasHastaAnual(c.cumpleanos);
            if (dCumple !== null && dCumple <= 7) items.push({ c, dias: dCumple, tipo: 'cumple' });
            if (c.fechaIngreso) {
                const pi = String(c.fechaIngreso).split('-');
                if (pi.length === 3) {
                    const mesI = parseInt(pi[1]) - 1, diaI = parseInt(pi[2]), anioI = parseInt(pi[0]);
                    if (!isNaN(mesI) && !isNaN(diaI) && !isNaN(anioI)) {
                        let occ = new Date(hoy0.getFullYear(), mesI, diaI);
                        if (occ < hoy0) occ = new Date(hoy0.getFullYear() + 1, mesI, diaI);
                        const dAniv = Math.round((occ - hoy0) / 86400000);
                        const anios = occ.getFullYear() - anioI;
                        if (dAniv <= 7 && anios >= 1) items.push({ c, dias: dAniv, tipo: 'aniv', anios });
                    }
                }
            }
        });
        items.sort((a, b) => a.dias - b.dias);
        const cntC = document.getElementById('home-cumple-count');
        if (cntC) cntC.innerText = `${items.length}`;
        contC.innerHTML = items.length ? items.map(it => {
            const c = it.c;
            const num = limpiarTelefonoWhatsApp(c.telefono);
            if (it.tipo === 'cumple') {
                const msg = `¡Feliz cumpleaños ${c.nombre}! 🎂🎉 De parte de todo el equipo de Gimnasio Demo te deseamos un excelente día 💪`;
                const btn = num ? `<a href="${enlaceWhatsApp(c.telefono, msg)}" target="_blank" rel="noopener" class="bg-pink-500 hover:bg-pink-400 text-black font-black px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap"><i class="fa-brands fa-whatsapp"></i> Saludar</a>` : '';
                return `<div class="bg-black/50 p-3 rounded-2xl border border-slate-800 flex justify-between items-center gap-2">
                    <div class="min-w-0"><span class="font-bold text-white text-xs block truncate">🎂 ${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</span><span class="text-[10px] text-pink-300 font-bold">Cumple ${textoCuando(it.dias)}</span></div>${btn}</div>`;
            }
            return `<div class="bg-black/50 p-3 rounded-2xl border border-slate-800 flex justify-between items-center gap-2">
                <div class="min-w-0"><span class="font-bold text-white text-xs block truncate">🏆 ${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</span><span class="text-[10px] text-emerald-300 font-bold">${it.anios} año${it.anios === 1 ? '' : 's'} en el gym · ${textoCuando(it.dias)}</span></div></div>`;
        }).join('') : '<p class="text-slate-500 text-xs text-center p-3">Sin cumpleaños ni aniversarios esta semana.</p>';
    }
}

// Resumen rápido de la cartera (arriba del listado): activos vs inactivos.
// Inactivos = vencidos; activos = el resto (al día + pendientes + congelados).
function actualizarResumenCartera() {
    const total = clientesData.length;
    const inactivos = clientesData.filter(c => c.estado === 'Vencido').length;
    const activos = total - inactivos;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set('resumen-activos', activos);
    set('resumen-inactivos', inactivos);
    set('resumen-total', total);
}

// Chip del header: recordatorio de fichas incompletas (sin teléfono / sin género).
function actualizarChipIncompletas() {
    const chip = document.getElementById('chip-fichas-incompletas');
    const txt = document.getElementById('chip-fichas-texto');
    if (!chip || !txt) return;
    const sinTel = clientesData.filter(c => !limpiarTelefonoWhatsApp(c.telefono)).length;
    const sinGenero = clientesData.filter(c => !c.genero).length;
    if (sinTel === 0 && sinGenero === 0) { chip.classList.remove('md:flex'); return; }
    txt.innerText = `⚠️ ${sinTel} sin tel · ${sinGenero} sin género`;
    chip.classList.add('md:flex');
}

// Al tocar el chip: va al listado filtrado por "sin teléfono" para completarlos.
function irAFichasIncompletas() {
    cambiarSeccionAdmin('sec-alumnos');
    const ft = document.getElementById('filtro-telefono');
    if (ft) ft.value = 'SIN';
    const fo = document.getElementById('filtro-orden');
    if (fo) fo.value = 'AZ';
    if (typeof aplicarFiltrosClientes === 'function') aplicarFiltrosClientes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------------------------
// MENSAJES DE WHATSAPP (envío con 1 clic)
// ------------------------------------------------------------
// No enviamos nada automáticamente: armamos el mensaje y abrimos
// WhatsApp con el texto ya escrito. El staff revisa y presiona enviar.
// Así es 100% gratis y no necesita WhatsApp Business API.

// Deja el teléfono solo con dígitos (formato que espera wa.me). Si el
// número no trae código de país, asumimos Chile (56) como cae la mayoría.
function limpiarTelefonoWhatsApp(tel) {
    if (!tel) return '';
    let d = String(tel).replace(/\D/g, ''); // solo números
    if (!d) return '';
    if (d.startsWith('56')) return d;            // ya trae código Chile
    if (d.startsWith('9') && d.length === 9) return '56' + d; // celular chileno sin código
    return d; // otro caso: se usa tal cual
}

function enlaceWhatsApp(tel, mensaje) {
    const num = limpiarTelefonoWhatsApp(tel);
    return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

// Texto del beneficio según el piso de racha alcanzado.
function beneficioRacha(racha) {
    if (racha === 20) return '¡un MES GRATIS de plan! 🎉';
    const desc = calcularDescuentoRacha(racha); // 5000, 10000, 15000
    return `$${Number(desc).toLocaleString('es-CL')} de descuento en tu próxima cuota`;
}

// Arma el link de correo (mailto) con asunto y cuerpo ya escritos.
function enlaceCorreo(correo, asunto, mensaje) {
    return `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
}

function tarjetaMensaje(c, mensaje, colorBtn, asunto = 'Gimnasio Demo') {
    const num = limpiarTelefonoWhatsApp(c.telefono);
    const btnWsp = num
        ? `<a href="${enlaceWhatsApp(c.telefono, mensaje)}" target="_blank" rel="noopener" class="${colorBtn} text-black font-black px-3 py-1.5 rounded-xl text-[11px] whitespace-nowrap"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>`
        : `<span class="text-[10px] text-rose-400 font-bold">Sin teléfono</span>`;
    const btnMail = c.correo
        ? `<a href="${enlaceCorreo(c.correo, asunto, mensaje)}" class="bg-blue-500 hover:bg-blue-400 text-white font-black px-3 py-1.5 rounded-xl text-[11px] whitespace-nowrap"><i class="fa-solid fa-envelope"></i> Correo</a>`
        : '';
    return `
        <div class="bg-black/60 p-3 rounded-2xl border border-slate-800 flex justify-between items-center gap-3">
            <div class="min-w-0">
                <h4 class="font-bold text-white text-xs">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</h4>
                <p class="text-[10px] text-slate-500 truncate">${escapeHtml(c.telefono || 'sin tel.')} ${c.correo ? '· ' + escapeHtml(c.correo) : ''}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">${btnWsp}${btnMail}</div>
        </div>`;
}

// Devuelve el mes (1-12) de una fecha "AAAA-MM-DD", o null.
function mesDeFecha(iso) {
    if (!iso) return null;
    const partes = String(iso).split('-');
    return partes.length === 3 ? parseInt(partes[1], 10) : null;
}

// Devuelve el día (1-31) de una fecha "AAAA-MM-DD", para ordenar.
function diaDeFecha(iso) {
    if (!iso) return 99;
    const partes = String(iso).split('-');
    return partes.length === 3 ? parseInt(partes[2], 10) : 99;
}

function renderizarMensajesWhatsApp() {
    const contCumple = document.getElementById('lista-msg-cumple');
    const contRacha = document.getElementById('lista-msg-racha');
    const contRenov = document.getElementById('lista-msg-renovacion');
    if (!contRacha || !contRenov) return;

    const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesActual = new Date().getMonth() + 1; // 1-12

    // --- 0) Cumpleaños del mes actual (descuento $2.000) ---
    if (contCumple) {
        const lblMes = document.getElementById('msg-cumple-mes');
        if (lblMes) lblMes.innerText = NOMBRES_MES[mesActual - 1];

        const cumpleaneros = clientesData
            .filter(c => mesDeFecha(c.cumpleanos) === mesActual)
            .sort((a, b) => diaDeFecha(a.cumpleanos) - diaDeFecha(b.cumpleanos));

        const conteo = document.getElementById('msg-cumple-conteo');
        if (conteo) conteo.innerText = cumpleaneros.length ? `${cumpleaneros.length} este mes` : '';

        if (cumpleaneros.length === 0) {
            contCumple.innerHTML = `<p class="text-[11px] text-slate-600">Nadie cumple años en ${NOMBRES_MES[mesActual - 1]}.</p>`;
        } else {
            contCumple.innerHTML = cumpleaneros.map(c => {
                const dia = diaDeFecha(c.cumpleanos);
                const msg = `¡Feliz cumpleaños ${c.nombre}! 🎂🎉 En Gimnasio Demo queremos celebrarte con $2.000 de descuento en tu próxima cuota. ¡Que tengas un gran día y nos vemos en el gym! 💪`;
                return tarjetaMensaje(c, msg, 'bg-purple-400 hover:bg-purple-300', '🎂 ¡Feliz cumpleaños de parte de Gimnasio Demo!').replace(
                    `<h4 class="font-bold text-white text-xs">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</h4>`,
                    `<h4 class="font-bold text-white text-xs">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)} <span class="text-purple-300 font-normal">· 🎂 día ${dia}</span></h4>`
                );
            }).join('');
        }
    }

    // --- 1) Felicitaciones + cupón: a 5 días de PAGAR el mes que los lleva a un piso premiado (5,10,15,20) ---
    const pisos = [5, 10, 15, 20];
    const porPremiar = clientesData
        .map(c => ({ c, dias: calcularDiasParaVencer(c.vence), proximo: (c.racha_meses || 0) + 1 }))
        .filter(x => pisos.includes(x.proximo) && x.dias >= 0 && x.dias <= 5)
        .sort((a, b) => a.dias - b.dias);

    if (porPremiar.length === 0) {
        contRacha.innerHTML = `<p class="text-[11px] text-slate-600">Nadie está a 5 días de completar un mes premiado (5, 10, 15 o 20). ✅</p>`;
    } else {
        contRacha.innerHTML = porPremiar.map(({ c, dias, proximo }) => {
            const cuando = dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`;
            const premio = beneficioRacha(proximo); // cupón del piso que va a alcanzar
            const msg = `¡Hola ${c.nombre}! 🔥 Estás a punto de completar tu mes ${proximo} de racha en Gimnasio Demo (tu plan vence ${cuando}, ${formatearFecha(c.vence)}). Al renovar a tiempo te ganas ${premio} 🎁 ¡No pierdas tu racha, te esperamos! 💪`;
            return tarjetaMensaje(c, msg, 'bg-green-400 hover:bg-green-300', '🔥 ¡Tu cupón de racha te espera! · Gimnasio Demo');
        }).join('');
    }

    // --- 2) Recordatorios de renovación (vence en 5 días o menos) ---
    const porVencer = clientesData
        .map(c => ({ c, dias: calcularDiasParaVencer(c.vence) }))
        .filter(x => x.dias >= 0 && x.dias <= 5)
        .sort((a, b) => a.dias - b.dias);

    if (porVencer.length === 0) {
        contRenov.innerHTML = `<p class="text-[11px] text-slate-600">Nadie vence en los próximos 5 días. ✅</p>`;
    } else {
        contRenov.innerHTML = porVencer.map(({ c, dias }) => {
            const cuando = dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`;
            const msg = `Hola ${c.nombre} 👋 Te recordamos que tu plan en Gimnasio Demo vence ${cuando} (${formatearFecha(c.vence)}). Renueva a tiempo para no perder tu racha de ${c.racha_meses} ${c.racha_meses === 1 ? 'mes' : 'meses'} 🔥 (la racha se pierde si el pago se atrasa más de 4 días). ¡Te esperamos! 💪`;
            return tarjetaMensaje(c, msg, 'bg-amber-400 hover:bg-amber-300', '⏰ Recordatorio de renovación · Gimnasio Demo');
        }).join('');
    }
}

// ------------------------------------------------------------
// MODO TV / CONFIG TV
// ------------------------------------------------------------
function abrirConfiguracionTV() { document.getElementById('modal-config-tv').classList.remove('hidden'); }
function cerrarConfiguracionTV() { document.getElementById('modal-config-tv').classList.add('hidden'); }

// Clave estable para guardar cada casilla: su id, o "nom:<sabor>" si no tiene id.
function claveConfigTV(chk) {
    return chk.id || ('nom:' + (chk.dataset.nombre || ''));
}

// Guarda en el navegador TODAS las casillas del Modo TV (categorías + sabores).
function guardarConfigTV() {
    const estado = {};
    document.querySelectorAll('.tv-config-chk').forEach(chk => { estado[claveConfigTV(chk)] = chk.checked; });
    localStorage.setItem('javofit_config_tv', JSON.stringify(estado));
    cerrarConfiguracionTV();
}

// Aplica al cargar la app las casillas guardadas (si existen).
function cargarConfigTV() {
    const guardado = localStorage.getItem('javofit_config_tv');
    if (!guardado) return;
    try {
        const estado = JSON.parse(guardado);
        document.querySelectorAll('.tv-config-chk').forEach(chk => {
            const k = claveConfigTV(chk);
            if (typeof estado[k] === 'boolean') chk.checked = estado[k];
        });
    } catch (e) { /* si el dato está corrupto, se ignora */ }
}

// Arma un bloque de ranking del Modo TV con hasta 7 filas ya calculadas.
// items = [{ nombre, valor, destacado? }]
function bloqueRankingTV(titulo, borderClass, textClass, items) {
    let filas = '';
    if (items.length === 0) {
        filas = `<div class="text-slate-500 text-center py-4 text-xl">Sin datos todavía</div>`;
    } else {
        items.forEach((it, i) => {
            const medalla = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `${i + 1}.`));
            filas += `<div class="flex justify-between p-4 bg-black rounded-xl items-center gap-4">
                <span class="text-white font-bold min-w-0"><span class="text-slate-500 mr-2">${medalla}</span>${it.nombre}</span>
                <strong class="${textClass} whitespace-nowrap text-4xl md:text-5xl">${it.valor}</strong>
            </div>`;
        });
    }
    return `<div class="bg-slate-950 border-4 ${borderClass} p-6 md:p-8 rounded-3xl space-y-4">
        <h2 class="text-3xl md:text-4xl font-black ${textClass}">${titulo}</h2>
        <div class="space-y-4 text-2xl md:text-3xl">${filas}</div>
    </div>`;
}

// Panel de sabores disponibles (snacks / frappes) para el Modo TV.
function bloqueSaboresTV(titulo, borderClass, textClass, sabores, nota) {
    let filas;
    if (!sabores || sabores.length === 0) {
        filas = `<div class="text-slate-500 text-center py-4 text-xl">Sin stock por ahora</div>`;
    } else {
        filas = `<div class="grid grid-cols-2 gap-3">` + sabores.map(s =>
            `<div class="flex items-center gap-2 p-3 bg-black rounded-xl"><span class="text-emerald-400 text-xl">✓</span><span class="text-white font-bold">${s}</span></div>`
        ).join('') + `</div>`;
    }
    const notaHtml = nota ? `<p class="text-base ${textClass} opacity-70">${nota}</p>` : '';
    return `<div class="bg-slate-950 border-4 ${borderClass} p-6 rounded-3xl space-y-4">
        <h2 class="text-3xl md:text-4xl font-black ${textClass}">${titulo}</h2>
        ${notaHtml}
        <div class="text-xl md:text-2xl">${filas}</div>
    </div>`;
}

// Panel combinado de bebidas (Agua + Monster + Power) en UNA sola ventana.
// grupos = [{ sub, sabores }] — solo se muestran los que tienen stock.
function bloqueBebidasTV(titulo, borderClass, textClass, grupos) {
    const secciones = grupos.filter(g => g.sabores && g.sabores.length).map(g => `
        <div class="space-y-2">
            <h3 class="text-2xl md:text-3xl font-black ${textClass} opacity-90">${g.sub}</h3>
            <div class="grid grid-cols-2 gap-3">${g.sabores.map(s =>
                `<div class="flex items-center gap-2 p-3 bg-black rounded-xl"><span class="text-emerald-400 text-xl">✓</span><span class="text-white font-bold">${s}</span></div>`
            ).join('')}</div>
        </div>`).join('');
    const cuerpo = secciones || `<div class="text-slate-500 text-center py-4 text-xl">Sin stock por ahora</div>`;
    return `<div class="bg-slate-950 border-4 ${borderClass} p-6 rounded-3xl space-y-5">
        <h2 class="text-3xl md:text-4xl font-black ${textClass}">${titulo}</h2>
        <div class="text-xl md:text-2xl space-y-5">${cuerpo}</div>
    </div>`;
}

let tvCarruselTimer = null; // intervalo del carrusel de la TV

// Arma el ARRAY de paneles (strings HTML) según lo activado en Config TV.
function construirPanelesTV() {
    const TOP = 7;
    const paneles = [];

    // Disciplinas de PR (top 7 por marca). match = texto a buscar en el ejercicio.
    // Cada una tiene dos casillas en Config TV: tv-cat-<key>-h y tv-cat-<key>-m.
    // Todos los paneles usan el mismo dorado/ámbar.
    const BORDE = 'border-amber-500/50', TEXTO = 'text-amber-400';
    const disciplinas = [
        { key: 'banca',      titulo: '🏋️ TOP PRESS BANCA', border: BORDE, text: TEXTO, match: 'press banca', unidad: 'KG' },
        { key: 'fondos',     titulo: '💪 TOP FONDOS',       border: BORDE, text: TEXTO, match: 'fondos',      unidad: 'KG' },
        { key: 'sentadilla', titulo: '🦵 TOP SENTADILLA',   border: BORDE, text: TEXTO, match: 'sentadilla',  unidad: 'KG' },
        { key: 'hipthrust',  titulo: '🍑 TOP HIP THRUST',   border: BORDE, text: TEXTO, match: 'hip thrust',  unidad: 'KG' },
        { key: 'biceps',     titulo: '💪 TOP BÍCEPS',       border: BORDE, text: TEXTO, match: 'bíceps',      unidad: 'KG' },
        { key: 'flexiones',  titulo: '🤸 TOP FLEXIONES',    border: BORDE, text: TEXTO, match: 'flexiones',   unidad: 'reps' },
        { key: 'dominadas',  titulo: '🧗 TOP DOMINADAS',    border: BORDE, text: TEXTO, match: 'dominadas',   unidad: 'reps' },
    ];

    const rankingDe = (lista, match, unidad) => lista
        .map(c => ({ c, marca: c.prsHistorial?.find(p => p.ejercicio.toLowerCase().includes(match))?.marca || 0 }))
        .filter(x => x.marca > 0)
        .sort((a, b) => b.marca - a.marca)
        .slice(0, TOP)
        .map(x => ({ nombre: `${x.c.nombre} ${x.c.apellido}`, valor: `${x.marca} ${unidad}` }));

    const hombres = clientesData.filter(c => c.genero === 'M');
    const mujeres = clientesData.filter(c => c.genero === 'F');

    disciplinas.forEach(d => {
        const chkH = document.getElementById(`tv-cat-${d.key}-h`);
        const chkM = document.getElementById(`tv-cat-${d.key}-m`);
        if (chkH && chkH.checked) {
            paneles.push(bloqueRankingTV(`${d.titulo} · ♂ HOMBRES`, d.border, d.text, rankingDe(hombres, d.match, d.unidad)));
        }
        if (chkM && chkM.checked) {
            paneles.push(bloqueRankingTV(`${d.titulo} · ♀ MUJERES`, d.border, d.text, rankingDe(mujeres, d.match, d.unidad)));
        }
    });

    // Rachas de pagos (top 7)
    const chkRachas = document.getElementById('tv-cat-rachas');
    if (!chkRachas || chkRachas.checked) {
        const rachas = [...clientesData]
            .sort((a, b) => b.racha_meses - a.racha_meses)
            .slice(0, TOP)
            .map(c => ({ nombre: `${c.nombre} ${c.apellido}`, valor: `Mes ${c.racha_meses} / 20` }));
        paneles.push(bloqueRankingTV('🔥 RACHAS DE PAGOS', BORDE, TEXTO, rachas));
    }

    // Asistencias del mes (top 7) — marca ⭐ a quienes cumplen su meta según el plan
    const chkAsist = document.getElementById('tv-cat-asistencias');
    if (!chkAsist || chkAsist.checked) {
        const asist = [...clientesData]
            .sort((a, b) => (b.asistenciasMes || 0) - (a.asistenciasMes || 0))
            .slice(0, TOP)
            .map(c => {
                const cumple = (c.asistenciasMes || 0) >= metaAsistencia(c);
                return { nombre: `${c.nombre} ${c.apellido}`, valor: `${c.asistenciasMes || 0} días ${cumple ? '⭐' : ''}`, destacado: cumple };
            });
        paneles.push(bloqueRankingTV('📅 ASISTENCIAS DEL MES', BORDE, TEXTO, asist));
    }

    // Snacks disponibles (sabores en stock marcados en Config TV)
    const chkSnacks = document.getElementById('tv-cat-snacks');
    if (!chkSnacks || chkSnacks.checked) {
        const sabores = [...document.querySelectorAll('.tv-snack-chk')].filter(c => c.checked).map(c => c.dataset.nombre);
        paneles.push(bloqueSaboresTV('🍫 SNACKS DISPONIBLES', BORDE, TEXTO, sabores));
    }

    // Frappes disponibles (sabores en stock)
    const chkFrappes = document.getElementById('tv-cat-frappes');
    if (!chkFrappes || chkFrappes.checked) {
        const sabores = [...document.querySelectorAll('.tv-frappe-chk')].filter(c => c.checked).map(c => c.dataset.nombre);
        paneles.push(bloqueSaboresTV('🥤 FRAPPES DISPONIBLES', BORDE, TEXTO, sabores, 'Todos con o sin café'));
    }

    // Bebidas (Agua + Monster + Power) en UNA sola ventana. Cada grupo se
    // incluye solo si su toggle está activo; los sabores, solo los marcados.
    const gruposBebidas = [];
    const chkAgua = document.getElementById('tv-cat-agua');
    if (!chkAgua || chkAgua.checked) {
        const sabores = [...document.querySelectorAll('.tv-agua-chk')].filter(c => c.checked).map(c => c.dataset.nombre);
        if (sabores.length) gruposBebidas.push({ sub: '💧 Agua', sabores });
    }
    const chkMonster = document.getElementById('tv-cat-monster');
    if (!chkMonster || chkMonster.checked) {
        const sabores = [...document.querySelectorAll('.tv-monster-chk')].filter(c => c.checked).map(c => c.dataset.nombre);
        if (sabores.length) gruposBebidas.push({ sub: '👹 Monster', sabores });
    }
    const chkPower = document.getElementById('tv-cat-power');
    if (!chkPower || chkPower.checked) {
        const sabores = [...document.querySelectorAll('.tv-power-chk')].filter(c => c.checked).map(c => c.dataset.nombre);
        if (sabores.length) gruposBebidas.push({ sub: '⚡ Power', sabores });
    }
    if (gruposBebidas.length) {
        paneles.push(bloqueBebidasTV('🥤 BEBIDAS DISPONIBLES', BORDE, TEXTO, gruposBebidas));
    }

    return paneles;
}

function abrirModoTV() {
    if (tvCarruselTimer) { clearInterval(tvCarruselTimer); tvCarruselTimer = null; }
    const container = document.getElementById('tv-leaderboard-container');
    const paneles = construirPanelesTV();

    if (paneles.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center text-slate-500">No hay categorías activas. Actívalas en "Config TV".</div>`;
        document.getElementById('modal-tv').classList.remove('hidden');
        return;
    }

    const carrusel = document.getElementById('tv-carrusel') ? document.getElementById('tv-carrusel').checked : true;
    const PORPAGINA = 2;

    if (!carrusel || paneles.length <= PORPAGINA) {
        // Estático: todos los paneles en la grilla (o si igual caben en una página).
        container.innerHTML = paneles.join('');
    } else {
        // Carrusel: muestra grupos de 3 paneles y rota cada 9 segundos.
        const totalPaginas = Math.ceil(paneles.length / PORPAGINA);
        let pagina = 0;
        const pintar = () => {
            const inicio = pagina * PORPAGINA;
            const grupo = paneles.slice(inicio, inicio + PORPAGINA);
            const dots = Array.from({ length: totalPaginas }, (_, i) =>
                `<span class="w-2.5 h-2.5 rounded-full ${i === pagina ? 'bg-amber-400' : 'bg-slate-700'}"></span>`).join('');
            container.innerHTML = `
                <div class="col-span-full grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch tv-fade">${grupo.join('')}</div>
                <div class="col-span-full flex justify-center items-center gap-2 pt-2">${dots}
                    <span class="text-slate-500 text-sm ml-2">Página ${pagina + 1}/${totalPaginas}</span>
                </div>`;
            pagina = (pagina + 1) % totalPaginas;
        };
        pintar();
        tvCarruselTimer = setInterval(pintar, 9000);
    }

    document.getElementById('modal-tv').classList.remove('hidden');
}

function cerrarModoTV() {
    if (tvCarruselTimer) { clearInterval(tvCarruselTimer); tvCarruselTimer = null; }
    document.getElementById('modal-tv').classList.add('hidden');
}

// ------------------------------------------------------------
// NUEVO CLIENTE
// ------------------------------------------------------------
function abrirModalNuevoAlumno() {
    document.getElementById('modal-nuevo-cliente').classList.remove('hidden');
    document.getElementById('form-matricula').value = (typeof ConfigGym !== 'undefined') ? ConfigGym.getMatricula() : '0';
    document.getElementById('form-fecha-inicio').value = fechaHoyISO(); // por defecto hoy, el staff la puede cambiar
    calcularPrecioFormulario();
}
function cerrarModalNuevoAlumno() { document.getElementById('modal-nuevo-cliente').classList.add('hidden'); }

function calcularPrecioFormulario() {
    const planId = document.getElementById('form-plan').value;
    const racha = parseInt(document.getElementById('form-racha').value) || 1;
    const referidos = parseInt(document.getElementById('form-referidos').value) || 0;
    const plan = PLANES_GYM.find(p => p.id === planId) || PLANES_GYM[0];
    if (!plan) return;

    const calc = calcularPrecioFinal(plan, racha, referidos);
    const matricula = parseInt(document.getElementById('form-matricula').value) || 0;

    document.getElementById('form-calc-base').innerText = `$${plan.precio.toLocaleString('es-CL')}`;
    document.getElementById('form-calc-desc-racha').innerText = `-$${(calc.esGratisRacha ? plan.precio : calc.descuentoRacha).toLocaleString('es-CL')}${calc.esGratisRacha ? ' (100% Racha 20M)' : ''}`;
    document.getElementById('form-calc-desc-referidos').innerText = `-$${calc.descuentoReferidos.toLocaleString('es-CL')}`;
    document.getElementById('form-calc-matricula').innerText = `+$${matricula.toLocaleString('es-CL')}`;
    document.getElementById('form-calc-total').innerText = `$${(calc.final + matricula).toLocaleString('es-CL')}`;
}

async function guardarNuevoAlumno() {
    const nombre = document.getElementById('form-nombre').value;
    const apellido = document.getElementById('form-apellido').value;
    const telefono = document.getElementById('form-telefono').value;
    const cumpleanos = document.getElementById('form-cumpleanos').value;
    if (!nombre || !apellido || !telefono) return alert("Completa los datos requeridos.");

    const planId = document.getElementById('form-plan').value;
    const plan = PLANES_GYM.find(p => p.id === planId) || PLANES_GYM[0];
    const racha = parseInt(document.getElementById('form-racha').value) || 1;

    // Fecha de inicio que puso el staff (por defecto hoy). El vencimiento
    // se calcula sumando la duración del plan a esa fecha de inicio.
    const fechaInicio = document.getElementById('form-fecha-inicio').value || fechaHoyISO();
    let vence = parseFechaLocal(fechaInicio);
    vence.setMonth(vence.getMonth() + (plan ? plan.duracion_meses : 1));

    const nuevo = await Api.crearCliente({
        nombre, apellido,
        correo: document.getElementById('form-correo').value,
        telefono,
        telefonoEmergencia: document.getElementById('form-telefono-emergencia').value || null,
        cumpleanos: cumpleanos || null,
        planId, racha_meses: racha,
        vence: fechaLocalISO(vence),
        estado: "Al día",
        genero: document.getElementById('form-genero').value || null,
        registradoPor: nombreStaffActual() // se detecta de la sesión, no se escribe
    });

    const metodo = document.getElementById('form-metodo').value || "Efectivo";

    if (plan) {
        await Api.agregarPago(nuevo.id, { fecha: fechaInicio, concepto: plan.nombre, monto: plan.precio, metodo });
    }

    // Matrícula de ingreso (pago único aparte), solo si se cobró.
    const matricula = parseInt(document.getElementById('form-matricula').value) || 0;
    if (matricula > 0) {
        await Api.agregarPago(nuevo.id, { fecha: fechaInicio, concepto: "Matrícula (ingreso)", monto: matricula, metodo });
    }

    cerrarModalNuevoAlumno();
    await recargarClientes();
    alert("¡Cliente registrado con éxito!");
}

async function eliminarCliente(id) {
    if (confirm("¿Eliminar cliente del sistema?")) {
        await Api.eliminarCliente(id);
        await recargarClientes();
    }
}

// ------------------------------------------------------------
// IMPORTACIÓN MASIVA DE CLIENTES (CSV)
// ------------------------------------------------------------
let filasImportCSV = []; // filas válidas listas para insertar (snake_case)

function abrirModalImportarCSV() {
    // Muestra los plan_id válidos para que el usuario sepa qué escribir
    const span = document.getElementById('csv-planes-validos');
    if (span) span.innerText = PLANES_GYM.map(p => p.id).join(', ') || '(corre schema.sql primero)';
    // Limpia estado previo
    filasImportCSV = [];
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-preview-box').classList.add('hidden');
    document.getElementById('btn-confirmar-import').disabled = true;
    document.getElementById('modal-importar-csv').classList.remove('hidden');
}

function cerrarModalImportarCSV() { document.getElementById('modal-importar-csv').classList.add('hidden'); }

function descargarPlantillaCSV() {
    const ejemploPlan = (PLANES_GYM[0] && PLANES_GYM[0].id) || '5d_1m';
    const encabezado = 'nombre,apellido,correo,telefono,cumpleanos,plan_id,racha_meses,vence,estado';
    const ejemplo1 = `Juan,Perez,juan@correo.cl,+56911112222,1990-05-14,${ejemploPlan},3,,Al día`;
    const ejemplo2 = `Camila,Soto,,+56933334444,1996-11-02,${ejemploPlan},1,,Al día`;
    const contenido = '﻿' + [encabezado, ejemplo1, ejemplo2].join('\r\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_clientes_gimnasio.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Parser CSV sencillo pero seguro: respeta comillas y comas dentro de campos.
function parsearCSV(texto) {
    const filas = [];
    let campo = '', fila = [], enComillas = false;
    texto = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < texto.length; i++) {
        const ch = texto[i];
        if (enComillas) {
            if (ch === '"') {
                if (texto[i + 1] === '"') { campo += '"'; i++; }
                else { enComillas = false; }
            } else { campo += ch; }
        } else {
            if (ch === '"') enComillas = true;
            else if (ch === ',') { fila.push(campo); campo = ''; }
            else if (ch === '\n') { fila.push(campo); filas.push(fila); campo = ''; fila = []; }
            else campo += ch;
        }
    }
    if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }
    return filas;
}

function previsualizarCSV() {
    const input = document.getElementById('csv-file-input');
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        let texto = e.target.result;
        if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1); // quita BOM
        const filas = parsearCSV(texto).filter(f => f.some(c => (c || '').trim() !== ''));
        procesarFilasCSV(filas);
    };
    reader.readAsText(file, 'UTF-8');
}

function procesarFilasCSV(filas) {
    const errores = [];
    filasImportCSV = [];
    const previewBody = document.getElementById('csv-preview-body');
    previewBody.innerHTML = '';

    if (filas.length < 2) {
        mostrarErroresCSV(['El archivo no tiene filas de datos (solo el encabezado o está vacío).']);
        return;
    }

    // Mapear encabezados a índices
    const encabezados = filas[0].map(h => h.trim().toLowerCase());
    const idx = (nombre) => encabezados.indexOf(nombre);
    const iNombre = idx('nombre'), iApellido = idx('apellido');
    if (iNombre === -1 || iApellido === -1) {
        mostrarErroresCSV(['Faltan las columnas obligatorias "nombre" y/o "apellido" en el encabezado. Usa la plantilla como base.']);
        return;
    }
    const iCorreo = idx('correo'), iTel = idx('telefono'), iCumple = idx('cumpleanos');
    const iPlan = idx('plan_id'), iRacha = idx('racha_meses'), iVence = idx('vence'), iEstado = idx('estado');

    const planesValidos = PLANES_GYM.map(p => p.id);
    const estadosValidos = ['Al día', 'Pendiente', 'Vencido'];
    const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    for (let r = 1; r < filas.length; r++) {
        const fila = filas[r];
        const get = (i) => (i >= 0 && fila[i] != null) ? fila[i].trim() : '';
        const nombre = get(iNombre), apellido = get(iApellido);
        const numFila = r + 1; // número de línea humano

        if (!nombre || !apellido) { errores.push(`Fila ${numFila}: falta nombre o apellido — se omite.`); continue; }

        let planId = get(iPlan) || null;
        if (planId && !planesValidos.includes(planId)) {
            errores.push(`Fila ${numFila} (${nombre} ${apellido}): plan_id "${planId}" no existe — se deja sin plan.`);
            planId = null;
        }

        let racha = parseInt(get(iRacha), 10);
        if (isNaN(racha) || racha < 1) racha = 1;

        let vence = get(iVence);
        if (vence && !esFecha(vence)) { errores.push(`Fila ${numFila} (${nombre} ${apellido}): "vence" no tiene formato AAAA-MM-DD — se ignora.`); vence = ''; }
        if (!vence && planId) {
            const plan = PLANES_GYM.find(p => p.id === planId);
            if (plan) { const d = new Date(); d.setMonth(d.getMonth() + plan.duracion_meses); vence = d.toISOString().split('T')[0]; }
        }

        let cumple = get(iCumple);
        if (cumple && !esFecha(cumple)) { errores.push(`Fila ${numFila} (${nombre} ${apellido}): "cumpleanos" no tiene formato AAAA-MM-DD — se ignora.`); cumple = ''; }

        let estado = get(iEstado) || 'Al día';
        if (!estadosValidos.includes(estado)) estado = 'Al día';

        filasImportCSV.push({
            nombre, apellido,
            correo: get(iCorreo) || null,
            telefono: get(iTel) || null,
            cumpleanos: cumple || null,
            plan_id: planId,
            racha_meses: racha,
            vence: vence || null,
            estado
        });
    }

    // Vista previa (primeras 50 filas para no saturar)
    filasImportCSV.slice(0, 50).forEach(c => {
        const plan = PLANES_GYM.find(p => p.id === c.plan_id);
        previewBody.innerHTML += `<tr>
            <td class="p-2 font-bold text-white">${c.nombre}</td>
            <td class="p-2">${c.apellido}</td>
            <td class="p-2 text-slate-400">${c.correo || '—'}</td>
            <td class="p-2 text-slate-400">${c.telefono || '—'}</td>
            <td class="p-2">${plan ? plan.nombre : '<span class="text-slate-600">sin plan</span>'}</td>
            <td class="p-2 text-slate-400">${c.vence || '—'}</td>
        </tr>`;
    });

    document.getElementById('csv-preview-box').classList.remove('hidden');
    const resumen = document.getElementById('csv-resumen');
    resumen.innerHTML = `<span class="text-emerald-400">${filasImportCSV.length} clientes listos para importar.</span>` +
        (filasImportCSV.length > 50 ? ` <span class="text-slate-500">(mostrando los primeros 50)</span>` : '');
    document.getElementById('btn-confirmar-import').disabled = filasImportCSV.length === 0;

    if (errores.length > 0) mostrarErroresCSV(errores);
    else document.getElementById('csv-errores').classList.add('hidden');
}

function mostrarErroresCSV(errores) {
    const box = document.getElementById('csv-errores');
    box.innerHTML = `<span class="font-bold">Avisos (${errores.length}):</span><br>` + errores.slice(0, 30).join('<br>') +
        (errores.length > 30 ? `<br>… y ${errores.length - 30} más.` : '');
    box.classList.remove('hidden');
}

async function confirmarImportacionCSV() {
    if (filasImportCSV.length === 0) return;
    if (!confirm(`¿Importar ${filasImportCSV.length} clientes a la base de datos?`)) return;

    const btn = document.getElementById('btn-confirmar-import');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';
    mostrarCargando(true);
    try {
        const creados = await Api.crearClientesBulk(filasImportCSV);
        cerrarModalImportarCSV();
        await recargarClientes();
        alert(`¡Listo! Se importaron ${creados} clientes correctamente.`);
    } catch (err) {
        alert('Error al importar: ' + err.message + '\n\nRevisa que los datos y el plan_id sean válidos, y que hayas iniciado sesión.');
        console.error(err);
    } finally {
        mostrarCargando(false);
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Importar clientes';
    }
}

// ------------------------------------------------------------
// STAFF
// ------------------------------------------------------------
function renderizarStaff() {
    const tbody = document.getElementById('tabla-staff-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!staffData || staffData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">Sin staff registrado todavía. Usa el botón "Agregar Staff".</td></tr>`;
        return;
    }

    const filtroInput = document.getElementById('filtro-staff');
    const texto = (filtroInput ? filtroInput.value : '').toLowerCase().trim();
    const lista = texto
        ? staffData.filter(s => ((s.nombre || '') + ' ' + (s.rol || '')).toLowerCase().includes(texto))
        : staffData;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">Sin resultados para "${texto}".</td></tr>`;
        return;
    }

    lista.forEach(s => {
        const permisos = (s.permisos || []).length ? (s.permisos || []).join(', ') : '<span class="text-slate-600">Sin permisos asignados</span>';
        tbody.innerHTML += `<tr>
            <td class="p-4 font-bold text-white">${s.nombre}</td>
            <td class="p-4 text-slate-400">${s.rol}</td>
            <td class="p-4">${permisos}</td>
            <td class="p-4 text-right space-x-1">
                <button onclick="abrirModalStaff('${s.id}')" class="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white px-2.5 py-1.5 rounded-xl font-bold text-[10px]"><i class="fa-solid fa-pen"></i> Editar</button>
                <button onclick="eliminarStaff('${s.id}')" class="bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white px-2 py-1.5 rounded-xl font-bold text-[10px]"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });
}

// --- Crear / editar / eliminar staff desde el dashboard ---
function abrirModalStaff(id) {
    const titulo = document.getElementById('modal-staff-titulo');
    document.getElementById('staff-id').value = id || '';
    document.querySelectorAll('.staff-permiso').forEach(chk => { chk.checked = false; });

    if (id) {
        const s = staffData.find(x => x.id === id);
        if (!s) return;
        titulo.innerHTML = '<i class="fa-solid fa-user-shield text-rose-400"></i> Editar Staff';
        document.getElementById('staff-nombre').value = s.nombre || '';
        document.getElementById('staff-rol').value = s.rol || 'Entrenador';
        (s.permisos || []).forEach(p => {
            const chk = document.querySelector(`.staff-permiso[value="${p}"]`);
            if (chk) chk.checked = true;
        });
    } else {
        titulo.innerHTML = '<i class="fa-solid fa-user-shield text-rose-400"></i> Agregar Staff';
        document.getElementById('staff-nombre').value = '';
        document.getElementById('staff-rol').value = 'Entrenador';
    }
    document.getElementById('modal-staff').classList.remove('hidden');
}

function cerrarModalStaff() { document.getElementById('modal-staff').classList.add('hidden'); }

async function guardarStaff() {
    const id = document.getElementById('staff-id').value;
    const nombre = document.getElementById('staff-nombre').value.trim();
    const rol = document.getElementById('staff-rol').value;
    if (!nombre) return alert('Escribe el nombre del staff.');

    const permisos = [...document.querySelectorAll('.staff-permiso:checked')].map(chk => chk.value);

    try {
        if (id) {
            await Api.actualizarStaff(id, { nombre, rol, permisos });
        } else {
            await Api.crearStaff({ nombre, rol, permisos });
        }
        staffData = await Api.getStaff();
        renderizarStaff();
        cerrarModalStaff();
    } catch (err) {
        alert('No se pudo guardar el staff: ' + err.message);
        console.error(err);
    }
}

async function eliminarStaff(id) {
    const s = staffData.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`¿Eliminar a ${s.nombre} del personal?`)) return;
    try {
        await Api.eliminarStaff(id);
        staffData = await Api.getStaff();
        renderizarStaff();
    } catch (err) {
        alert('No se pudo eliminar: ' + err.message);
    }
}

// ------------------------------------------------------------
// NAVEGACIÓN ENTRE SECCIONES
// ------------------------------------------------------------
// ------------------------------------------------------------
// GRUPO DE WHATSAPP (comparador + invitar)
// ------------------------------------------------------------
const GRUPO_WSP_KEY = 'javofit_grupo_wsp_link';

function cargarLinkGrupo() {
    try {
        const el = document.getElementById('grupo-wsp-link');
        if (el) el.value = localStorage.getItem(GRUPO_WSP_KEY) || '';
    } catch (e) { /* localStorage no disponible */ }
}

function guardarLinkGrupo() {
    const el = document.getElementById('grupo-wsp-link');
    const aviso = document.getElementById('grupo-wsp-link-aviso');
    const link = (el.value || '').trim();
    try {
        localStorage.setItem(GRUPO_WSP_KEY, link);
        if (aviso) { aviso.textContent = '✅ Link guardado en este equipo.'; aviso.className = 'text-[10px] text-emerald-400'; aviso.classList.remove('hidden'); }
    } catch (e) {
        if (aviso) { aviso.textContent = 'No se pudo guardar el link en este equipo.'; aviso.className = 'text-[10px] text-rose-400'; aviso.classList.remove('hidden'); }
    }
}

function compararGrupoWhatsApp() {
    const texto = document.getElementById('grupo-wsp-numeros').value || '';
    // Extrae y normaliza los números pegados (por línea/coma; ignora nombres).
    const numerosGrupo = new Set();
    texto.split(/[\n,;]+/).forEach(linea => {
        const norm = limpiarTelefonoWhatsApp(linea);
        if (norm && norm.length >= 8) numerosGrupo.add(norm);
    });

    const enGrupo = [], faltan = [], sinTel = [];
    const telsClientes = new Set();
    clientesData.forEach(c => {
        const norm = limpiarTelefonoWhatsApp(c.telefono);
        if (!norm) { sinTel.push(c); return; }
        telsClientes.add(norm);
        if (numerosGrupo.has(norm)) enGrupo.push(c);
        else faltan.push(c);
    });
    const noCliente = [...numerosGrupo].filter(n => !telsClientes.has(n));

    document.getElementById('grupo-cnt-en').innerText = enGrupo.length;
    document.getElementById('grupo-cnt-falta').innerText = faltan.length;
    document.getElementById('grupo-cnt-sintel').innerText = sinTel.length;
    document.getElementById('grupo-cnt-nocliente').innerText = noCliente.length;
    document.getElementById('grupo-wsp-resumen').classList.remove('hidden');

    const tarjeta = (titulo, color, items, htmlItem) => `
        <div class="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <span class="font-bold ${color} text-xs uppercase tracking-wider">${titulo}</span>
                <span class="text-[10px] text-slate-500">${items.length}</span>
            </div>
            <div class="p-3 space-y-2 max-h-96 overflow-y-auto">${items.length ? items.map(htmlItem).join('') : '<p class="text-slate-500 text-xs text-center p-2">—</p>'}</div>
        </div>`;
    const filaCliente = (c, extra = '') => `<div class="flex justify-between items-center gap-2 bg-black/40 p-2.5 rounded-xl">
        <div class="min-w-0"><span class="text-white text-xs font-bold block truncate">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</span><span class="text-[10px] text-slate-500">${escapeHtml(c.telefono || 'sin tel.')}</span></div>${extra}</div>`;
    const btnInvitar = (c) => `<button onclick="invitarAlGrupo('${c.id}')" class="bg-green-500 hover:bg-green-400 text-black font-black px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap"><i class="fa-brands fa-whatsapp"></i> Invitar</button>`;

    document.getElementById('grupo-wsp-resultado').innerHTML =
        tarjeta('❌ Faltan en el grupo (con teléfono)', 'text-rose-400', faltan, c => filaCliente(c, btnInvitar(c))) +
        tarjeta('✅ Ya están en el grupo', 'text-emerald-400', enGrupo, c => filaCliente(c)) +
        tarjeta('⚠️ Sin teléfono (no verificable)', 'text-amber-400', sinTel, c => filaCliente(c)) +
        tarjeta('ℹ️ Números del grupo que no son clientes', 'text-slate-300', noCliente, n => `<div class="bg-black/40 p-2.5 rounded-xl text-xs text-slate-300">${escapeHtml(n)}</div>`);
}

// --- Rellenar teléfonos faltantes cruzando por nombre ---
let matchesTelefonoGrupo = [];

// Normaliza un nombre para comparar: minúsculas, sin acentos, sin "gym",
// solo letras/números y espacios.
function normalizarNombreMatch(s) {
    return quitarAcentos(String(s || '').toLowerCase())
        .replace(/\bgym+\b/g, ' ')
        .replace(/[^a-z0-9ñ ]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

// Parsea las líneas pegadas del grupo a {tel, nombre}. Detecta cuál token
// es el número (>=8 dígitos) y cuál el nombre (el más largo con letras).
function parseLineasGrupo(texto) {
    const out = [];
    (texto || '').split(/\n+/).forEach(linea => {
        const parts = linea.split(/[;,\t]+/).map(x => x.trim()).filter(Boolean);
        let tel = '', nombre = '';
        parts.forEach(p => {
            const d = p.replace(/\D/g, '');
            if (d.length >= 8 && !tel) tel = limpiarTelefonoWhatsApp(p);
            else if (/[a-zA-Z]/.test(p) && p.length > nombre.length) nombre = p;
        });
        if (tel) out.push({ tel, nombre });
    });
    return out;
}

function cruzarNombresGrupo() {
    const texto = document.getElementById('grupo-wsp-csv').value || '';
    const grupo = parseLineasGrupo(texto)
        .filter(g => g.nombre)
        .map(g => ({ ...g, palabras: new Set(normalizarNombreMatch(g.nombre).split(' ').filter(Boolean)) }));

    matchesTelefonoGrupo = [];
    clientesData.forEach(c => {
        if (limpiarTelefonoWhatsApp(c.telefono)) return; // ya tiene teléfono: no tocar
        const need = normalizarNombreMatch(`${c.nombre} ${c.apellido}`).split(' ').filter(Boolean);
        if (need.length < 2) return; // se exige nombre + apellido para evitar falsos matches
        // Coincide si TODAS las palabras del cliente aparecen como palabra en el nombre del grupo.
        const cand = grupo.filter(g => need.every(w => g.palabras.has(w)));
        if (cand.length === 1) {
            matchesTelefonoGrupo.push({ id: c.id, cliente: `${c.nombre} ${c.apellido}`, tel: cand[0].tel, nombreGrupo: cand[0].nombre, ambiguo: false });
        } else if (cand.length > 1) {
            matchesTelefonoGrupo.push({ id: c.id, cliente: `${c.nombre} ${c.apellido}`, tel: cand[0].tel, nombreGrupo: cand.map(x => x.nombre).join(' / '), ambiguo: true });
        }
    });

    const cont = document.getElementById('grupo-wsp-match-resultado');
    if (!matchesTelefonoGrupo.length) {
        cont.innerHTML = '<p class="text-slate-500 text-xs">No se encontraron coincidencias. Revisá que el CSV tenga nombres, y que esos clientes existan en la plataforma (por nombre y apellido) sin teléfono cargado.</p>';
        return;
    }
    const seguros = matchesTelefonoGrupo.filter(m => !m.ambiguo).length;
    cont.innerHTML = `
        <p class="text-[11px] text-slate-400">Se encontraron <b class="text-emerald-400">${seguros}</b> coincidencias claras${matchesTelefonoGrupo.length - seguros ? ` y <b class="text-amber-400">${matchesTelefonoGrupo.length - seguros}</b> con varios candidatos (revisá)` : ''}.</p>
        <div class="bg-black/40 border border-slate-800 rounded-2xl overflow-hidden">
            <div class="overflow-x-auto"><table class="w-full text-left text-xs">
              <thead class="bg-slate-950 text-slate-500 text-[10px] uppercase"><tr>
                <th class="p-2"><input type="checkbox" id="match-all" checked onchange="document.querySelectorAll('.match-chk').forEach(x=>{x.checked=this.checked;})"></th>
                <th class="p-2">Cliente (sin tel.)</th><th class="p-2">Número propuesto</th><th class="p-2">Nombre en el grupo</th>
              </tr></thead>
              <tbody>${matchesTelefonoGrupo.map((m, i) => `<tr class="border-t border-slate-800">
                <td class="p-2"><input type="checkbox" class="match-chk" data-i="${i}" ${m.ambiguo ? '' : 'checked'}></td>
                <td class="p-2 text-white font-bold">${escapeHtml(m.cliente)}</td>
                <td class="p-2 text-emerald-400 font-bold">${escapeHtml(m.tel)}</td>
                <td class="p-2 text-slate-400">${escapeHtml(m.nombreGrupo)}${m.ambiguo ? ' <span class="text-amber-400 font-bold">(varios — revisar)</span>' : ''}</td>
              </tr>`).join('')}</tbody>
            </table></div>
        </div>
        <button onclick="aplicarTelefonosGrupo()" class="bg-emerald-500 hover:bg-emerald-400 text-black font-black px-5 py-2.5 rounded-2xl text-xs"><i class="fa-solid fa-check"></i> Aplicar los marcados</button>
        <p class="text-[10px] text-slate-500">Los "(varios — revisar)" vienen desmarcados: confirmá cuál corresponde antes de aplicar. Solo se completa el teléfono de los clientes marcados.</p>`;
}

async function aplicarTelefonosGrupo() {
    const checks = [...document.querySelectorAll('.match-chk')].filter(x => x.checked);
    if (!checks.length) { alert('No hay ningún cliente marcado.'); return; }
    if (!confirm(`¿Completar el teléfono de ${checks.length} cliente(s)?`)) return;
    mostrarCargando(true);
    let ok = 0, fail = 0;
    for (const chk of checks) {
        const m = matchesTelefonoGrupo[parseInt(chk.dataset.i)];
        if (!m) continue;
        try { await Api.actualizarCliente(m.id, { telefono: m.tel }); ok++; }
        catch (e) { fail++; console.warn('No se pudo actualizar', m.cliente, e.message); }
    }
    mostrarCargando(false);
    await recargarClientes();
    alert(`Listo: ${ok} teléfono(s) completado(s)${fail ? `, ${fail} fallaron` : ''}.`);
    document.getElementById('grupo-wsp-match-resultado').innerHTML = '';
    document.getElementById('grupo-wsp-csv').value = '';
}

function invitarAlGrupo(clienteId) {
    const c = clientesData.find(x => x.id === clienteId);
    if (!c) return;
    let link = '';
    try { link = localStorage.getItem(GRUPO_WSP_KEY) || ''; } catch (e) { /* localStorage no disponible */ }
    if (!link) { alert('Primero guardá el link de invitación del grupo (arriba en esta sección).'); return; }
    const msg = `¡Hola ${c.nombre}! 👋 Te invitamos al grupo de WhatsApp de Gimnasio Demo para enterarte de novedades, horarios y avisos 💪 Únete acá: ${link}`;
    window.open(enlaceWhatsApp(c.telefono, msg), '_blank', 'noopener');
}

// ------------------------------------------------------------
// ROLES (demo): Administrador ve todo; Entrenador solo Horarios + Acceso.
// El selector del header cambia el rol para mostrar la demo como cada uno.
// Se usa style.display (no clases) para que sobreviva a cambiarSeccionAdmin,
// que reescribe el className de los botones de navegación.
// ------------------------------------------------------------
let rolDemo = 'admin';

function aplicarRolDemo(rol) {
    rolDemo = (rol === 'entrenador') ? 'entrenador' : 'admin';
    document.querySelectorAll('[data-rol]').forEach(el => {
        const roles = el.getAttribute('data-rol').split(/\s+/);
        el.style.display = roles.includes(rolDemo) ? '' : 'none';
    });
    // Ir a la primera sección permitida para ese rol.
    cambiarSeccionAdmin(rolDemo === 'entrenador' ? 'sec-horarios' : 'sec-alumnos');
    const sel = document.getElementById('rol-demo');
    if (sel && sel.value !== rolDemo) sel.value = rolDemo;
}

// Reinicia la demo: borra los horarios y reservas guardados (localStorage)
// y recarga, volviendo al estado inicial de ejemplo.
function reiniciarDemo() {
    try {
        localStorage.removeItem('gd_horarios_v1');
        localStorage.removeItem('javofit_demo_reservas_v1');
        localStorage.removeItem('gd_socios_overrides_v1');
        localStorage.removeItem('gd_config_v1');
        localStorage.removeItem('gd_cuentas_v1');
    } catch (_) { }
    location.reload();
}

function cambiarSeccionAdmin(secId) {
    ['sec-alumnos', 'sec-horarios', 'sec-renovaciones', 'sec-cumpleanos', 'sec-mensajes', 'sec-metricas', 'sec-caja', 'sec-analitica', 'sec-personal', 'sec-config', 'sec-protocolo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
        const nav = document.getElementById(`nav-${id}`);
        if (nav) nav.className = "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:bg-slate-900 hover:text-white text-left transition";
    });
    document.getElementById(secId).classList.remove('hidden');
    document.getElementById(`nav-${secId}`).className = "w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-left font-bold transition";
    // En celular, cerrar el menú lateral al elegir una sección.
    if (window.innerWidth < 768) cerrarSidebarMobile();

    // Al entrar a Asistencias, deja el cursor listo en el buscador (para marcar
    // rápido en la puerta). Solo en pantallas grandes (no molesta en celular).
    if (secId === 'sec-asistencias' && window.innerWidth >= 768) {
        const buscador = document.getElementById('buscar-asistencia');
        if (buscador) setTimeout(() => buscador.focus(), 50);
    }

    // Al entrar a Grupo WhatsApp, carga el link de invitación guardado.
    if (secId === 'sec-grupo-wsp') cargarLinkGrupo();

    // Al entrar a Horarios, renderiza la config de bloques y las reservas de hoy.
    if (secId === 'sec-horarios' && typeof renderizarHorariosAdmin === 'function') renderizarHorariosAdmin();

    // Al entrar a Gastos & Caja, renderiza el resumen mensual y los egresos.
    if (secId === 'sec-caja' && typeof renderizarCaja === 'function') renderizarCaja();

    // Al entrar a Configuración, renderiza planes, matrícula, adicionales y premios.
    if (secId === 'sec-config' && typeof renderizarConfig === 'function') renderizarConfig();
}

// --- Menú lateral deslizable (celular / tablet) ---
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebar-backdrop');
    if (!sb) return;
    if (sb.classList.contains('-translate-x-full')) {
        sb.classList.remove('-translate-x-full');
        if (bd) bd.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-full');
        if (bd) bd.classList.add('hidden');
    }
}

function cerrarSidebarMobile() {
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebar-backdrop');
    if (sb) sb.classList.add('-translate-x-full');
    if (bd) bd.classList.add('hidden');
}

// ------------------------------------------------------------
// MÉTRICAS Y GRÁFICOS
// ------------------------------------------------------------
function calcularMetricas() {
    let ingresosMes = 0;
    let ingresosMesAnterior = 0;
    let rachasActivasCount = 0;
    let finalistasRuletaCount = 0;

    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();
    // Mes anterior (si estamos en enero, es diciembre del año pasado).
    const mesAnterior = mesActual === 0 ? 11 : mesActual - 1;
    const anioMesAnterior = mesActual === 0 ? anioActual - 1 : anioActual;
    // Ingresos del mes actual desglosados por método de pago.
    const porMetodo = { 'Efectivo': 0, 'Transferencia': 0, 'Débito': 0, 'Crédito': 0 };

    clientesData.forEach(c => {
        if (c.pagos) {
            c.pagos.forEach(p => {
                if (!p.fecha) return;
                const f = parseFechaLocal(p.fecha);
                const monto = Number(p.monto) || 0;
                // Pagos del mes actual (va cambiando cada mes).
                if (f.getFullYear() === anioActual && f.getMonth() === mesActual) {
                    ingresosMes += monto;
                    const m = p.metodo || 'Efectivo';
                    if (porMetodo[m] === undefined) porMetodo[m] = 0;
                    porMetodo[m] += monto;
                }
                // Pagos del mes anterior (para la comparativa).
                if (f.getFullYear() === anioMesAnterior && f.getMonth() === mesAnterior) {
                    ingresosMesAnterior += monto;
                }
            });
        }
        if (c.racha_meses) rachasActivasCount += c.racha_meses;
        if ((c.asistenciasMes || 0) >= metaAsistencia(c)) finalistasRuletaCount++;
    });

    const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const lblMes = document.getElementById('metric-ingresos-label');
    if (lblMes) lblMes.innerText = `Ingresos de ${NOMBRES_MES[mesActual]}`;

    document.getElementById('metric-ingresos').innerText = `$${ingresosMes.toLocaleString('es-CL')}`;
    document.getElementById('metric-rachas-ganadas').innerText = rachasActivasCount;
    // Si el historial está disponible usamos el total real; si no, el contador de sesión.
    document.getElementById('metric-rachas-perdidas').innerText = rachaEventosDisponible ? rachaEventos.length : rachasReseteadasContador;
    const elFinalistasRuleta = document.getElementById('metric-rachas-completas');
    if (elFinalistasRuleta) elFinalistasRuleta.innerText = finalistasRuletaCount; // tarjeta removida en la demo

    // --- vs. Mes Anterior: variación porcentual ---
    const elVs = document.getElementById('metric-vs-anterior');
    const elVsDet = document.getElementById('metric-vs-anterior-detalle');
    if (elVs) {
        if (ingresosMesAnterior === 0) {
            elVs.innerText = ingresosMes > 0 ? 'Nuevo' : '—';
            elVs.className = 'text-xl font-black text-cyan-400';
        } else {
            const variacion = ((ingresosMes - ingresosMesAnterior) / ingresosMesAnterior) * 100;
            const signo = variacion >= 0 ? '+' : '';
            elVs.innerText = `${signo}${variacion.toFixed(0)}%`;
            elVs.className = `text-xl font-black ${variacion >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
        if (elVsDet) elVsDet.innerText = `${NOMBRES_MES[mesAnterior]}: $${ingresosMesAnterior.toLocaleString('es-CL')}`;
    }

    // --- Desglose de ingresos del mes por método de pago ---
    const cont = document.getElementById('metric-por-metodo');
    if (cont) {
        const colores = { 'Efectivo': 'text-emerald-400', 'Transferencia': 'text-cyan-400', 'Débito': 'text-amber-400', 'Crédito': 'text-violet-400' };
        cont.innerHTML = Object.keys(porMetodo).map(m => {
            const pct = ingresosMes > 0 ? Math.round((porMetodo[m] / ingresosMes) * 100) : 0;
            return `<div class="bg-black/40 p-3 rounded-2xl space-y-1">
                <span class="text-[10px] text-slate-500">${m}</span>
                <div class="text-sm font-black ${colores[m] || 'text-white'}">$${porMetodo[m].toLocaleString('es-CL')}</div>
                <span class="text-[9px] text-slate-600">${pct}% del mes</span>
            </div>`;
        }).join('');
    }
}

// ------------------------------------------------------------
// DETALLE MENSUAL NAVEGABLE (comparación mes a mes)
// ------------------------------------------------------------
const NOMBRES_MES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
let mesFinanzas = null; // { y, m } — mes que se está viendo; null = aún no inicializado

// Calcula el resumen financiero de un mes concreto desde los pagos reales.
function resumenFinancieroMes(y, m) {
    let total = 0, nPagos = 0, matriculas = 0;
    const clientesPagaron = new Set();
    const porMetodo = { 'Efectivo': 0, 'Transferencia': 0, 'Débito': 0, 'Crédito': 0 };
    clientesData.forEach(c => {
        (c.pagos || []).forEach(p => {
            if (!p.fecha) return;
            const f = parseFechaLocal(p.fecha);
            if (f.getFullYear() === y && f.getMonth() === m) {
                const monto = Number(p.monto) || 0;
                total += monto; nPagos++;
                clientesPagaron.add(c.id);
                const met = p.metodo || 'Efectivo';
                if (porMetodo[met] === undefined) porMetodo[met] = 0;
                porMetodo[met] += monto;
                if ((p.concepto || '').toLowerCase().includes('matr')) matriculas += monto;
            }
        });
    });
    let altas = 0;
    clientesData.forEach(c => {
        if (!c.fechaIngreso) return;
        const fi = parseFechaLocal(c.fechaIngreso);
        if (fi && fi.getFullYear() === y && fi.getMonth() === m) altas++;
    });
    return { total, nPagos, matriculas, nClientes: clientesPagaron.size, porMetodo, altas };
}

function cambiarMesFinanzas(delta) {
    if (!mesFinanzas) { const h = new Date(); mesFinanzas = { y: h.getFullYear(), m: h.getMonth() }; }
    let m = mesFinanzas.m + delta, y = mesFinanzas.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    mesFinanzas = { y, m };
    renderizarDetalleMensual();
}

function irMesActualFinanzas() {
    const h = new Date();
    mesFinanzas = { y: h.getFullYear(), m: h.getMonth() };
    renderizarDetalleMensual();
}

function renderizarDetalleMensual() {
    if (!document.getElementById('fin-mes-label')) return;
    if (!mesFinanzas) { const h = new Date(); mesFinanzas = { y: h.getFullYear(), m: h.getMonth() }; }
    const { y, m } = mesFinanzas;
    const prevM = m === 0 ? 11 : m - 1, prevY = m === 0 ? y - 1 : y;

    const cur = resumenFinancieroMes(y, m);
    const prev = resumenFinancieroMes(prevY, m === 0 ? 11 : m - 1);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    const money = v => `$${Number(v).toLocaleString('es-CL')}`;

    set('fin-mes-label', `${NOMBRES_MES_FULL[m]} ${y}`);
    set('fin-mes-ingresos', money(cur.total));
    set('fin-mes-pagos', cur.nPagos);
    set('fin-mes-clientes', cur.nClientes);
    set('fin-mes-ticket', money(cur.nClientes ? Math.round(cur.total / cur.nClientes) : 0));
    set('fin-mes-altas', cur.altas);
    set('fin-mes-matriculas', money(cur.matriculas));

    // vs. mes anterior
    const elVs = document.getElementById('fin-mes-vs');
    if (elVs) {
        if (prev.total === 0) {
            elVs.innerText = cur.total > 0 ? 'Nuevo' : '—';
            elVs.className = 'text-lg font-black text-cyan-400';
        } else {
            const v = ((cur.total - prev.total) / prev.total) * 100;
            elVs.innerText = `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
            elVs.className = `text-lg font-black ${v >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
    }

    // Desglose por método del mes visto
    const cont = document.getElementById('fin-mes-metodo');
    if (cont) {
        const colores = { 'Efectivo': 'text-emerald-400', 'Transferencia': 'text-cyan-400', 'Débito': 'text-amber-400', 'Crédito': 'text-violet-400' };
        cont.innerHTML = Object.keys(cur.porMetodo).map(met => {
            const pct = cur.total > 0 ? Math.round((cur.porMetodo[met] / cur.total) * 100) : 0;
            return `<div class="bg-black/40 p-3 rounded-2xl space-y-1"><span class="text-[10px] text-slate-500">${met}</span><div class="text-sm font-black ${colores[met] || 'text-white'}">${money(cur.porMetodo[met])}</div><span class="text-[9px] text-slate-600">${pct}%</span></div>`;
        }).join('');
    }

    // Resumen mes anterior
    set('fin-prev-label', `${NOMBRES_MES_FULL[prevM]} ${prevY}`);
    set('fin-prev-ingresos', money(prev.total));
    set('fin-prev-pagos', prev.nPagos);
    set('fin-prev-altas', prev.altas);
}

let chartFinanzasInstance = null;
let chartPlanesInstance = null;

// Calcula los ingresos por mes (Ene-Dic) del año actual y del año pasado,
// para poder compararlos en el gráfico.
function calcularIngresosComparativoAnual() {
    const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const anioActual = new Date().getFullYear();
    const anioPasado = anioActual - 1;

    const actual = new Array(12).fill(0);
    const pasado = new Array(12).fill(0);

    clientesData.forEach(c => {
        (c.pagos || []).forEach(p => {
            if (!p.fecha) return;
            const f = parseFechaLocal(p.fecha);
            const monto = Number(p.monto) || 0;
            if (f.getFullYear() === anioActual) actual[f.getMonth()] += monto;
            else if (f.getFullYear() === anioPasado) pasado[f.getMonth()] += monto;
        });
    });

    return { labels: NOMBRES_MES, actual, pasado, anioActual, anioPasado };
}

// Cuenta cuántos clientes hay en cada plan (para el gráfico de distribución).
function calcularDistribucionPlanes() {
    const conteo = {};
    clientesData.forEach(c => {
        const plan = PLANES_GYM.find(p => p.id === c.planId);
        const nombre = plan ? plan.nombre : 'Sin plan';
        conteo[nombre] = (conteo[nombre] || 0) + 1;
    });
    return conteo;
}

function inicializarGraficos() {
    const PALETA = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#64748b'];

    const ctxFin = document.getElementById('chartFinanzas');
    if (ctxFin) {
        if (chartFinanzasInstance) chartFinanzasInstance.destroy();
        const comp = calcularIngresosComparativoAnual();
        chartFinanzasInstance = new Chart(ctxFin, {
            type: 'line',
            data: {
                labels: comp.labels,
                datasets: [
                    {
                        label: `${comp.anioActual} (este año)`,
                        data: comp.actual,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: `${comp.anioPasado} (año pasado)`,
                        data: comp.pasado,
                        borderColor: '#64748b',
                        backgroundColor: 'rgba(100, 116, 139, 0.05)',
                        borderDash: [5, 4],
                        fill: false,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12 } },
                    tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': $' + Number(ctx.parsed.y).toLocaleString('es-CL') } }
                },
                scales: {
                    x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } },
                    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => '$' + Number(v).toLocaleString('es-CL') } }
                }
            }
        });
    }

    const ctxPlanes = document.getElementById('chartPlanes');
    if (ctxPlanes) {
        if (chartPlanesInstance) chartPlanesInstance.destroy();
        const dist = calcularDistribucionPlanes();
        const labels = Object.keys(dist);
        chartPlanesInstance = new Chart(ctxPlanes, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['Sin datos'],
                datasets: [{
                    data: labels.length ? labels.map(l => dist[l]) : [1],
                    backgroundColor: labels.length ? labels.map((_, i) => PALETA[i % PALETA.length]) : ['#1e293b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } }
            }
        });
    }
}

// ------------------------------------------------------------
// RETENCIÓN DE CLIENTES
// ------------------------------------------------------------
let chartRetencionInstance = null;

function renderizarRetencion() {
    if (!document.getElementById('ret-total')) return;

    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();

    let total = 0, aldia = 0, pendiente = 0, vencido = 0, congelado = 0, altasMes = 0;
    clientesData.forEach(c => {
        total++;
        if (c.estado === 'Al día') aldia++;
        else if (c.estado === 'Pendiente') pendiente++;
        else if (c.estado === 'Vencido') vencido++;
        else if (c.estado === 'Congelado') congelado++;
        // Altas del mes: clientes con fecha de ingreso en el mes/año actual.
        if (c.fechaIngreso) {
            const fi = parseFechaLocal(c.fechaIngreso);
            if (fi && fi.getFullYear() === anioActual && fi.getMonth() === mesActual) altasMes++;
        }
    });

    const activos = aldia + pendiente + congelado; // con membresía vigente
    const tasaRet = total > 0 ? Math.round((activos / total) * 100) : 0;
    const tasaChurn = total > 0 ? Math.round((vencido / total) * 100) : 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set('ret-total', total);
    set('ret-aldia', aldia);
    set('ret-pendiente', pendiente);
    set('ret-vencido', vencido);
    set('ret-congelado', congelado);
    set('ret-altas', altasMes);
    set('ret-tasa', `${tasaRet}%`);
    set('ret-churn', `${tasaChurn}%`);

    const ctx = document.getElementById('chartRetencion');
    if (ctx && typeof Chart !== 'undefined') {
        if (chartRetencionInstance) chartRetencionInstance.destroy();
        const hayDatos = (aldia + pendiente + vencido + congelado) > 0;
        chartRetencionInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Al día', 'Pendientes', 'Vencidos', 'Congelados'],
                datasets: [{
                    data: hayDatos ? [aldia, pendiente, vencido, congelado] : [1, 0, 0, 0],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#0ea5e9']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } }
            }
        });
    }
}

// ------------------------------------------------------------
// ANALÍTICA & DATOS DEL NEGOCIO
// ------------------------------------------------------------
let chartDiasPagoInstance = null;

function renderizarAnalitica() {
    if (!document.getElementById('sec-analitica')) return;

    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();

    // Reúne todos los pagos en una sola lista.
    const todosPagos = [];
    clientesData.forEach(c => (c.pagos || []).forEach(p => { if (p.fecha) todosPagos.push(p); }));

    // --- Ticket promedio y estimativo del mes ---
    // Ticket promedio = precio promedio del plan de los clientes con plan.
    let sumaPlanes = 0, conPlan = 0;
    clientesData.forEach(c => {
        const plan = PLANES_GYM.find(p => p.id === c.planId);
        if (plan) { sumaPlanes += plan.precio; conPlan++; }
    });
    const ticketPromedio = conPlan ? Math.round(sumaPlanes / conPlan) : 0;
    // Clientes "activos" = los que no están vencidos.
    const clientesActivos = clientesData.filter(c => c.estado !== 'Vencido').length;
    const estimativo = clientesActivos * ticketPromedio;

    // Ingreso real del mes actual.
    let realMes = 0;
    todosPagos.forEach(p => {
        const f = parseFechaLocal(p.fecha);
        if (f.getFullYear() === anioActual && f.getMonth() === mesActual) realMes += Number(p.monto) || 0;
    });
    const cumplimiento = estimativo > 0 ? Math.round((realMes / estimativo) * 100) : 0;

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setTxt('an-estimativo', `$${estimativo.toLocaleString('es-CL')}`);
    setTxt('an-estimativo-detalle', `${clientesActivos} activos × $${ticketPromedio.toLocaleString('es-CL')}`);
    setTxt('an-real', `$${realMes.toLocaleString('es-CL')}`);
    setTxt('an-cumplimiento', estimativo > 0 ? `${cumplimiento}% de lo esperado` : '—');
    setTxt('an-ticket', `$${ticketPromedio.toLocaleString('es-CL')}`);
    setTxt('an-clientes-activos', `sobre ${clientesActivos} clientes activos`);

    // --- Mejor mes histórico ---
    const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const porMes = {};
    todosPagos.forEach(p => {
        const f = parseFechaLocal(p.fecha);
        const clave = `${f.getFullYear()}-${f.getMonth()}`;
        porMes[clave] = (porMes[clave] || 0) + (Number(p.monto) || 0);
    });
    let mejorClave = null, mejorMonto = 0;
    Object.entries(porMes).forEach(([k, v]) => { if (v > mejorMonto) { mejorMonto = v; mejorClave = k; } });
    if (mejorClave) {
        const [a, m] = mejorClave.split('-');
        setTxt('an-mejor-mes', `${NOMBRES_MES[parseInt(m)]} ${a}`);
        setTxt('an-mejor-mes-monto', `$${mejorMonto.toLocaleString('es-CL')}`);
    } else {
        setTxt('an-mejor-mes', '—');
        setTxt('an-mejor-mes-monto', 'Sin pagos aún');
    }

    // --- Métodos de pago más usados ---
    const metodos = {};
    todosPagos.forEach(p => { const m = p.metodo || 'Sin método'; metodos[m] = (metodos[m] || 0) + 1; });
    const totalMetodos = todosPagos.length || 1;
    const contMet = document.getElementById('an-metodos');
    if (contMet) {
        const ordenados = Object.entries(metodos).sort((a, b) => b[1] - a[1]);
        contMet.innerHTML = ordenados.length
            ? ordenados.map(([m, n]) => {
                const pct = Math.round((n / totalMetodos) * 100);
                return `<div class="space-y-1">
                    <div class="flex justify-between text-[11px]"><span class="text-slate-300 font-bold">${m}</span><span class="text-slate-500">${n} pagos · ${pct}%</span></div>
                    <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden"><div class="bg-cyan-500 h-full" style="width:${pct}%"></div></div>
                </div>`;
            }).join('')
            : `<p class="text-[11px] text-slate-600">Sin pagos registrados todavía.</p>`;
    }

    // --- Clientes en riesgo (vencen pronto y tienen racha alta que perder) ---
    const riesgo = clientesData
        .map(c => ({ c, dias: calcularDiasParaVencer(c.vence) }))
        .filter(x => x.dias >= -4 && x.dias <= 5 && (x.c.racha_meses || 0) >= 5)
        .sort((a, b) => (b.c.racha_meses || 0) - (a.c.racha_meses || 0));
    const bodyRiesgo = document.getElementById('an-riesgo-body');
    if (bodyRiesgo) {
        bodyRiesgo.innerHTML = riesgo.length
            ? riesgo.map(({ c, dias }) => {
                const estadoTxt = dias < 0 ? `Vencido hace ${Math.abs(dias)}d` : (dias === 0 ? 'Vence hoy' : `Vence en ${dias}d`);
                const color = dias < 0 ? 'text-rose-400' : 'text-amber-400';
                return `<tr>
                    <td class="p-4 font-bold text-white">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</td>
                    <td class="p-4"><span class="text-amber-400 font-black">Mes ${c.racha_meses} / 20</span></td>
                    <td class="p-4 text-slate-400">${formatearFecha(c.vence)}</td>
                    <td class="p-4"><span class="${color} font-bold">${estadoTxt}</span></td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="4" class="p-4 text-center text-slate-500">Nadie con racha alta está por vencer. ✅</td></tr>`;
    }

    // --- Análisis de pérdida de rachas (desde racha_eventos) ---
    const aviso = document.getElementById('an-racha-aviso');
    if (!rachaEventosDisponible) {
        if (aviso) aviso.innerText = 'Corre migracion_racha_eventos.sql para activar esto';
    } else if (aviso) {
        aviso.innerText = rachaEventos.length === 0 ? 'Aún sin datos — se irá llenando con cada reset de racha' : '';
    }

    const total = rachaEventos.length;
    setTxt('an-racha-total', total);

    if (total > 0) {
        const promedioMes = rachaEventos.reduce((s, e) => s + (e.racha_anterior || 0), 0) / total;
        setTxt('an-racha-promedio', `Mes ${promedioMes.toFixed(1)}`);

        const conAtraso = rachaEventos.filter(e => e.dias_atraso != null && e.dias_atraso > 0);
        if (conAtraso.length) {
            const promAtraso = conAtraso.reduce((s, e) => s + e.dias_atraso, 0) / conAtraso.length;
            setTxt('an-racha-atraso', `${promAtraso.toFixed(1)} días`);
        } else {
            setTxt('an-racha-atraso', '—');
        }

        // Desglose por motivo
        const motivos = {};
        rachaEventos.forEach(e => { const m = e.motivo || 'Sin motivo'; motivos[m] = (motivos[m] || 0) + 1; });
        const contMot = document.getElementById('an-racha-motivos');
        if (contMot) {
            contMot.innerHTML = Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) => {
                const pct = Math.round((n / total) * 100);
                return `<div class="space-y-1">
                    <div class="flex justify-between text-[11px]"><span class="text-slate-300 font-bold">${m}</span><span class="text-slate-500">${n} · ${pct}%</span></div>
                    <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden"><div class="bg-rose-500 h-full" style="width:${pct}%"></div></div>
                </div>`;
            }).join('');
        }
    } else {
        setTxt('an-racha-promedio', '—');
        setTxt('an-racha-atraso', '—');
        const contMot = document.getElementById('an-racha-motivos');
        if (contMot) contMot.innerHTML = '';
    }

    // --- Gráfico: ingresos por día de la semana ---
    const ctxDias = document.getElementById('chartDiasPago');
    if (ctxDias && typeof Chart !== 'undefined') {
        // getDay(): 0=Dom..6=Sáb. Reordenamos a Lun..Dom.
        const porDiaJs = new Array(7).fill(0); // índice = getDay()
        todosPagos.forEach(p => { porDiaJs[parseFechaLocal(p.fecha).getDay()] += Number(p.monto) || 0; });
        const ordenLun = [1, 2, 3, 4, 5, 6, 0];
        const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const data = ordenLun.map(i => porDiaJs[i]);

        if (chartDiasPagoInstance) chartDiasPagoInstance.destroy();
        chartDiasPagoInstance = new Chart(ctxDias, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Ingresos ($)', data, backgroundColor: '#06b6d4', borderRadius: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => '$' + Number(ctx.parsed.y).toLocaleString('es-CL') } } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
                    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => '$' + Number(v).toLocaleString('es-CL') } }
                }
            }
        });
    }
}
