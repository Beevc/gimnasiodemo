// ============================================================
// acceso-demo.js — QR del día + validación de acceso (DEMO)
// ============================================================
// Módulo compartido por:
//   • portal.html   -> el socio RESERVA un horario, lo CONFIRMA y GENERA su QR.
//   • acceso.html   -> el control de acceso VALIDA el QR (verde/rojo).
//
// Reglas del negocio:
//   • 1 QR por socio por día. Único e intransferible.
//   • Flujo: reservar bloque -> confirmar -> generar QR.
//   • Cada reserva lleva un TOKEN nuevo; si el socio cancela y elige otra
//     hora, se genera un token nuevo y el QR anterior queda INVÁLIDO.
//   • Un solo ingreso por día: al primer escaneo válido el QR queda USADO;
//     si se vuelve a escanear ese día -> DENEGADO (evita préstamo).
//   • El acceso es ACTIVO si: QR de HOY, firma correcta, token vigente,
//     plan del socio activo y QR no usado aún.
//
// Persistencia: localStorage (mismo origen) para cruzar portal <-> control.
// El QR embebe el token, así que el control valida contra la reserva vigente.
// ============================================================

const Acceso = (() => {
    const KEY = 'javofit_demo_reservas_v1';

    const hoyISO = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const _load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
    const _save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* modo privado: se ignora */ } };

    // Busca al socio en los datos de la demo (mismo array que el dashboard).
    const _cliente = (cid) => (typeof CLIENTES_DEMO !== 'undefined') ? CLIENTES_DEMO.find(c => c.id === cid) : null;

    const esPlanIndefinido = (planId) => planId === 'coach';

    // ¿El plan del socio está vigente hoy?
    const planActivo = (c) => {
        if (!c) return false;
        if (c.estado === 'Vencido' || c.estado === 'Congelado') return false;
        if (esPlanIndefinido(c.planId)) return true;
        return String(c.vence || '') >= hoyISO();
    };

    // Token único por emisión (hace único e invalidable cada QR).
    const _nuevoToken = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

    // Firma determinística que incluye el token (solo demo, no es seguridad real).
    const _firma = (cid, fecha, token) => {
        let h = 0;
        const s = `${cid}|${fecha}|${token}|javofit-demo`;
        for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
        return (h >>> 0).toString(36);
    };

    const _armarQr = (cid, fecha, planId, token) => `JAVOFIT|v1|${cid}|${fecha}|${planId}|${token}|${_firma(cid, fecha, token)}`;

    // Reserva (o re-reserva) un bloque para HOY. Genera un token NUEVO y deja
    // el QR SIN generar todavía. Reemplaza cualquier reserva previa del día
    // (1 por socio por día) e invalida el QR anterior.
    const reservarBloque = (cliente, bloque) => {
        const fecha = hoyISO();
        const token = _nuevoToken();
        const store = _load();
        store[cliente.id] = {
            fecha,
            bloque: bloque || null,
            token,
            qr: _armarQr(cliente.id, fecha, cliente.planId, token),
            generado: false,
            usado: false
        };
        _save(store);
        return store[cliente.id];
    };

    // Marca el QR como generado (el socio tocó "Generar mi QR"). Devuelve la reserva.
    const generarQr = (cid) => {
        const store = _load();
        const r = store[cid];
        if (!r || r.fecha !== hoyISO()) return null;
        r.generado = true;
        store[cid] = r; _save(store);
        return r;
    };

    // Cancela la reserva de hoy (libera el cupo e invalida el QR).
    // Deja una marca "cancelado" para que, en el MISMO dispositivo, el QR
    // anterior quede denegado (no solo borrado).
    const cancelarReserva = (cid) => {
        const store = _load();
        store[cid] = { fecha: hoyISO(), cancelado: true };
        _save(store);
    };

    // Reserva de HOY de un socio (o null si no reservó hoy / la canceló).
    const reservaDeHoy = (cid) => {
        const r = _load()[cid];
        return (r && r.fecha === hoyISO() && !r.cancelado) ? r : null;
    };

    // Todas las reservas de una fecha: [{ clienteId, bloque, qr }].
    // Lo usan Horarios (para contar cupos) y el dashboard (reservas del día).
    const reservasDelDia = (fechaISO) => {
        const store = _load();
        const out = [];
        for (const cid of Object.keys(store)) {
            const r = store[cid];
            if (r && r.fecha === fechaISO && !r.cancelado) out.push({ clienteId: cid, bloque: r.bloque, qr: r.qr, usado: !!r.usado, generado: !!r.generado });
        }
        return out;
    };

    const parseQr = (payload) => {
        if (!payload) return null;
        const p = String(payload).trim().split('|');
        if (p.length < 7 || p[0] !== 'JAVOFIT') return null;
        return { cid: p[2], fecha: p[3], planId: p[4], token: p[5], sig: p[6] };
    };

    // Valida un QR escaneado. Marca el QR como USADO en el primer acceso válido.
    // Devuelve { ok, estado:'ACTIVO'|'DENEGADO', motivo, cliente }.
    const validar = (payload) => {
        const d = parseQr(payload);
        if (!d) return { ok: false, estado: 'DENEGADO', motivo: 'QR no reconocido', cliente: null };
        const c = _cliente(d.cid);
        if (!c) return { ok: false, estado: 'DENEGADO', motivo: 'Socio no encontrado', cliente: null };
        if (d.fecha !== hoyISO()) return { ok: false, estado: 'DENEGADO', motivo: 'QR de otro día', cliente: c };
        if (_firma(d.cid, d.fecha, d.token) !== d.sig) return { ok: false, estado: 'DENEGADO', motivo: 'QR alterado', cliente: c };

        // El plan del socio se valida siempre (también entre dispositivos distintos).
        if (!planActivo(c)) {
            const motivo = c.estado === 'Congelado' ? 'Membresía congelada' : 'Plan vencido';
            return { ok: false, estado: 'DENEGADO', motivo, cliente: c };
        }

        const store = _load();
        const r = store[d.cid];
        const mismoDia = r && r.fecha === hoyISO();

        if (mismoDia && r.cancelado) {
            return { ok: false, estado: 'DENEGADO', motivo: 'Reserva cancelada', cliente: c };
        }
        if (mismoDia && !r.cancelado) {
            // Hay estado local (mismo dispositivo): control estricto de token + uso único.
            if (r.token !== d.token) return { ok: false, estado: 'DENEGADO', motivo: 'QR cancelado o reemplazado', cliente: c };
            if (r.usado) return { ok: false, estado: 'DENEGADO', motivo: 'QR ya utilizado hoy', cliente: c };
            r.usado = true; store[d.cid] = r; _save(store);
            return { ok: true, estado: 'ACTIVO', motivo: 'Acceso permitido', cliente: c };
        }

        // No hay reserva local (QR de OTRO dispositivo, sin backend compartido):
        // se auto-valida por contenido (firma + fecha + plan). El uso único y la
        // cancelación solo se pueden garantizar con el backend real del sistema.
        return { ok: true, estado: 'ACTIVO', motivo: 'Acceso permitido', cliente: c };
    };

    // Helper para el control de acceso (demo): asegura que el socio tenga un QR
    // vigente y generado de hoy, y devuelve su texto. Si no tiene, crea la reserva
    // (usando el primer bloque activo si Horarios está disponible).
    const qrSimular = (cid) => {
        let r = reservaDeHoy(cid);
        if (!r || !r.generado) {
            const c = _cliente(cid);
            if (!c) return null;
            let bloque = null;
            try { if (typeof Horarios !== 'undefined') { const bs = Horarios.bloquesActivos(); if (bs && bs[0]) bloque = bs[0].hora; } } catch (_) { }
            reservarBloque(c, bloque);
            generarQr(cid);
            r = reservaDeHoy(cid);
        }
        return r ? r.qr : null;
    };

    return {
        hoyISO, esPlanIndefinido, planActivo,
        reservarBloque, generarQr, cancelarReserva,
        reservaDeHoy, reservasDelDia, parseQr, validar, qrSimular
    };
})();
