// ============================================================
// CAPA DE DATOS (api.js)
// ============================================================
// Aquí viven TODAS las consultas a Supabase. La idea es que el resto
// de la app (app.js) nunca toque "supabaseClient" directamente: solo
// llama a estas funciones, igual que antes llamaba a clientesData.
//
// Cada función devuelve datos ya en el mismo "formato" que usaba el
// dashboard original (camelCase, arrays anidados de pagos/medidas/prs)
// para que el resto del código cambie lo mínimo posible.
// ============================================================

const Api = {

    // ------------------------------------------------------
    // AUTENTICACIÓN
    // ------------------------------------------------------
    async login(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    async logout() {
        await supabaseClient.auth.signOut();
    },

    async getSession() {
        const { data } = await supabaseClient.auth.getSession();
        return data.session;
    },

    onAuthStateChange(callback) {
        supabaseClient.auth.onAuthStateChange((_event, session) => callback(session));
    },

    // ------------------------------------------------------
    // PLANES
    // ------------------------------------------------------
    async getPlanes() {
        const { data, error } = await supabaseClient.from('planes').select('*').order('precio');
        if (error) throw error;
        return data.map(p => ({ id: p.id, nombre: p.nombre, duracion_meses: p.duracion_meses, precio: Number(p.precio) }));
    },

    // ------------------------------------------------------
    // CLIENTES (con pagos, medidas y PRs anidados)
    // ------------------------------------------------------
    async getClientes() {
        const { data, error } = await supabaseClient
            .from('clientes')
            .select(`
                *,
                pagos ( id, fecha, concepto, monto, metodo, creado_en ),
                medidas ( * ),
                prs ( id, ejercicio, marca, fecha )
            `)
            .order('creado_en', { ascending: false });

        if (error) throw error;

        return data.map(c => this._mapCliente(c));
    },

    _mapCliente(c) {
        const ordenarDesc = (arr, campo) => [...(arr || [])].sort((a, b) => new Date(b[campo]) - new Date(a[campo]));
        return {
            id: c.id,
            nombre: c.nombre,
            apellido: c.apellido,
            correo: c.correo,
            telefono: c.telefono,
            telefonoEmergencia: c.telefono_emergencia,
            emergencia1Nombre: c.emergencia1_nombre,
            emergencia2Nombre: c.emergencia2_nombre,
            emergencia2Telefono: c.emergencia2_telefono,
            emergenciaLugar: c.emergencia_lugar,
            observaciones: c.observaciones,
            controlesAlDia: c.controles_al_dia,
            saludControlesAlDia: c.salud_controles_al_dia,
            saludEnfermedades: c.salud_enfermedades,
            saludMedicamentos: c.salud_medicamentos,
            saludAlergias: c.salud_alergias,
            saludLesiones: c.salud_lesiones,
            saludGrupo: c.salud_grupo_sanguineo,
            saludNotas: c.salud_notas,
            genero: c.genero,
            cumpleanos: c.cumpleanos,
            contratoFirma: c.contrato_firma,
            contratoFecha: c.contrato_fecha,
            contratoNombre: c.contrato_nombre,
            contratoRut: c.contrato_rut,
            registradoPor: c.registrado_por,
            planId: c.plan_id,
            racha_meses: c.racha_meses,
            vence: c.vence,
            fechaIngreso: c.fecha_ingreso,
            estado: c.estado,
            contactado: c.contactado, // "ya le hablé" para vencidos (seguimiento de renovación)
            asistioHoy: c.asistio_hoy,
            asistenciasMes: c.asistencias_mes,
            premioAsistenciaReclamado: c.premio_asistencia_reclamado,
            qrCode: c.qr_code,
            pagos: [...(c.pagos || [])].sort((a, b) =>
                (new Date(b.fecha) - new Date(a.fecha)) ||
                (new Date(b.creado_en || b.fecha) - new Date(a.creado_en || a.fecha))),
            medidasHistorial: ordenarDesc(c.medidas, 'fecha'),
            prsHistorial: ordenarDesc(c.prs, 'fecha')
        };
    },

    async crearCliente({ nombre, apellido, correo, telefono, telefonoEmergencia, cumpleanos, planId, racha_meses, vence, estado, registradoPor, genero }) {
        const { data, error } = await supabaseClient
            .from('clientes')
            .insert({
                nombre, apellido, correo, telefono,
                telefono_emergencia: telefonoEmergencia || null,
                cumpleanos,
                plan_id: planId,
                racha_meses: racha_meses || 1,
                vence,
                estado: estado || 'Al día',
                registrado_por: registradoPor || null,
                genero: genero || null
            })
            .select()
            .single();
        if (error) throw error;
        return this._mapCliente(data);
    },

    // Inserta muchos clientes de una sola vez (para importación CSV de
    // cientos de clientes). Recibe un array de objetos ya con nombres de
    // columna reales de la tabla (snake_case). Devuelve cuántos se crearon.
    async crearClientesBulk(filas) {
        if (!filas || filas.length === 0) return 0;
        // Supabase/Postgres maneja bien lotes grandes, pero para no pasarnos
        // de límites de payload dividimos en tandas de 200.
        const TANDA = 200;
        let creados = 0;
        for (let i = 0; i < filas.length; i += TANDA) {
            const lote = filas.slice(i, i + TANDA);
            const { data, error } = await supabaseClient.from('clientes').insert(lote).select('id');
            if (error) throw error;
            creados += (data ? data.length : 0);
        }
        return creados;
    },

    async actualizarCliente(id, campos) {
        // Traduce nombres camelCase -> columnas reales de la tabla
        const map = {
            planId: 'plan_id',
            asistioHoy: 'asistio_hoy',
            asistenciasMes: 'asistencias_mes',
            premioAsistenciaReclamado: 'premio_asistencia_reclamado',
            fechaIngreso: 'fecha_ingreso',
            telefonoEmergencia: 'telefono_emergencia',
            emergencia1Nombre: 'emergencia1_nombre',
            emergencia2Nombre: 'emergencia2_nombre',
            emergencia2Telefono: 'emergencia2_telefono',
            emergenciaLugar: 'emergencia_lugar',
            observaciones: 'observaciones',
            controlesAlDia: 'controles_al_dia',
            saludControlesAlDia: 'salud_controles_al_dia',
            saludEnfermedades: 'salud_enfermedades',
            saludMedicamentos: 'salud_medicamentos',
            saludAlergias: 'salud_alergias',
            saludLesiones: 'salud_lesiones',
            saludGrupo: 'salud_grupo_sanguineo',
            saludNotas: 'salud_notas',
            genero: 'genero',
            contratoFirma: 'contrato_firma',
            contratoFecha: 'contrato_fecha',
            contratoNombre: 'contrato_nombre',
            contratoRut: 'contrato_rut'
        };
        const payload = {};
        Object.entries(campos).forEach(([k, v]) => { payload[map[k] || k] = v; });

        const { error } = await supabaseClient.from('clientes').update(payload).eq('id', id);
        if (error) throw error;
    },

    async eliminarCliente(id) {
        const { error } = await supabaseClient.from('clientes').delete().eq('id', id);
        if (error) throw error;
    },

    // ------------------------------------------------------
    // PAGOS
    // ------------------------------------------------------
    async agregarPago(clienteId, { fecha, concepto, monto, metodo }) {
        const { error } = await supabaseClient.from('pagos').insert({ cliente_id: clienteId, fecha, concepto, monto, metodo });
        if (error) throw error;
    },

    async actualizarPago(pagoId, campos) {
        const { error } = await supabaseClient.from('pagos').update(campos).eq('id', pagoId);
        if (error) throw error;
    },

    async eliminarPago(pagoId) {
        const { error } = await supabaseClient.from('pagos').delete().eq('id', pagoId);
        if (error) throw error;
    },

    // ------------------------------------------------------
    // MEDIDAS
    // ------------------------------------------------------
    async agregarMedida(clienteId, medida) {
        const { error } = await supabaseClient.from('medidas').insert({ cliente_id: clienteId, ...medida });
        if (error) throw error;
    },

    async actualizarMedida(id, campos) {
        const { error } = await supabaseClient.from('medidas').update(campos).eq('id', id);
        if (error) throw error;
    },

    async eliminarMedida(id) {
        const { error } = await supabaseClient.from('medidas').delete().eq('id', id);
        if (error) throw error;
    },

    // ------------------------------------------------------
    // PRs
    // ------------------------------------------------------
    async agregarPR(clienteId, pr) {
        const { error } = await supabaseClient.from('prs').insert({ cliente_id: clienteId, ...pr });
        if (error) throw error;
    },

    async actualizarPR(id, campos) {
        const { error } = await supabaseClient.from('prs').update(campos).eq('id', id);
        if (error) throw error;
    },

    async eliminarPR(id) {
        const { error } = await supabaseClient.from('prs').delete().eq('id', id);
        if (error) throw error;
    },

    // ------------------------------------------------------
    // ASISTENCIAS
    // Cada check-in real queda como una fila (útil para el QR más
    // adelante). Además actualizamos el resumen en "clientes" para
    // que el dashboard siga siendo rápido de leer.
    // ------------------------------------------------------
    async marcarAsistenciaHoy(cliente, metodo = 'manual') {
        const hoy = new Date().toISOString().split('T')[0];
        const { error: errInsert } = await supabaseClient.from('asistencias').insert({ cliente_id: cliente.id, fecha: hoy, metodo });
        if (errInsert && errInsert.code !== '23505') throw errInsert; // 23505 = ya existía asistencia hoy, lo ignoramos

        await this.actualizarCliente(cliente.id, {
            asistioHoy: true,
            asistenciasMes: (cliente.asistenciasMes || 0) + 1
        });
    },

    async desmarcarAsistenciaHoy(cliente) {
        const hoy = new Date().toISOString().split('T')[0];
        await supabaseClient.from('asistencias').delete().eq('cliente_id', cliente.id).eq('fecha', hoy);

        await this.actualizarCliente(cliente.id, {
            asistioHoy: false,
            asistenciasMes: Math.max(0, (cliente.asistenciasMes || 0) - 1)
        });
    },

    // Usado por el futuro flujo de QR: recibe el "qr_code" único del
    // cliente (lo trae el QR escaneado) y registra su asistencia.
    async marcarAsistenciaPorQr(qrCode) {
        const { data: cliente, error } = await supabaseClient.from('clientes').select('*').eq('qr_code', qrCode).single();
        if (error || !cliente) throw new Error('QR no reconocido');
        await this.marcarAsistenciaHoy(this._mapCliente(cliente), 'qr');
        return cliente;
    },

    // ------------------------------------------------------
    // STAFF
    // ------------------------------------------------------
    async getStaff() {
        const { data, error } = await supabaseClient.from('staff').select('*').order('creado_en');
        if (error) throw error;
        return data;
    },

    async crearStaff({ nombre, rol, permisos }) {
        const { data, error } = await supabaseClient
            .from('staff')
            .insert({ nombre, rol, permisos: permisos || [] })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async actualizarStaff(id, campos) {
        const { error } = await supabaseClient.from('staff').update(campos).eq('id', id);
        if (error) throw error;
    },

    async eliminarStaff(id) {
        const { error } = await supabaseClient.from('staff').delete().eq('id', id);
        if (error) throw error;
    },

    // ------------------------------------------------------
    // ARCHIVOS (Supabase Storage, bucket "documentos")
    // ------------------------------------------------------
    // Sube un archivo y devuelve su RUTA interna + el nombre original.
    // Guardamos la ruta (no una URL pública) para poder generar enlaces
    // firmados temporales — el bucket es privado por seguridad.
    async subirArchivo(clienteId, carpeta, file) {
        // Limpia el nombre para que sea un "key" válido en Storage.
        const limpio = file.name.replace(/[^\w.\-]+/g, '_');
        const ruta = `${clienteId}/${carpeta}/${Date.now()}_${limpio}`;
        const { error } = await supabaseClient.storage.from('documentos').upload(ruta, file, { upsert: false });
        if (error) throw error;
        return { url: ruta, nombre: file.name };
    },

    // Normaliza un valor guardado en archivo_url a la RUTA dentro del bucket.
    // Acepta rutas nuevas (ya son la ruta) y URLs públicas antiguas
    // (extrae lo que va después de "/documentos/").
    _rutaDocumento(archivo) {
        if (!archivo) return null;
        const marca = '/documentos/';
        const i = archivo.indexOf(marca);
        if (i !== -1) return decodeURIComponent(archivo.slice(i + marca.length).split('?')[0]);
        return archivo;
    },

    // Genera un enlace FIRMADO temporal para ver/compartir el archivo.
    // expiresIn en segundos (1h para ver, más largo para compartir por WhatsApp).
    async urlFirmada(archivo, expiresIn = 3600) {
        const ruta = this._rutaDocumento(archivo);
        if (!ruta) return null;
        const { data, error } = await supabaseClient.storage.from('documentos').createSignedUrl(ruta, expiresIn);
        if (error) throw error;
        return data.signedUrl;
    },

    // Borra un archivo del Storage a partir de su ruta (o URL antigua).
    async eliminarArchivoStorage(archivo) {
        const ruta = this._rutaDocumento(archivo);
        if (!ruta) return;
        const { error } = await supabaseClient.storage.from('documentos').remove([ruta]);
        if (error) throw error;
    },

    // ------------------------------------------------------
    // SALUD: NUTRICIÓN + KINESIOLOGÍA (por cliente, carga bajo demanda)
    // ------------------------------------------------------
    async getSaludCliente(clienteId) {
        const [nutri, kine] = await Promise.all([
            supabaseClient.from('nutri_notas').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: false }),
            supabaseClient.from('kine_notas').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: false })
        ]);
        if (nutri.error) throw nutri.error;
        if (kine.error) throw kine.error;
        return { nutri: nutri.data, kine: kine.data };
    },

    async agregarNutri(clienteId, nota) {
        const { error } = await supabaseClient.from('nutri_notas').insert({ cliente_id: clienteId, ...nota });
        if (error) throw error;
    },
    async actualizarNutri(id, campos) {
        const { error } = await supabaseClient.from('nutri_notas').update(campos).eq('id', id);
        if (error) throw error;
    },
    async eliminarNutri(id) {
        const { error } = await supabaseClient.from('nutri_notas').delete().eq('id', id);
        if (error) throw error;
    },

    async agregarKine(clienteId, nota) {
        const { error } = await supabaseClient.from('kine_notas').insert({ cliente_id: clienteId, ...nota });
        if (error) throw error;
    },
    async actualizarKine(id, campos) {
        const { error } = await supabaseClient.from('kine_notas').update(campos).eq('id', id);
        if (error) throw error;
    },
    async eliminarKine(id) {
        const { error } = await supabaseClient.from('kine_notas').delete().eq('id', id);
        if (error) throw error;
    },

    // ------------------------------------------------------
    // EVENTOS DE RACHA (historial de rachas perdidas / reseteadas)
    // ------------------------------------------------------
    async registrarEventoRacha({ clienteId, rachaAnterior, diasAtraso, motivo }) {
        const { error } = await supabaseClient.from('racha_eventos').insert({
            cliente_id: clienteId,
            racha_anterior: rachaAnterior || 0,
            dias_atraso: (diasAtraso === null || diasAtraso === undefined) ? null : diasAtraso,
            motivo: motivo || null
        });
        if (error) throw error;
    },

    async getEventosRacha() {
        const { data, error } = await supabaseClient
            .from('racha_eventos')
            .select('*')
            .order('fecha', { ascending: false });
        if (error) throw error;
        return data;
    },

    // ------------------------------------------------------
    // EJERCICIOS Y RUTINAS (base para la futura app de clientes)
    // ------------------------------------------------------
    async getEjercicios() {
        const { data, error } = await supabaseClient.from('ejercicios').select('*').order('nombre');
        if (error) throw error;
        return data;
    },

    async getRutinasCliente(clienteId) {
        const { data, error } = await supabaseClient
            .from('rutinas')
            .select('*, rutina_ejercicios(*, ejercicios(*))')
            .eq('cliente_id', clienteId);
        if (error) throw error;
        return data;
    }
};
