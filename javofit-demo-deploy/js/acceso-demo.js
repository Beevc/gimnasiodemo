// ============================================================
// acceso-demo.js — QR del día + validación de acceso (DEMO)
// ============================================================
// Módulo compartido por:
//   • portal.html   -> EMITE el QR del día cuando el socio reserva.
//   • (próximamente) control de acceso -> VALIDA el QR (verde/rojo).
//
// Regla del negocio:
//   • 1 QR por día por socio. El QR codifica socio + fecha + plan + firma.
//   • El acceso es ACTIVO si: el QR es de HOY, la firma coincide y el
//     plan del socio está vigente (no Vencido ni Congelado, y sin vencer).
//
// Persistencia: usa localStorage (mismo origen) para que el QR emitido en
// el portal pueda cruzarse con el control de acceso. Es una DEMO: si no hay
// localStorage, igual funciona porque el QR se auto-valida por su contenido.
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

    // Firma simple determinística (solo demo, no es seguridad real).
    const _firma = (cid, fecha) => {
        let h = 0;
        const s = `${cid}|${fecha}|javofit-demo`;
        for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
        return (h >>> 0).toString(36);
    };

    // Emite (o recupera) el QR del día para un socio. Devuelve la reserva:
    // { fecha, bloque, qr }. Si ya reservó hoy, mantiene el MISMO QR.
    const emitirQrDia = (cliente, bloque) => {
        const fecha = hoyISO();
        const store = _load();
        const previa = store[cliente.id];
        if (previa && previa.fecha === fecha) {
            if (bloque) previa.bloque = bloque;   // puede cambiar el bloque, el QR del día es el mismo
            store[cliente.id] = previa;
        } else {
            const sig = _firma(cliente.id, fecha);
            store[cliente.id] = {
                fecha,
                bloque: bloque || null,
                qr: `JAVOFIT|v1|${cliente.id}|${fecha}|${cliente.planId}|${sig}`
            };
        }
        _save(store);
        return store[cliente.id];
    };

    // Reserva de HOY de un socio (o null si no reservó hoy).
    const reservaDeHoy = (cid) => {
        const r = _load()[cid];
        return (r && r.fecha === hoyISO()) ? r : null;
    };

    // Todas las reservas de una fecha: [{ clienteId, bloque, qr }].
    // Lo usan Horarios (para contar cupos) y el dashboard (reservas del día).
    const reservasDelDia = (fechaISO) => {
        const store = _load();
        const out = [];
        for (const cid of Object.keys(store)) {
            const r = store[cid];
            if (r && r.fecha === fechaISO) out.push({ clienteId: cid, bloque: r.bloque, qr: r.qr });
        }
        return out;
    };

    const parseQr = (payload) => {
        if (!payload) return null;
        const p = String(payload).trim().split('|');
        if (p.length < 6 || p[0] !== 'JAVOFIT') return null;
        return { cid: p[2], fecha: p[3], planId: p[4], sig: p[5] };
    };

    // Valida un QR escaneado. Devuelve:
    // { ok, estado:'ACTIVO'|'DENEGADO', motivo, cliente }
    const validar = (payload) => {
        const d = parseQr(payload);
        if (!d) return { ok: false, estado: 'DENEGADO', motivo: 'QR no reconocido', cliente: null };
        const c = _cliente(d.cid);
        if (!c) return { ok: false, estado: 'DENEGADO', motivo: 'Socio no encontrado', cliente: null };
        if (d.fecha !== hoyISO()) return { ok: false, estado: 'DENEGADO', motivo: 'QR de otro día', cliente: c };
        if (_firma(d.cid, d.fecha) !== d.sig) return { ok: false, estado: 'DENEGADO', motivo: 'QR alterado', cliente: c };
        if (!planActivo(c)) {
            const motivo = c.estado === 'Congelado' ? 'Membresía congelada' : 'Plan vencido';
            return { ok: false, estado: 'DENEGADO', motivo, cliente: c };
        }
        return { ok: true, estado: 'ACTIVO', motivo: 'Acceso permitido', cliente: c };
    };

    return { hoyISO, esPlanIndefinido, planActivo, emitirQrDia, reservaDeHoy, reservasDelDia, parseQr, validar };
})();
