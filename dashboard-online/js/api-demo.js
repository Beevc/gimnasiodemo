// ============================================================
// api-demo.js — CAPA DE DATOS SIMULADA (para la DEMO)
// ============================================================
// Reemplaza a js/api.js (Supabase) por un `Api` en memoria. Expone
// EXACTAMENTE los mismos métodos con las mismas firmas, así que
// js/app.js funciona igual, pero sin red, sin login y sin base de datos.
//
// Reglas:
//   • Las LECTURAS devuelven COPIAS (para que la app pueda manipular
//     sus datos sin corromper el estado maestro).
//   • Las ESCRITURAS mutan los arrays de js/demo-data.js → el comprador
//     ve que "funciona" (crear/editar/borrar/pagar/medir/PRs/asistencia).
//   • Al RECARGAR la página se vuelve a cargar demo-data.js → reset total.
// ============================================================

const Api = (() => {

    // Copia profunda segura (con respaldo si structuredClone no existe).
    const _copia = (x) => {
        try { return structuredClone(x); }
        catch (_) { return JSON.parse(JSON.stringify(x)); }
    };

    // Generador de IDs únicos para registros nuevos.
    let _seq = 1000;
    const _uid = (pfx) => `${pfx}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

    // Ordena pagos/medidas/PRs igual que `_mapCliente` en el api real.
    const _ordenarCliente = (c) => {
        const desc = (arr, campo) => [...(arr || [])].sort((a, b) => new Date(b[campo]) - new Date(a[campo]));
        c.pagos = [...(c.pagos || [])].sort((a, b) =>
            (new Date(b.fecha) - new Date(a.fecha)) ||
            (new Date(b.creado_en || b.fecha) - new Date(a.creado_en || a.fecha)));
        c.medidasHistorial = desc(c.medidasHistorial, 'fecha');
        c.prsHistorial = desc(c.prsHistorial, 'fecha');
        return c;
    };

    // Localiza al cliente MAESTRO (el que se muta) por id.
    const _cliente = (id) => CLIENTES_DEMO.find(c => c.id === id);

    // Busca un sub-registro (pago/medida/pr) por id en TODOS los clientes.
    // Devuelve { cliente, arr, idx } o null.
    const _buscarSub = (campo, id) => {
        for (const c of CLIENTES_DEMO) {
            const arr = c[campo] || [];
            const idx = arr.findIndex(x => x.id === id);
            if (idx !== -1) return { cliente: c, arr, idx };
        }
        return null;
    };

    // Igual que _buscarSub pero para nutri/kine dentro de SALUD_DEMO.
    const _buscarSalud = (tipo, id) => {
        for (const clienteId of Object.keys(SALUD_DEMO)) {
            const arr = SALUD_DEMO[clienteId][tipo] || [];
            const idx = arr.findIndex(x => x.id === id);
            if (idx !== -1) return { clienteId, arr, idx };
        }
        return null;
    };

    const _hoyISO = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // --- Overrides de FICHA (persisten en localStorage, cruzan portal ↔ dashboard) ---
    // Solo los campos de la ficha (datos personales/salud/emergencia) se persisten,
    // para que lo que el socio carga en el portal aparezca en el dashboard (otra página)
    // y sobreviva a la recarga. El resto del estado sigue en memoria (se resetea).
    const OVR_KEY = 'gd_socios_overrides_v1';
    const FICHA_FIELDS = new Set([
        'rut', 'nombre', 'apellido', 'correo', 'telefono', 'cumpleanos', 'genero',
        'saludControlesAlDia', 'saludEnfermedades', 'saludMedicamentos', 'saludAlergias',
        'saludLesiones', 'saludGrupo', 'saludNotas',
        'emergencia1Nombre', 'telefonoEmergencia', 'emergencia2Nombre', 'emergencia2Telefono',
        'emergenciaLugar', 'observaciones'
    ]);
    const _ovrLoad = () => { try { return JSON.parse(localStorage.getItem(OVR_KEY) || '{}'); } catch (_) { return {}; } };
    const _ovrSave = (o) => { try { localStorage.setItem(OVR_KEY, JSON.stringify(o)); } catch (_) { } };
    const _ovrMerge = (id, campos) => {
        const soloFicha = {};
        Object.keys(campos).forEach(k => { if (FICHA_FIELDS.has(k)) soloFicha[k] = campos[k]; });
        if (!Object.keys(soloFicha).length) return;
        const store = _ovrLoad();
        store[id] = Object.assign(store[id] || {}, soloFicha);
        _ovrSave(store);
    };

    return {

        // ------------------------------------------------------
        // AUTENTICACIÓN (simulada: la demo entra directo)
        // ------------------------------------------------------
        async login(_email, _password) {
            // Acepta cualquier credencial (o ninguna).
            return { user: { email: 'demo@gimnasiodemo.cl' } };
        },

        async logout() {
            location.reload();
        },

        async getSession() {
            // Devolver una sesión hace que app.js salte el login y muestre la app.
            return { user: { id: 'demo-user', email: 'demo@gimnasiodemo.cl' } };
        },

        onAuthStateChange(_callback) {
            // No aplica en la demo (no hay cambios de sesión). No-op.
        },

        // ------------------------------------------------------
        // PLANES
        // ------------------------------------------------------
        async getPlanes() {
            return _copia(PLANES).sort((a, b) => a.precio - b.precio);
        },

        // ------------------------------------------------------
        // CLIENTES
        // ------------------------------------------------------
        async getClientes() {
            // Copia profunda + mismo orden que el api real, aplicando los overrides
            // de ficha guardados (para que los datos que el socio cargó aparezcan).
            const ovr = _ovrLoad();
            return _copia(CLIENTES_DEMO).map(_ordenarCliente).map(c => {
                if (ovr[c.id]) Object.assign(c, ovr[c.id]);
                return c;
            });
        },

        async crearCliente({ nombre, apellido, correo, telefono, telefonoEmergencia, cumpleanos, planId, racha_meses, vence, estado, registradoPor, genero }) {
            const nuevo = {
                id: _uid('c'),
                nombre, apellido,
                correo: correo || null,
                telefono: telefono || null,
                telefonoEmergencia: telefonoEmergencia || null,
                emergencia1Nombre: null, emergencia2Nombre: null, emergencia2Telefono: null,
                emergenciaLugar: null, observaciones: null,
                controlesAlDia: false, saludControlesAlDia: false,
                saludEnfermedades: null, saludMedicamentos: null, saludAlergias: null,
                saludLesiones: null, saludGrupo: null, saludNotas: null,
                genero: genero || null,
                cumpleanos: cumpleanos || null,
                contratoFirma: null, contratoFecha: null, contratoNombre: null, contratoRut: null,
                registradoPor: registradoPor || null,
                planId: planId || null,
                racha_meses: racha_meses || 1,
                vence: vence || null,
                fechaIngreso: _hoyISO(),
                estado: estado || 'Al día',
                contactado: false,
                asistioHoy: false, asistenciasMes: 0, premioAsistenciaReclamado: false,
                qrCode: _uid('qr'),
                pagos: [], medidasHistorial: [], prsHistorial: []
            };
            CLIENTES_DEMO.unshift(nuevo); // al inicio (el api real ordena por creado_en desc)
            return _copia(nuevo);
        },

        async crearClientesBulk(filas) {
            if (!filas || filas.length === 0) return 0;
            let creados = 0;
            for (const f of filas) {
                await this.crearCliente({
                    nombre: f.nombre,
                    apellido: f.apellido,
                    correo: f.correo,
                    telefono: f.telefono,
                    cumpleanos: f.cumpleanos,
                    planId: f.plan_id,       // el CSV usa snake_case
                    racha_meses: f.racha_meses,
                    vence: f.vence,
                    estado: f.estado
                });
                creados++;
            }
            return creados;
        },

        async actualizarCliente(id, campos) {
            const c = _cliente(id);
            if (!c) return;
            // La app envía las MISMAS claves camelCase del objeto cliente,
            // así que se asignan directo (sin traducción snake_case).
            Object.assign(c, campos);
            // Los campos de ficha se persisten para que crucen portal ↔ dashboard.
            _ovrMerge(id, campos);
        },

        async eliminarCliente(id) {
            const i = CLIENTES_DEMO.findIndex(c => c.id === id);
            if (i !== -1) CLIENTES_DEMO.splice(i, 1);
            // También limpiamos su salud asociada (si tenía).
            delete SALUD_DEMO[id];
        },

        // ------------------------------------------------------
        // PAGOS
        // ------------------------------------------------------
        async agregarPago(clienteId, { fecha, concepto, monto, metodo }) {
            const c = _cliente(clienteId);
            if (!c) return;
            (c.pagos = c.pagos || []).push({
                id: _uid('pg'), fecha, concepto,
                monto: Number(monto), metodo,
                creado_en: new Date().toISOString()
            });
        },

        async actualizarPago(pagoId, campos) {
            const hit = _buscarSub('pagos', pagoId);
            if (!hit) return;
            const pago = hit.arr[hit.idx];
            Object.assign(pago, campos);
            if (campos.monto !== undefined) pago.monto = Number(campos.monto);
        },

        async eliminarPago(pagoId) {
            const hit = _buscarSub('pagos', pagoId);
            if (hit) hit.arr.splice(hit.idx, 1);
        },

        // ------------------------------------------------------
        // EGRESOS / GASTOS (caja del gimnasio)
        // ------------------------------------------------------
        async getEgresos() {
            const arr = (typeof EGRESOS_DEMO !== 'undefined') ? EGRESOS_DEMO : [];
            return _copia(arr).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        },

        async agregarEgreso({ fecha, categoria, descripcion, monto, metodo }) {
            if (typeof EGRESOS_DEMO === 'undefined') return null;
            const nuevo = {
                id: _uid('eg'), fecha, categoria: categoria || 'Otros',
                descripcion: descripcion || '', monto: Number(monto) || 0,
                metodo: metodo || 'Efectivo', creado_en: new Date().toISOString()
            };
            EGRESOS_DEMO.push(nuevo);
            return _copia(nuevo);
        },

        async actualizarEgreso(id, campos) {
            if (typeof EGRESOS_DEMO === 'undefined') return;
            const e = EGRESOS_DEMO.find(x => x.id === id);
            if (e) {
                Object.assign(e, campos);
                if (campos.monto !== undefined) e.monto = Number(campos.monto) || 0;
            }
        },

        async eliminarEgreso(id) {
            if (typeof EGRESOS_DEMO === 'undefined') return;
            const i = EGRESOS_DEMO.findIndex(x => x.id === id);
            if (i !== -1) EGRESOS_DEMO.splice(i, 1);
        },

        // ------------------------------------------------------
        // MEDIDAS
        // ------------------------------------------------------
        async agregarMedida(clienteId, medida) {
            const c = _cliente(clienteId);
            if (!c) return;
            (c.medidasHistorial = c.medidasHistorial || []).push(Object.assign({
                id: _uid('md'), cliente_id: clienteId, creado_en: new Date().toISOString()
            }, medida));
        },

        async actualizarMedida(id, campos) {
            const hit = _buscarSub('medidasHistorial', id);
            if (hit) Object.assign(hit.arr[hit.idx], campos);
        },

        async eliminarMedida(id) {
            const hit = _buscarSub('medidasHistorial', id);
            if (hit) hit.arr.splice(hit.idx, 1);
        },

        // ------------------------------------------------------
        // PRs
        // ------------------------------------------------------
        async agregarPR(clienteId, pr) {
            const c = _cliente(clienteId);
            if (!c) return;
            (c.prsHistorial = c.prsHistorial || []).push(Object.assign({
                id: _uid('pr'), cliente_id: clienteId, creado_en: new Date().toISOString()
            }, pr));
        },

        async actualizarPR(id, campos) {
            const hit = _buscarSub('prsHistorial', id);
            if (hit) Object.assign(hit.arr[hit.idx], campos);
        },

        async eliminarPR(id) {
            const hit = _buscarSub('prsHistorial', id);
            if (hit) hit.arr.splice(hit.idx, 1);
        },

        // ------------------------------------------------------
        // ASISTENCIAS (actualizan el resumen en el cliente)
        // ------------------------------------------------------
        async marcarAsistenciaHoy(cliente, _metodo = 'manual') {
            const c = _cliente(cliente.id);
            if (!c) return;
            c.asistioHoy = true;
            c.asistenciasMes = (cliente.asistenciasMes || 0) + 1;
        },

        async desmarcarAsistenciaHoy(cliente) {
            const c = _cliente(cliente.id);
            if (!c) return;
            c.asistioHoy = false;
            c.asistenciasMes = Math.max(0, (cliente.asistenciasMes || 0) - 1);
        },

        async marcarAsistenciaPorQr(qrCode) {
            const c = _cliente ? CLIENTES_DEMO.find(x => x.qrCode === qrCode) : null;
            if (!c) throw new Error('QR no reconocido');
            await this.marcarAsistenciaHoy(c, 'qr');
            return _copia(c);
        },

        // ------------------------------------------------------
        // STAFF
        // ------------------------------------------------------
        async getStaff() {
            return _copia(STAFF_DEMO);
        },

        async crearStaff({ nombre, rol, permisos }) {
            const nuevo = { id: _uid('st'), auth_user_id: null, nombre, rol, permisos: permisos || [], creado_en: new Date().toISOString() };
            STAFF_DEMO.push(nuevo);
            return _copia(nuevo);
        },

        async actualizarStaff(id, campos) {
            const s = STAFF_DEMO.find(x => x.id === id);
            if (s) Object.assign(s, campos);
        },

        async eliminarStaff(id) {
            const i = STAFF_DEMO.findIndex(x => x.id === id);
            if (i !== -1) STAFF_DEMO.splice(i, 1);
        },

        // ------------------------------------------------------
        // ARCHIVOS (simulados: guardamos solo el nombre, sin storage real)
        // ------------------------------------------------------
        async subirArchivo(_clienteId, _carpeta, file) {
            // No hay red: devolvemos una "ruta" ficticia y el nombre real.
            return { url: `demo/${Date.now()}_${file.name}`, nombre: file.name };
        },

        async urlFirmada(_archivo, _expiresIn = 3600) {
            // No hay archivo real que servir; devolvemos un placeholder inofensivo.
            return '#';
        },

        async eliminarArchivoStorage(_archivo) {
            // No-op en la demo.
        },

        // ------------------------------------------------------
        // SALUD: NUTRICIÓN + KINESIOLOGÍA
        // ------------------------------------------------------
        async getSaludCliente(clienteId) {
            const s = SALUD_DEMO[clienteId] || { nutri: [], kine: [] };
            const desc = (arr) => [...(arr || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            return { nutri: desc(_copia(s.nutri)), kine: desc(_copia(s.kine)) };
        },

        _asegurarSalud(clienteId) {
            if (!SALUD_DEMO[clienteId]) SALUD_DEMO[clienteId] = { nutri: [], kine: [] };
            return SALUD_DEMO[clienteId];
        },

        async agregarNutri(clienteId, nota) {
            this._asegurarSalud(clienteId).nutri.push(Object.assign({ id: _uid('nu'), cliente_id: clienteId, archivo_url: null }, nota));
        },
        async actualizarNutri(id, campos) {
            const hit = _buscarSalud('nutri', id);
            if (hit) Object.assign(hit.arr[hit.idx], campos);
        },
        async eliminarNutri(id) {
            const hit = _buscarSalud('nutri', id);
            if (hit) hit.arr.splice(hit.idx, 1);
        },

        async agregarKine(clienteId, nota) {
            this._asegurarSalud(clienteId).kine.push(Object.assign({ id: _uid('ki'), cliente_id: clienteId, archivo_url: null }, nota));
        },
        async actualizarKine(id, campos) {
            const hit = _buscarSalud('kine', id);
            if (hit) Object.assign(hit.arr[hit.idx], campos);
        },
        async eliminarKine(id) {
            const hit = _buscarSalud('kine', id);
            if (hit) hit.arr.splice(hit.idx, 1);
        },

        // ------------------------------------------------------
        // EVENTOS DE RACHA
        // ------------------------------------------------------
        async registrarEventoRacha({ clienteId, rachaAnterior, diasAtraso, motivo }) {
            EVENTOS_RACHA_DEMO.unshift({
                id: _uid('re'),
                cliente_id: clienteId,
                fecha: _hoyISO(),
                racha_anterior: rachaAnterior || 0,
                dias_atraso: (diasAtraso === null || diasAtraso === undefined) ? null : diasAtraso,
                motivo: motivo || null,
                creado_en: new Date().toISOString()
            });
        },

        async getEventosRacha() {
            return _copia(EVENTOS_RACHA_DEMO).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        },

        // ------------------------------------------------------
        // EJERCICIOS Y RUTINAS (no usados aún en el dashboard; vacíos)
        // ------------------------------------------------------
        async getEjercicios() { return []; },
        async getRutinasCliente(_clienteId) { return []; }
    };
})();
