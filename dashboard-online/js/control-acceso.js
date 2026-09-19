// ============================================================
// control-acceso.js — Pantalla de control de acceso (DEMO)
// ============================================================
// Kiosco de "puerta": lee el QR del socio (cámara o simulado) y muestra
// VERDE "ACTIVO" o ROJO "DENEGADO" validando con Acceso.validar():
//   • QR de HOY  • firma correcta  • plan vigente (no vencido/congelado)
// Todo simulado sobre los datos de la demo.
// ============================================================

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

let camara = null;         // instancia Html5Qrcode
let camaraOn = false;
let procesando = false;    // evita re-disparos mientras se muestra un resultado
let resetTimer = null;

// ---------- Poblar el selector "simular" ----------
document.addEventListener('DOMContentLoaded', async () => {
    const sel = $('sim-socio');
    const socios = await Api.getClientes();
    sel.innerHTML = socios.map(c => {
        const et = Acceso.planActivo(c) ? 'activo' : (c.estado === 'Congelado' ? 'congelado' : 'vencido');
        return `<option value="${c.id}">${esc(c.nombre)} ${esc(c.apellido)} · ${et}</option>`;
    }).join('');
    pantallaLista();
});

// ---------- Núcleo: procesar un QR ----------
function procesarQr(payload) {
    if (procesando) return;
    procesando = true;
    const r = Acceso.validar(payload);
    mostrarResultado(r);
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { procesando = false; pantallaLista(); }, 4500);
}

function pantallaLista() {
    const p = $('pantalla');
    p.className = 'rounded-3xl border-4 border-slate-800 bg-slate-950 p-8 md:p-12 text-center transition-colors';
    p.innerHTML = `
        <div class="text-slate-600 text-7xl md:text-8xl mb-4"><i class="fa-solid fa-qrcode"></i></div>
        <h2 class="text-2xl md:text-3xl font-black text-white">Escaneá tu QR</h2>
        <p class="text-slate-400 mt-2">Acercá el QR del día a la cámara</p>`;
}

function mostrarResultado(r) {
    const p = $('pantalla');
    const c = r.cliente;
    const nombre = c ? `${esc(c.nombre)} ${esc(c.apellido)}` : '—';
    const plan = c ? planNombre(c.planId) : '';

    if (r.ok) {
        p.className = 'rounded-3xl border-4 border-emerald-500 bg-emerald-500/10 p-8 md:p-12 text-center transition-colors';
        p.innerHTML = `
            <div class="text-emerald-400 text-7xl md:text-8xl mb-3"><i class="fa-solid fa-circle-check"></i></div>
            <h2 class="text-4xl md:text-6xl font-black text-emerald-400 tracking-tight">ACTIVO</h2>
            <p class="text-2xl md:text-3xl font-bold text-white mt-3">${nombre}</p>
            <p class="text-slate-300 mt-1">${esc(plan)} · Acceso permitido</p>
            <p class="text-emerald-400/80 text-sm mt-4"><i class="fa-solid fa-door-open"></i> ¡Adelante, buen entrenamiento!</p>`;
    } else {
        p.className = 'rounded-3xl border-4 border-rose-500 bg-rose-500/10 p-8 md:p-12 text-center transition-colors';
        p.innerHTML = `
            <div class="text-rose-400 text-7xl md:text-8xl mb-3"><i class="fa-solid fa-circle-xmark"></i></div>
            <h2 class="text-4xl md:text-6xl font-black text-rose-400 tracking-tight">DENEGADO</h2>
            <p class="text-2xl md:text-3xl font-bold text-white mt-3">${nombre}</p>
            <p class="text-rose-300 mt-1">${esc(r.motivo)}</p>
            <p class="text-slate-400 text-sm mt-4"><i class="fa-solid fa-hand"></i> Pasá por recepción para regularizar.</p>`;
    }
}

function planNombre(id) {
    const p = (typeof PLANES !== 'undefined' ? PLANES : []).find(x => x.id === id);
    return p ? p.nombre : (id || '');
}

// ---------- Simular escaneo (demo, sin cámara) ----------
function simularEscaneo() {
    const id = $('sim-socio').value;
    const socio = (typeof CLIENTES_DEMO !== 'undefined') ? CLIENTES_DEMO.find(c => c.id === id) : null;
    if (!socio) return;
    // Emite el QR del día de ese socio (como si lo hubiera sacado en el portal)
    const reserva = Acceso.emitirQrDia(socio, null);
    procesando = false;               // permitir re-simular seguido
    procesarQr(reserva.qr);
}

function validarPegado() {
    const txt = ($('sim-pegar').value || '').trim();
    if (!txt) return;
    procesando = false;
    procesarQr(txt);
}

// ---------- Cámara real (html5-qrcode) ----------
async function toggleCamara() {
    if (typeof Html5Qrcode === 'undefined') {
        $('cam-estado').textContent = 'No se pudo cargar el lector de cámara (revisá tu conexión).';
        return;
    }
    if (camaraOn) { await detenerCamara(); return; }

    try {
        camara = new Html5Qrcode('reader', { verbose: false });
        await camara.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (texto) => procesarQr(texto),
            () => { /* ignora frames sin QR */ }
        );
        camaraOn = true;
        $('btn-cam').innerHTML = '<i class="fa-solid fa-video-slash"></i> Apagar cámara';
        $('cam-estado').textContent = 'Cámara encendida · apuntá al QR';
    } catch (e) {
        $('cam-estado').textContent = 'No se pudo acceder a la cámara: ' + (e && e.message ? e.message : e) + '. Usá "Simular escaneo".';
    }
}

async function detenerCamara() {
    try { if (camara) { await camara.stop(); await camara.clear(); } } catch (_) { }
    camaraOn = false;
    camara = null;
    $('btn-cam').innerHTML = '<i class="fa-solid fa-video"></i> Encender cámara';
    $('cam-estado').textContent = '';
}
