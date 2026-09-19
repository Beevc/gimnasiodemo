// ============================================================
// portal.js — Portal del Socio (DEMO)
// ============================================================
// Página del cliente: ver estado del plan, reservar el horario del día
// (y recibir su QR del día), cargar sus datos, pagar/renovar y ver avances.
// Trabaja sobre los mismos datos en memoria que el dashboard (Api simulado).
// Todo es simulado: al recargar vuelve al estado inicial.
// ============================================================

let socioId = null;      // id del socio logueado
let socio = null;        // copia fresca de sus datos
let vistaActual = 'inicio';
let chartPeso = null;    // instancia de Chart.js (avances)
let _selHora = null;     // bloque elegido en Reservar (antes de confirmar)

// Los bloques horarios y sus cupos se toman de Horarios (configurados por el admin).

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

function planPorId(id) { return (typeof PLANES !== 'undefined' ? PLANES : []).find(p => p.id === id) || null; }
function planNombre(id) { const p = planPorId(id); return p ? p.nombre : (id || '—'); }

function diasRestantes(vence) {
    if (!vence) return null;
    const h = new Date(Acceso.hoyISO() + 'T00:00:00');
    const v = new Date(String(vence) + 'T00:00:00');
    return Math.round((v - h) / 86400000);
}
function fechaLinda(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).split('-');
    return `${d}/${m}/${y}`;
}

function toast(msg, ok = true) {
    const t = document.createElement('div');
    t.className = `fixed left-1/2 -translate-x-1/2 bottom-24 z-50 px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg ${ok ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 1900);
}

async function recargarSocio() {
    const todos = await Api.getClientes();
    socio = todos.find(c => c.id === socioId) || null;
}

// ---------- Login / sesión ----------
// Usuario = correo del socio. Primer ingreso con clave genérica (Cuentas.CLAVE_GENERICA)
// → elige su contraseña. Luego entra con la suya. No puede cambiarla (solo el admin resetea).
let _todos = [];            // socios cargados (para buscar por correo)
let _pendingSetId = null;   // socio que está eligiendo su clave (primer ingreso)
let _onboarding = false;    // true = primer ingreso, debe completar su ficha antes de usar el portal

document.addEventListener('DOMContentLoaded', async () => {
    _todos = await Api.getClientes();
    const sel = $('login-demo-cliente');
    if (sel) {
        sel.innerHTML = '<option value="">— elegí un socio de ejemplo —</option>' + _todos.map(c => {
            const activo = Acceso.planActivo(c);
            const etq = activo ? 'activo' : (c.estado === 'Congelado' ? 'congelado' : 'vencido');
            return `<option value="${c.id}">${esc(c.nombre)} ${esc(c.apellido)} · ${esc(c.correo || 'sin correo')} · ${etq}</option>`;
        }).join('');
        sel.onchange = () => {
            const c = _todos.find(x => x.id === sel.value);
            if (!c) { $('login-hint').innerHTML = ''; return; }
            $('login-email').value = c.correo || '';
            actualizarHintLogin(c.id);
        };
        // Preselecciona un socio con datos ricos (Matías) si está.
        if (_todos.some(c => c.id === 'c1')) { sel.value = 'c1'; sel.onchange(); }
    }
});

// Pista de la demo: muestra si la cuenta del socio elegido está pendiente o activa.
function actualizarHintLogin(id) {
    const hint = $('login-hint');
    if (!hint || typeof Cuentas === 'undefined') return;
    hint.innerHTML = (Cuentas.estado(id) === 'activa')
        ? `<i class="fa-solid fa-circle-check text-emerald-400"></i> Este socio ya eligió su clave. Si la olvidó, el gimnasio la resetea desde el Dashboard.`
        : `<i class="fa-solid fa-key text-amber-400"></i> Cuenta nueva: ingresá con la clave genérica <b class="text-amber-400">${Cuentas.CLAVE_GENERICA}</b> y elegí tu contraseña.`;
}

async function portalLogin() {
    const email = ($('login-email').value || '').trim().toLowerCase();
    const clave = $('login-clave').value || '';
    if (!email) { toast('Ingresá tu correo', false); return; }
    const c = _todos.find(x => String(x.correo || '').trim().toLowerCase() === email);
    if (!c) { toast('No existe una cuenta con ese correo', false); return; }

    const r = Cuentas.verificar(c.id, clave);
    if (!r.ok) { toast('Correo o contraseña incorrectos', false); return; }

    if (r.requiereCambio) {
        // Primer ingreso: debe elegir su contraseña.
        _pendingSetId = c.id;
        $('set-clave1').value = ''; $('set-clave2').value = '';
        $('portal-login').classList.add('hidden');
        $('portal-setpass').classList.remove('hidden');
        setTimeout(() => $('set-clave1').focus(), 30);
        return;
    }
    entrarComoSocio(c.id);
}

function portalGuardarClave() {
    const c1 = $('set-clave1').value || '', c2 = $('set-clave2').value || '';
    if (c1.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', false); return; }
    if (c1 !== c2) { toast('Las contraseñas no coinciden', false); return; }
    if (c1 === Cuentas.CLAVE_GENERICA) { toast('Elegí una clave distinta a la genérica', false); return; }
    Cuentas.definirClave(_pendingSetId, c1);
    toast('Contraseña creada ✔');
    const id = _pendingSetId; _pendingSetId = null;
    entrarComoSocio(id);
}

async function entrarComoSocio(id) {
    socioId = id;
    await recargarSocio();
    $('portal-login').classList.add('hidden');
    $('portal-setpass').classList.add('hidden');
    $('portal-app').classList.remove('hidden');
    $('hdr-nombre').textContent = `${socio.nombre} ${socio.apellido}`;
    // Primer ingreso: debe completar su ficha antes de usar el resto del portal.
    _onboarding = (typeof Cuentas !== 'undefined') && Cuentas.necesitaDatos(socioId);
    irA(_onboarding ? 'datos' : 'inicio');
}

function portalLogout() {
    // En la demo, "salir" recarga y vuelve al login (resetea el estado en memoria).
    location.reload();
}

// ---------- Navegación ----------
function irA(vista) {
    // Durante el onboarding (primer ingreso) solo se puede estar en "Mis datos".
    if (_onboarding && vista !== 'datos') { toast('Primero completá tus datos', false); vista = 'datos'; }
    vistaActual = vista;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('activa'));
    $(`view-${vista}`).classList.add('activa');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('activo', b.dataset.view === vista));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (vista === 'inicio') renderInicio();
    if (vista === 'reservar') renderReservar();
    if (vista === 'datos') renderDatos();
    if (vista === 'pagos') renderPagos();
    if (vista === 'avances') renderAvances();
}

// ---------- INICIO ----------
function renderInicio() {
    const activo = Acceso.planActivo(socio);
    const indef = Acceso.esPlanIndefinido(socio.planId);
    const dias = indef ? null : diasRestantes(socio.vence);
    const reserva = Acceso.reservaDeHoy(socioId);

    let estadoCard;
    if (activo && indef) {
        estadoCard = tarjetaEstado('emerald', 'Plan activo', `${planNombre(socio.planId)} · sin vencimiento`, 'fa-infinity');
    } else if (activo) {
        const txt = dias === 0 ? 'Vence hoy' : (dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`);
        estadoCard = tarjetaEstado('emerald', 'Plan activo', `${planNombre(socio.planId)} · ${txt} (${fechaLinda(socio.vence)})`, 'fa-circle-check');
    } else {
        const motivo = socio.estado === 'Congelado' ? 'Membresía congelada' : 'Plan vencido';
        estadoCard = tarjetaEstado('rose', motivo, 'Renová tu plan para volver a entrar', 'fa-circle-xmark');
    }

    const reservaSub = reserva
        ? (reserva.usado ? 'Ingreso ya registrado' : (reserva.generado ? 'QR listo · ' + (reserva.bloque || '') : 'Falta generar tu QR · ' + (reserva.bloque || '')))
        : '';
    const reservaCard = reserva
        ? `<div class="bg-slate-950 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between">
              <div><p class="text-[11px] text-slate-400">Tu horario de hoy</p>
              <p class="text-white font-bold">${esc(reservaSub)}</p></div>
              <button onclick="irA('reservar')" class="text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl">${reserva.generado ? 'Ver mi QR' : 'Generar QR'}</button>
           </div>`
        : `<button onclick="irA('reservar')" class="w-full bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-2xl p-4 flex items-center justify-between hover:brightness-110 transition">
              <span class="font-black">Reservar mi horario de hoy</span>
              <i class="fa-solid fa-qrcode text-xl"></i>
           </button>`;

    $('view-inicio').innerHTML = `
        <div class="pt-1">
            <p class="text-slate-400 text-sm">Hola,</p>
            <h2 class="text-2xl font-black text-white leading-tight">${esc(socio.nombre)} 👋</h2>
        </div>
        ${estadoCard}
        ${reservaCard}
        <div class="grid grid-cols-2 gap-3">
            ${miniStat('Racha', `Mes ${socio.racha_meses}/20`, 'fa-fire', 'text-amber-400')}
            ${miniStat('Asistencias del mes', String(socio.asistenciasMes || 0), 'fa-calendar-check', 'text-cyan-400')}
        </div>
        <div class="grid grid-cols-3 gap-3">
            ${accesoRapido('reservar', 'Reservar', 'fa-qrcode')}
            ${accesoRapido('pagos', 'Pagar', 'fa-credit-card')}
            ${accesoRapido('avances', 'Avances', 'fa-chart-line')}
        </div>`;
}

function tarjetaEstado(color, titulo, sub, ico) {
    const map = {
        emerald: 'from-emerald-500/15 to-teal-500/5 border-emerald-500/30 text-emerald-400',
        rose: 'from-rose-500/15 to-red-500/5 border-rose-500/30 text-rose-400'
    };
    return `<div class="bg-gradient-to-br ${map[color]} border rounded-2xl p-4 flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl bg-black/40 flex items-center justify-center text-xl"><i class="fa-solid ${ico}"></i></div>
        <div><p class="font-black text-white leading-tight">${titulo}</p><p class="text-xs text-slate-300">${sub}</p></div>
    </div>`;
}
function miniStat(label, val, ico, color) {
    return `<div class="bg-slate-950 border border-slate-800 rounded-2xl p-3">
        <p class="text-[10px] text-slate-400 flex items-center gap-1"><i class="fa-solid ${ico} ${color}"></i> ${label}</p>
        <p class="text-lg font-black text-white mt-0.5">${val}</p></div>`;
}
function accesoRapido(vista, label, ico) {
    return `<button onclick="irA('${vista}')" class="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:border-slate-700 transition">
        <i class="fa-solid ${ico} text-slate-300"></i><span class="text-[10px] font-bold text-slate-400">${label}</span></button>`;
}

// ---------- RESERVAR (QR del día) ----------
function renderReservar() {
    const cont = $('view-reservar');

    if (!Acceso.planActivo(socio)) {
        cont.innerHTML = `
            <h2 class="text-xl font-black text-white">Reservar horario</h2>
            <div class="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 text-center space-y-3">
                <i class="fa-solid fa-lock text-rose-400 text-2xl"></i>
                <p class="text-slate-200 font-bold">${socio.estado === 'Congelado' ? 'Tu membresía está congelada' : 'Tu plan está vencido'}</p>
                <p class="text-xs text-slate-400">Para reservar y recibir tu QR del día, primero renová tu plan.</p>
                <button onclick="irA('pagos')" class="w-full py-3 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-black">Ir a pagar / renovar</button>
            </div>`;
        return;
    }

    const hoy = Acceso.hoyISO();
    const reserva = Acceso.reservaDeHoy(socioId);

    // ---- Caso A: ya tiene reserva confirmada de hoy ----
    if (reserva) {
        const b = Horarios.bloquePorHora(reserva.bloque);
        const entren = b ? esc(Horarios.entrenadorNombre(b.entrenadorId)) : '';
        const estadoTxt = reserva.usado
            ? '<span class="text-amber-400 font-bold">Ya usaste tu ingreso de hoy</span>'
            : (reserva.generado ? '<span class="text-emerald-400 font-bold">QR listo para la entrada</span>' : '<span class="text-slate-400">Falta generar tu QR</span>');

        cont.innerHTML = `
            <h2 class="text-xl font-black text-white">Tu horario de hoy</h2>
            <div class="bg-slate-950 border border-emerald-500/30 rounded-2xl p-4">
                <p class="text-[11px] text-slate-400">${fechaLinda(hoy)}</p>
                <p class="text-2xl font-black text-white leading-tight mt-0.5">${esc(reserva.bloque || '—')} hs</p>
                ${entren ? `<p class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-user"></i> ${entren}</p>` : ''}
                <p class="text-xs mt-2">${estadoTxt}</p>
            </div>

            ${reserva.usado
                ? `<div class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center text-sm text-amber-300 font-bold"><i class="fa-solid fa-circle-check"></i> Ingreso registrado. El QR es de un solo uso por día.</div>`
                : (reserva.generado
                    ? `<div id="qr-zona"></div>`
                    : `<button onclick="generarMiQr()" class="w-full py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-red-600 to-rose-600 text-white hover:brightness-110 transition flex items-center justify-center gap-2">
                          <i class="fa-solid fa-qrcode text-lg"></i> Generar mi QR
                       </button>
                       <p class="text-[11px] text-slate-500 text-center">Tu QR es único e intransferible, válido solo para hoy y para un ingreso.</p>`)}

            <button onclick="cancelarReservaPortal()" class="w-full py-3 rounded-xl font-bold text-sm bg-slate-900 border border-slate-800 text-slate-300 hover:border-rose-500/50 hover:text-rose-300 transition">
                <i class="fa-solid fa-rotate-left"></i> Cancelar y elegir otro horario
            </button>`;

        if (reserva.generado && !reserva.usado) pintarQr(reserva);
        return;
    }

    // ---- Caso B: elegir un bloque (aún sin reservar) ----
    const activos = Horarios.bloquesActivos();
    const slots = activos.map(b => {
        const ocup = Horarios.ocupacion(b.hora, hoy);
        const lleno = ocup >= b.cupo;
        const sel = _selHora === b.hora;
        const disp = Math.max(0, b.cupo - ocup);
        const cls = sel
            ? 'bg-emerald-500 text-black border-emerald-500'
            : lleno
                ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                : 'bg-slate-950 text-slate-200 border-slate-800 hover:border-slate-600';
        const etq = sel ? 'Elegido' : (lleno ? 'LLENO' : `${disp} cupos`);
        const etqCls = sel ? 'text-black/70' : (lleno ? 'text-rose-400' : 'text-emerald-400');
        return `<button ${lleno ? 'disabled' : ''} onclick="seleccionarBloque('${b.hora}')" class="p-3 rounded-xl text-left border transition ${cls}">
            <div class="flex items-center justify-between"><span class="font-black text-sm">${b.hora}</span>
            <span class="text-[10px] font-bold ${etqCls}">${etq}</span></div>
            <div class="text-[11px] ${sel ? 'text-black/60' : 'text-slate-400'} mt-0.5 truncate">${esc(Horarios.entrenadorNombre(b.entrenadorId))}</div>
        </button>`;
    }).join('');

    cont.innerHTML = `
        <h2 class="text-xl font-black text-white">Reservar horario de hoy</h2>
        <p class="text-xs text-slate-400 -mt-2">1) Elegí tu bloque · 2) Confirmá · 3) Generá tu QR. Es <b class="text-white">un QR por día</b> (${fechaLinda(hoy)}).</p>
        <div class="grid grid-cols-2 gap-2">${slots || '<p class="text-slate-500 text-sm col-span-2 text-center py-4">No hay bloques activos hoy.</p>'}</div>
        <div id="confirm-zona" class="mt-1"></div>`;

    pintarConfirm();
}

// Marca un bloque como elegido (todavía no reserva).
function seleccionarBloque(hora) {
    const b = Horarios.bloquePorHora(hora);
    if (!b || !b.activo) return;
    if (Horarios.ocupacion(hora, Acceso.hoyISO()) >= b.cupo) { toast('Ese bloque está lleno', false); return; }
    _selHora = hora;
    renderReservar();
}

// Botón "Confirmar horario" cuando hay un bloque elegido.
function pintarConfirm() {
    const z = $('confirm-zona');
    if (!z) return;
    if (!_selHora) { z.innerHTML = ''; return; }
    z.innerHTML = `
        <button onclick="confirmarHorario()" class="w-full py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:brightness-110 transition">
            <i class="fa-solid fa-check"></i> Confirmar horario ${esc(_selHora)}
        </button>
        <p class="text-[11px] text-slate-500 text-center mt-2">Después vas a poder generar tu QR. Si te equivocás, lo cancelás y elegís otro.</p>`;
}

function confirmarHorario() {
    if (!_selHora) return;
    const b = Horarios.bloquePorHora(_selHora);
    if (!b || !b.activo) return;
    if (Horarios.ocupacion(_selHora, Acceso.hoyISO()) >= b.cupo) {
        toast('Ese bloque se llenó', false); _selHora = null; renderReservar(); return;
    }
    Acceso.reservarBloque(socio, _selHora);
    _selHora = null;
    toast('Horario confirmado ✔');
    renderReservar();
}

function generarMiQr() {
    const r = Acceso.generarQr(socioId);
    if (r) toast('QR generado ✔');
    renderReservar();
}

function cancelarReservaPortal() {
    if (!confirm('¿Cancelar tu horario de hoy?\n\nSe anula el QR actual y vas a poder elegir otra hora (se genera uno nuevo).')) return;
    Acceso.cancelarReserva(socioId);
    _selHora = null;
    toast('Reserva cancelada');
    renderReservar();
}

function pintarQr(reserva) {
    const zona = $('qr-zona');
    if (!zona) return;
    zona.innerHTML = `
        <div class="bg-white rounded-2xl p-4 flex flex-col items-center gap-3">
            <div id="qr-box"></div>
            <p class="text-black text-xs font-bold">Bloque ${esc(reserva.bloque || '—')} · ${fechaLinda(reserva.fecha)}</p>
        </div>
        <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 mt-3 text-center">
            <p class="text-emerald-400 text-sm font-bold"><i class="fa-solid fa-circle-check"></i> Mostrá este QR en la entrada</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Único e intransferible · un solo ingreso hoy. Mañana generás uno nuevo.</p>
        </div>`;
    const box = $('qr-box');
    box.innerHTML = '';
    new QRCode(box, { text: reserva.qr, width: 190, height: 190, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

// ---------- MIS DATOS ----------
function renderDatos() {
    const f = (id, label, val, type = 'text', ph = '') =>
        `<div><label class="text-[11px] text-slate-400 font-semibold block mb-1">${label}</label>
         <input id="d-${id}" type="${type}" value="${esc(val)}" placeholder="${ph}" class="w-full bg-black border border-slate-800 rounded-xl p-3 text-white text-sm"></div>`;

    const banner = _onboarding ? `
        <div class="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 flex items-start gap-3">
            <i class="fa-solid fa-clipboard-list text-amber-400 text-lg mt-0.5"></i>
            <div><p class="text-amber-300 font-black text-sm">Completá tu ficha para empezar</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Para activar tu acceso necesitamos: RUT, teléfono, cumpleaños, género y un contacto de emergencia.</p></div>
        </div>` : '';

    $('view-datos').innerHTML = `
        ${banner}
        <h2 class="text-xl font-black text-white">Mis datos</h2>
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <p class="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Personales</p>
            ${f('rut', 'RUT', socio.rut, 'text', '12.345.678-9')}
            <div class="grid grid-cols-2 gap-3">${f('nombre', 'Nombre', socio.nombre)}${f('apellido', 'Apellido', socio.apellido)}</div>
            ${f('correo', 'Correo', socio.correo, 'email')}
            ${f('telefono', 'Teléfono', socio.telefono, 'tel', '+56 9 ...')}
            <div class="grid grid-cols-2 gap-3">
                ${f('cumpleanos', 'Cumpleaños', socio.cumpleanos, 'date')}
                <div><label class="text-[11px] text-slate-400 font-semibold block mb-1">Género</label>
                    <select id="d-genero" class="w-full bg-black border border-slate-800 rounded-xl p-3 text-white text-sm">
                        <option value="" ${!socio.genero ? 'selected' : ''}>—</option>
                        <option value="M" ${socio.genero === 'M' ? 'selected' : ''}>Hombre</option>
                        <option value="F" ${socio.genero === 'F' ? 'selected' : ''}>Mujer</option>
                    </select></div>
            </div>
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <p class="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Antecedentes de salud</p>
            <label class="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                <input type="checkbox" id="d-saludControlesAlDia" ${socio.saludControlesAlDia ? 'checked' : ''} class="accent-emerald-500 w-4 h-4"> Tengo mis controles médicos al día
            </label>
            ${f('saludEnfermedades', 'Enfermedades / condiciones', socio.saludEnfermedades)}
            ${f('saludMedicamentos', 'Medicamentos', socio.saludMedicamentos)}
            ${f('saludAlergias', 'Alergias', socio.saludAlergias)}
            ${f('saludLesiones', 'Lesiones / cirugías', socio.saludLesiones)}
            ${f('saludGrupo', 'Grupo sanguíneo', socio.saludGrupo, 'text', 'O+')}
            ${f('saludNotas', 'Otra información de salud', socio.saludNotas)}
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <p class="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Contacto de emergencia</p>
            <div class="grid grid-cols-2 gap-3">${f('emergencia1Nombre', 'Contacto 1 — Nombre', socio.emergencia1Nombre)}${f('telefonoEmergencia', 'Contacto 1 — Teléfono', socio.telefonoEmergencia, 'tel')}</div>
            <div class="grid grid-cols-2 gap-3">${f('emergencia2Nombre', 'Contacto 2 — Nombre', socio.emergencia2Nombre)}${f('emergencia2Telefono', 'Contacto 2 — Teléfono', socio.emergencia2Telefono, 'tel')}</div>
            ${f('emergenciaLugar', '¿Dónde llevarte en una emergencia? (clínica / hospital)', socio.emergenciaLugar)}
        </div>
        <button onclick="guardarDatos()" class="w-full py-3 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-black">${_onboarding ? 'Guardar y continuar' : 'Guardar mis datos'}</button>`;
}

async function guardarDatos() {
    const val = (id) => { const el = $('d-' + id); return el ? (el.value.trim() || null) : null; };
    const datos = {
        rut: val('rut'), nombre: val('nombre') || socio.nombre, apellido: val('apellido') || socio.apellido,
        correo: val('correo'), telefono: val('telefono'), cumpleanos: val('cumpleanos'), genero: $('d-genero').value || null,
        saludControlesAlDia: $('d-saludControlesAlDia').checked,
        saludEnfermedades: val('saludEnfermedades'), saludMedicamentos: val('saludMedicamentos'),
        saludAlergias: val('saludAlergias'), saludLesiones: val('saludLesiones'), saludGrupo: val('saludGrupo'),
        saludNotas: val('saludNotas'),
        emergencia1Nombre: val('emergencia1Nombre'), telefonoEmergencia: val('telefonoEmergencia'),
        emergencia2Nombre: val('emergencia2Nombre'), emergencia2Telefono: val('emergencia2Telefono'),
        emergenciaLugar: val('emergenciaLugar')
    };

    // En el primer ingreso, exigir los campos clave de la ficha.
    if (_onboarding) {
        const req = [
            ['rut', 'RUT'], ['telefono', 'Teléfono'], ['cumpleanos', 'Cumpleaños'],
            ['genero', 'Género'], ['emergencia1Nombre', 'Contacto de emergencia (nombre)'],
            ['telefonoEmergencia', 'Contacto de emergencia (teléfono)']
        ];
        const faltan = req.filter(([k]) => !datos[k]).map(([, label]) => label);
        if (faltan.length) { toast('Falta completar: ' + faltan.join(', '), false); return; }
    }

    await Api.actualizarCliente(socioId, datos);
    await recargarSocio();
    $('hdr-nombre').textContent = `${socio.nombre} ${socio.apellido}`;

    if (_onboarding) {
        Cuentas.marcarDatosListos(socioId);
        _onboarding = false;
        toast('¡Listo! Bienvenido/a 🎉');
        irA('inicio');
    } else {
        toast('Datos guardados ✔');
    }
}

// ---------- PAGOS ----------
function renderPagos() {
    const p = planPorId(socio.planId);
    const activo = Acceso.planActivo(socio);
    const pagos = [...(socio.pagos || [])];

    const historial = pagos.length
        ? pagos.map(pg => `<div class="flex items-center justify-between py-2.5 border-b border-slate-900 last:border-0">
              <div><p class="text-sm text-white font-semibold">${esc(pg.concepto)}</p>
              <p class="text-[11px] text-slate-500">${fechaLinda(pg.fecha)} · ${esc(pg.metodo)}</p></div>
              <p class="text-sm font-black text-emerald-400">${money(pg.monto)}</p></div>`).join('')
        : `<p class="text-sm text-slate-500 text-center py-3">Sin pagos registrados.</p>`;

    const planActual = planPorId(socio.planId);
    const precioPlan = planActual ? planActual.precio : 0;
    const puedePagar = planActual && precioPlan > 0 && !Acceso.esPlanIndefinido(socio.planId);
    const bloquePagar = puedePagar
        ? `<div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <p class="text-sm font-black text-white">Pagar / Renovar mi plan</p>
            <div class="flex items-center justify-between bg-black border border-slate-800 rounded-xl p-3">
                <div><p class="text-[11px] text-slate-400">Tu plan (lo asigna el gimnasio)</p><p class="text-white font-bold">${esc(planNombre(socio.planId))}</p></div>
                <p class="text-emerald-400 font-black">${money(precioPlan)}</p>
            </div>
            <div><label class="text-[11px] text-slate-400 font-semibold block mb-1">Medio de pago</label>
                <select id="pay-metodo" class="w-full bg-black border border-slate-800 rounded-xl p-3 text-white text-sm">
                    <option>Transferencia</option><option>Débito</option><option>Crédito</option>
                </select></div>
            <button onclick="pagarRenovar()" class="w-full py-3 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-black">
                <i class="fa-solid fa-credit-card"></i> Pagar ${money(precioPlan)} (simulado)
            </button>
            <p class="text-[10px] text-slate-500 text-center">Demo: el pago no cobra nada. Solo podés pagar/renovar tu plan actual; el <b>cambio de plan lo hace el gimnasio</b>.</p>
        </div>`
        : `<div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <p class="text-sm font-black text-white mb-1">Pagar / Renovar</p>
            <p class="text-sm text-slate-400">${(planActual && precioPlan === 0) ? 'Tu plan no tiene costo, no requiere pago.' : 'Tu plan lo gestiona el gimnasio.'}</p>
            <p class="text-[11px] text-slate-500 mt-1">Para cambiar de plan, hablá con el gimnasio.</p>
        </div>`;

    $('view-pagos').innerHTML = `
        <h2 class="text-xl font-black text-white">Pagos</h2>
        <div class="bg-slate-950 border ${activo ? 'border-emerald-500/30' : 'border-rose-500/30'} rounded-2xl p-4">
            <p class="text-[11px] text-slate-400">Mi plan</p>
            <p class="text-lg font-black text-white">${planNombre(socio.planId)}</p>
            <p class="text-xs ${activo ? 'text-emerald-400' : 'text-rose-400'} font-bold mt-0.5">
                ${activo ? (Acceso.esPlanIndefinido(socio.planId) ? 'Activo · sin vencimiento' : 'Activo · vence ' + fechaLinda(socio.vence)) : (socio.estado === 'Congelado' ? 'Congelado' : 'Vencido · ' + fechaLinda(socio.vence))}
            </p>
        </div>

        ${bloquePagar}

        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <p class="text-sm font-black text-white mb-1">Historial de pagos</p>
            ${historial}
        </div>`;
}

async function pagarRenovar() {
    // El socio solo paga SU plan (asignado por el gimnasio). No puede cambiarlo.
    const plan = planPorId(socio.planId);
    if (!plan || plan.precio <= 0) return;
    const metodo = ($('pay-metodo') || {}).value || 'Transferencia';
    const hoy = Acceso.hoyISO();

    // 1) Registrar el pago
    await Api.agregarPago(socioId, { fecha: hoy, concepto: plan.nombre, monto: plan.precio, metodo });

    // 2) Renovar: extiende desde el vencimiento vigente (si aún no venció) o desde hoy.
    //    NO cambia el plan. Deja estado Al día y suma 1 a la racha.
    const base = (socio.vence && String(socio.vence) > hoy) ? new Date(socio.vence + 'T00:00:00') : new Date(hoy + 'T00:00:00');
    base.setMonth(base.getMonth() + plan.duracion_meses);
    const vIso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    await Api.actualizarCliente(socioId, { estado: 'Al día', vence: vIso, racha_meses: (socio.racha_meses || 0) + 1 });

    await recargarSocio();
    toast('¡Pago realizado! Plan activo ✔');
    renderPagos();
}

// ---------- AVANCES ----------
function renderAvances() {
    const medidas = [...(socio.medidasHistorial || [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const conPeso = medidas.filter(m => m.peso != null);

    // Mejor marca por ejercicio (PRs)
    const prs = socio.prsHistorial || [];
    const mejores = {};
    prs.forEach(p => { const k = p.ejercicio; if (!mejores[k] || p.marca > mejores[k]) mejores[k] = p.marca; });
    const listaPRs = Object.entries(mejores).sort((a, b) => b[1] - a[1]);

    $('view-avances').innerHTML = `
        <h2 class="text-xl font-black text-white">Mis avances</h2>
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <p class="text-sm font-black text-white mb-2">Peso corporal</p>
            ${conPeso.length >= 2
            ? `<canvas id="chart-peso" height="160"></canvas>`
            : `<p class="text-sm text-slate-500 text-center py-4">Todavía no hay suficientes registros de peso.<br>Tu entrenador los carga en cada control.</p>`}
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <p class="text-sm font-black text-white mb-2">Mis récords (PRs)</p>
            ${listaPRs.length
            ? `<div class="space-y-2">${listaPRs.map(([ej, mk]) => `
                <div class="flex items-center justify-between">
                    <span class="text-sm text-slate-300">${esc(ej)}</span>
                    <span class="text-sm font-black text-amber-400">${mk}</span>
                </div>`).join('')}</div>`
            : `<p class="text-sm text-slate-500 text-center py-3">Todavía no hay récords cargados.</p>`}
        </div>
        <div class="grid grid-cols-2 gap-3">
            ${miniStat('Racha de meses', `${socio.racha_meses}/20`, 'fa-fire', 'text-amber-400')}
            ${miniStat('Asistencias del mes', String(socio.asistenciasMes || 0), 'fa-calendar-check', 'text-cyan-400')}
        </div>`;

    if (chartPeso) { chartPeso.destroy(); chartPeso = null; }
    if (conPeso.length >= 2) {
        const ctx = $('chart-peso');
        chartPeso = new Chart(ctx, {
            type: 'line',
            data: {
                labels: conPeso.map(m => fechaLinda(m.fecha).slice(0, 5)),
                datasets: [{
                    label: 'Peso (kg)', data: conPeso.map(m => m.peso),
                    borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.15)',
                    fill: true, tension: .3, pointRadius: 4, pointBackgroundColor: '#34d399'
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(148,163,184,.1)' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(148,163,184,.1)' } }
                }
            }
        });
    }
}
