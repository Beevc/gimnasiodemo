// ============================================================
// demo-data.js — DATOS FICTICIOS para la DEMO de venta
// ============================================================
// Este archivo REEMPLAZA a la base de datos real (Supabase) en la demo.
// Todos los datos viven en memoria: el comprador puede tocar todo
// (crear, editar, borrar, marcar asistencia, pagos, medidas, PRs...) y
// al RECARGAR la página vuelve al estado inicial de este archivo.
//
// La forma de cada cliente es IDÉNTICA a la que devuelve `_mapCliente`
// en js/api.js (camelCase, con pagos[], medidasHistorial[], prsHistorial[]),
// así que app.js funciona igual sin tocar una sola línea.
//
// Fecha de referencia de la demo: 2026-09-17 (para que "por vencer",
// cumpleaños y aniversarios caigan cerca de "hoy").
// ============================================================

// ------------------------------------------------------------
// Helpers de fecha (locales, sin desfase de zona horaria)
// ------------------------------------------------------------
const _HOY_DEMO = new Date(2026, 8, 17, 12, 0, 0); // 2026-09-17

function _fmtFecha(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
}
// +/- días respecto a hoy
function _dias(n) { const d = new Date(_HOY_DEMO); d.setDate(d.getDate() + n); return _fmtFecha(d); }
// +/- meses respecto a hoy (opcional: fijar el día del mes)
function _meses(n, dia) { const d = new Date(_HOY_DEMO); d.setMonth(d.getMonth() + n); if (dia) d.setDate(dia); return _fmtFecha(d); }
// timestamp ISO para creado_en a partir de una fecha 'YYYY-MM-DD'
function _ts(fecha, hora = '10:30:00') { return `${fecha}T${hora}Z`; }
// fecha fija de cumpleaños/aniversario (año arbitrario, mes/día que importan)
function _fecha(y, m, d) { return _fmtFecha(new Date(y, m - 1, d, 12, 0, 0)); }

// ------------------------------------------------------------
// PLANES (copiados de schema.sql — incluye 'coach' indefinido)
// ------------------------------------------------------------
const PLANES = [
    { id: 'beta',       nombre: 'Beta Tester (1m)',   duracion_meses: 1,    precio: 15000 },
    { id: '3d_1m',      nombre: '3 Días (1m)',        duracion_meses: 1,    precio: 20000 },
    { id: '5d_1m',      nombre: '5 Días (1m)',        duracion_meses: 1,    precio: 25000 },
    { id: '5d_3m',      nombre: '5 Días (3m)',        duracion_meses: 3,    precio: 70000 },
    { id: '5d_6m',      nombre: '5 Días (6m)',        duracion_meses: 6,    precio: 130000 },
    { id: '5d_12m',     nombre: '5 Días (12m)',       duracion_meses: 12,   precio: 240000 },
    { id: '5d_1m_ant',  nombre: '5 Días (1m) Antiguo', duracion_meses: 1,   precio: 20000 },
    { id: '5d_3m_ant',  nombre: '5 Días (3m) Antiguo', duracion_meses: 3,   precio: 55000 },
    { id: 'coach',      nombre: 'Coach',              duracion_meses: 1200, precio: 0 }
];

// ------------------------------------------------------------
// STAFF (personal con acceso al dashboard)
// ------------------------------------------------------------
const STAFF_DEMO = [
    { id: 'st1', auth_user_id: null, nombre: 'Javier (Dueño)', rol: 'Administrador', permisos: ['clientes', 'finanzas', 'staff', 'tv'], creado_en: _ts(_meses(-8, 1)) },
    { id: 'st2', auth_user_id: null, nombre: 'Paula Guzmán',   rol: 'Entrenadora',   permisos: ['clientes', 'tv'],                     creado_en: _ts(_meses(-5, 1)) },
    { id: 'st3', auth_user_id: null, nombre: 'Nicolás Rivas',  rol: 'Entrenador',    permisos: ['clientes'],                            creado_en: _ts(_meses(-2, 1)) }
];

// ------------------------------------------------------------
// EVENTOS DE RACHA (historial de rachas perdidas / reseteadas)
// ------------------------------------------------------------
const EVENTOS_RACHA_DEMO = [
    { id: 're1', cliente_id: 'c7', fecha: _meses(-1, 12), racha_anterior: 3, dias_atraso: 8,  motivo: 'Atraso en pago',  creado_en: _ts(_meses(-1, 12)) },
    { id: 're2', cliente_id: 'c8', fecha: _meses(-2, 5),  racha_anterior: 6, dias_atraso: 15, motivo: 'Atraso en pago',  creado_en: _ts(_meses(-2, 5)) },
    { id: 're3', cliente_id: 'c5', fecha: _meses(-3, 20), racha_anterior: 4, dias_atraso: null, motivo: 'Reset manual',  creado_en: _ts(_meses(-3, 20)) }
];

// ------------------------------------------------------------
// SALUD por cliente (nutrición + kinesiología) — carga bajo demanda
// key = id del cliente. Estructura idéntica a getSaludCliente().
// ------------------------------------------------------------
const SALUD_DEMO = {
    c1: {
        nutri: [
            { id: 'nu1', cliente_id: 'c1', fecha: _meses(-2, 5), objetivo: 'Ganar masa', peso_meta: 82, notas: 'Sumar 200g proteína/día', proximo_control: _meses(1, 5), archivo_url: null },
            { id: 'nu2', cliente_id: 'c1', fecha: _meses(0, 3),  objetivo: 'Ganar masa', peso_meta: 84, notas: 'Mantener superávit leve', proximo_control: _meses(1, 3), archivo_url: null }
        ],
        kine: [
            { id: 'ki1', cliente_id: 'c1', fecha: _meses(-1, 10), zona: 'Hombro derecho', estado: 'Precaución', indicaciones: 'Evitar press militar 2 semanas', proximo_control: _meses(0, 12), archivo_url: null }
        ]
    },
    c2: {
        nutri: [
            { id: 'nu3', cliente_id: 'c2', fecha: _meses(-1, 8), objetivo: 'Bajar grasa', peso_meta: 60, notas: 'Déficit 300 kcal', proximo_control: _meses(1, 8), archivo_url: null }
        ],
        kine: []
    },
    c8: {
        nutri: [],
        kine: [
            { id: 'ki2', cliente_id: 'c8', fecha: _meses(-2, 2), zona: 'Rodilla izquierda', estado: 'No apto', indicaciones: 'Suspender sentadilla profunda', proximo_control: _meses(-1, 2), archivo_url: null }
        ]
    }
};

// ------------------------------------------------------------
// CLIENTES
// ------------------------------------------------------------
// `_cli` completa TODOS los campos que espera app.js con valores por
// defecto, para que cada cliente se escriba corto pero con la forma
// exacta de `_mapCliente`.
function _cli(o) {
    return Object.assign({
        id: null,
        nombre: '', apellido: '', correo: null, telefono: null,
        telefonoEmergencia: null, emergencia1Nombre: null, emergencia2Nombre: null,
        emergencia2Telefono: null, emergenciaLugar: null, observaciones: null,
        controlesAlDia: false, saludControlesAlDia: false,
        saludEnfermedades: null, saludMedicamentos: null, saludAlergias: null,
        saludLesiones: null, saludGrupo: null, saludNotas: null,
        genero: null, cumpleanos: null,
        contratoFirma: null, contratoFecha: null, contratoNombre: null, contratoRut: null,
        registradoPor: 'Javier (Dueño)',
        planId: '5d_1m', racha_meses: 1, vence: _meses(1, 1),
        fechaIngreso: _meses(-3, 1), estado: 'Al día', contactado: false,
        asistioHoy: false, asistenciasMes: 0, premioAsistenciaReclamado: false,
        qrCode: null,
        pagos: [], medidasHistorial: [], prsHistorial: []
    }, o);
}

// Atajos para armar sub-registros
function _pago(cid, i, fecha, concepto, monto, metodo) {
    return { id: `${cid}-pg${i}`, fecha, concepto, monto, metodo, creado_en: _ts(fecha) };
}
function _med(cid, i, fecha, m) {
    return Object.assign({
        id: `${cid}-md${i}`, cliente_id: cid, fecha,
        peso: null, pectoral: null, brazo: null, brazo_izq: null, brazo_der: null,
        cintura: null, cadera: null, piernas: null, pierna_izq: null, pierna_der: null,
        gluteos: null, creado_en: _ts(fecha)
    }, m);
}
function _pr(cid, i, ejercicio, marca, fecha) {
    return { id: `${cid}-pr${i}`, cliente_id: cid, ejercicio, marca, fecha, creado_en: _ts(fecha) };
}

const CLIENTES_DEMO = [

    // 1) M · 5d_12m · Al día · racha alta · expediente completo (medidas 3, salud, PRs) · cumple cerca
    _cli({
        id: 'c1', nombre: 'Matías', apellido: 'Fuentes', correo: 'matias.fuentes@gmail.com',
        telefono: '+56 9 5511 2233', telefonoEmergencia: '+56 9 6000 1111', emergencia1Nombre: 'Rosa Fuentes',
        genero: 'M', cumpleanos: _fecha(1993, 9, 23), planId: '5d_12m', racha_meses: 12,
        vence: _meses(6, 10), fechaIngreso: _meses(-9, 25), estado: 'Al día',
        asistioHoy: true, asistenciasMes: 18, saludControlesAlDia: true,
        saludGrupo: 'O+', saludLesiones: 'Molestia hombro derecho (2025)', observaciones: 'Objetivo: hipertrofia.',
        contratoNombre: 'Matías Fuentes', contratoRut: '18.222.333-4', contratoFecha: _meses(-9, 25),
        pagos: [
            _pago('c1', 1, _meses(-9, 25), 'Plan 5 Días (12m)', 240000, 'Transferencia'),
            _pago('c1', 2, _meses(-2, 4),  'Suplementos',       28000,  'Débito'),
            _pago('c1', 3, _meses(0, 3),   'Personalizado extra', 20000, 'Efectivo')
        ],
        medidasHistorial: [
            _med('c1', 1, _meses(-6, 5),  { peso: 78, pectoral: 100, brazo_izq: 36, brazo_der: 36.5, cintura: 84, cadera: 96, pierna_izq: 56, pierna_der: 56, gluteos: 98 }),
            _med('c1', 2, _meses(-3, 5),  { peso: 80, pectoral: 103, brazo_izq: 37, brazo_der: 37.5, cintura: 83, cadera: 97, pierna_izq: 58, pierna_der: 58, gluteos: 99 }),
            _med('c1', 3, _meses(0, 6),   { peso: 82, pectoral: 105, brazo_izq: 38, brazo_der: 38.5, cintura: 82, cadera: 98, pierna_izq: 60, pierna_der: 60, gluteos: 100 })
        ],
        prsHistorial: [
            _pr('c1', 1, 'Press Banca', 100, _meses(-1, 12)),
            _pr('c1', 2, 'Sentadilla', 140, _meses(-1, 12)),
            _pr('c1', 3, 'Hip Thrust', 130, _meses(-2, 8)),
            _pr('c1', 4, 'Bíceps', 38, _meses(-2, 8)),
            _pr('c1', 5, 'Dominadas', 15, _meses(0, 2)),
            _pr('c1', 6, 'Flexiones', 40, _meses(-3, 10))
        ]
    }),

    // 2) F · 5d_6m · Al día · medidas 3 · PRs · nutri
    _cli({
        id: 'c2', nombre: 'Valentina', apellido: 'Rojas', correo: 'vale.rojas@gmail.com',
        telefono: '+56 9 4422 3344', telefonoEmergencia: '+56 9 6000 2222', emergencia1Nombre: 'Luis Rojas',
        genero: 'F', cumpleanos: _fecha(1996, 11, 3), planId: '5d_6m', racha_meses: 8,
        vence: _meses(2, 14), fechaIngreso: _meses(-8, 14), estado: 'Al día',
        asistioHoy: true, asistenciasMes: 16, saludControlesAlDia: true, saludGrupo: 'A+',
        pagos: [
            _pago('c2', 1, _meses(-8, 14), 'Plan 5 Días (6m)', 130000, 'Crédito'),
            _pago('c2', 2, _meses(-2, 14), 'Renovación 5 Días (6m)', 130000, 'Transferencia')
        ],
        medidasHistorial: [
            _med('c2', 1, _meses(-6, 2),  { peso: 64, cintura: 72, cadera: 98, gluteos: 96, pierna_izq: 54, pierna_der: 54 }),
            _med('c2', 2, _meses(-3, 2),  { peso: 62, cintura: 70, cadera: 99, gluteos: 98, pierna_izq: 55, pierna_der: 55 }),
            _med('c2', 3, _meses(0, 4),   { peso: 61, cintura: 68, cadera: 100, gluteos: 100, pierna_izq: 56, pierna_der: 56 })
        ],
        prsHistorial: [
            _pr('c2', 1, 'Hip Thrust', 120, _meses(-1, 5)),
            _pr('c2', 2, 'Sentadilla', 90, _meses(-1, 5)),
            _pr('c2', 3, 'Press Banca', 45, _meses(-2, 9)),
            _pr('c2', 4, 'Fondos', 10, _meses(-2, 9)),
            _pr('c2', 5, 'Dominadas', 8, _meses(0, 1))
        ]
    }),

    // 3) M · 5d_3m · Al día · racha 5 (descuento $5.000) · PRs
    _cli({
        id: 'c3', nombre: 'Benjamín', apellido: 'Soto', correo: 'benja.soto@hotmail.com',
        telefono: '+56 9 3311 4455', genero: 'M', cumpleanos: _fecha(1999, 2, 18),
        planId: '5d_3m', racha_meses: 5, vence: _meses(1, 20), fechaIngreso: _meses(-5, 20),
        estado: 'Al día', asistioHoy: false, asistenciasMes: 12,
        pagos: [
            _pago('c3', 1, _meses(-5, 20), 'Plan 5 Días (3m)', 70000, 'Efectivo'),
            _pago('c3', 2, _meses(-2, 20), 'Renovación 5 Días (3m)', 70000, 'Efectivo')
        ],
        prsHistorial: [
            _pr('c3', 1, 'Press Banca', 90, _meses(-1, 3)),
            _pr('c3', 2, 'Fondos', 25, _meses(-1, 3)),
            _pr('c3', 3, 'Flexiones', 48, _meses(-2, 15))
        ]
    }),

    // 4) F · 5d_1m · Al día · POR VENCER (7 días) · medidas 2 · PRs (flexiones F)
    _cli({
        id: 'c4', nombre: 'Antonia', apellido: 'Muñoz', correo: 'antonia.munoz@gmail.com',
        telefono: '+56 9 2211 5566', genero: 'F', cumpleanos: _fecha(2000, 5, 30),
        planId: '5d_1m', racha_meses: 3, vence: _dias(7), fechaIngreso: _meses(-3, 10),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 14,
        pagos: [
            _pago('c4', 1, _meses(-3, 10), 'Plan 5 Días (1m)', 25000, 'Débito'),
            _pago('c4', 2, _meses(-2, 10), 'Renovación 5 Días (1m)', 25000, 'Débito'),
            _pago('c4', 3, _meses(-1, 10), 'Renovación 5 Días (1m)', 25000, 'Transferencia')
        ],
        medidasHistorial: [
            _med('c4', 1, _meses(-2, 10), { peso: 58, cintura: 66, cadera: 94, gluteos: 92 }),
            _med('c4', 2, _meses(0, 5),   { peso: 57, cintura: 65, cadera: 95, gluteos: 94 })
        ],
        prsHistorial: [
            _pr('c4', 1, 'Flexiones', 30, _meses(-1, 8)),
            _pr('c4', 2, 'Hip Thrust', 80, _meses(-1, 8))
        ]
    }),

    // 5) M · 5d_1m · PENDIENTE · racha 2
    _cli({
        id: 'c5', nombre: 'Diego', apellido: 'Contreras', correo: 'diego.contreras@gmail.com',
        telefono: '+56 9 1122 6677', genero: 'M', cumpleanos: _fecha(1994, 12, 8),
        planId: '5d_1m', racha_meses: 2, vence: _dias(9), fechaIngreso: _meses(-4, 2),
        estado: 'Pendiente', asistioHoy: false, asistenciasMes: 6,
        observaciones: 'Pago del mes conversado, queda pendiente de confirmar.',
        pagos: [
            _pago('c5', 1, _meses(-4, 2), 'Plan 5 Días (1m)', 25000, 'Efectivo'),
            _pago('c5', 2, _meses(-2, 2), 'Renovación 5 Días (1m)', 25000, 'Efectivo')
        ]
    }),

    // 6) F · 3d_1m · Al día · SIN TELÉFONO (chip + Grupo WhatsApp) · PRs (flexiones F)
    _cli({
        id: 'c6', nombre: 'Josefa', apellido: 'Silva', correo: 'josefa.silva@gmail.com',
        telefono: null, genero: 'F', cumpleanos: _fecha(1998, 7, 12),
        planId: '3d_1m', racha_meses: 4, vence: _meses(1, 6), fechaIngreso: _meses(-4, 6),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 9,
        pagos: [
            _pago('c6', 1, _meses(-4, 6), 'Plan 3 Días (1m)', 20000, 'Transferencia'),
            _pago('c6', 2, _meses(-1, 6), 'Renovación 3 Días (1m)', 20000, 'Transferencia')
        ],
        prsHistorial: [
            _pr('c6', 1, 'Flexiones', 25, _meses(-1, 6))
        ]
    }),

    // 7) M · 5d_3m · VENCIDO · NO contactado · cumple cerca de hoy
    _cli({
        id: 'c7', nombre: 'Tomás', apellido: 'Vera', correo: 'tomas.vera@gmail.com',
        telefono: '+56 9 7788 1122', genero: 'M', cumpleanos: _fecha(1991, 9, 20),
        planId: '5d_3m', racha_meses: 3, vence: _dias(-12), fechaIngreso: _meses(-7, 5),
        estado: 'Vencido', contactado: false, asistioHoy: false, asistenciasMes: 2,
        pagos: [
            _pago('c7', 1, _meses(-7, 5), 'Plan 5 Días (3m)', 70000, 'Débito'),
            _pago('c7', 2, _meses(-4, 5), 'Renovación 5 Días (3m)', 70000, 'Débito')
        ],
        prsHistorial: [
            _pr('c7', 1, 'Press Banca', 85, _meses(-4, 10))
        ]
    }),

    // 8) F · 5d_1m · VENCIDO · SÍ contactado · kine (no apto)
    _cli({
        id: 'c8', nombre: 'Catalina', apellido: 'Morales', correo: 'cata.morales@gmail.com',
        telefono: '+56 9 8899 2233', genero: 'F', cumpleanos: _fecha(1997, 4, 2),
        planId: '5d_1m', racha_meses: 1, vence: _dias(-20), fechaIngreso: _meses(-6, 15),
        estado: 'Vencido', contactado: true, asistioHoy: false, asistenciasMes: 0,
        saludLesiones: 'Lesión rodilla izquierda', observaciones: 'Ya se le habló para renovar.',
        pagos: [
            _pago('c8', 1, _meses(-6, 15), 'Plan 5 Días (1m)', 25000, 'Crédito')
        ]
    }),

    // 9) M · COACH · plan indefinido (no vence) · racha 20 (GRATIS) · PRs top
    _cli({
        id: 'c9', nombre: 'Javier', apellido: 'Herrera', correo: 'coach.javier@gimnasiodemo.cl',
        telefono: '+56 9 9900 3344', genero: 'M', cumpleanos: _fecha(1988, 6, 5),
        planId: 'coach', racha_meses: 20, vence: _dias(-30), fechaIngreso: _meses(-14, 1),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 22, saludControlesAlDia: true,
        observaciones: 'Entrenador — plan Coach (indefinido, participa en PRs de TV).',
        prsHistorial: [
            _pr('c9', 1, 'Press Banca', 120, _meses(-2, 1)),
            _pr('c9', 2, 'Sentadilla', 160, _meses(-2, 1)),
            _pr('c9', 3, 'Hip Thrust', 150, _meses(-3, 1)),
            _pr('c9', 4, 'Fondos', 30, _meses(-1, 1)),
            _pr('c9', 5, 'Dominadas', 20, _meses(0, 1))
        ]
    }),

    // 10) F · 5d_6m · CONGELADO (membresía pausada, no vence aunque la fecha pasó)
    _cli({
        id: 'c10', nombre: 'Fernanda', apellido: 'Castro', correo: 'fer.castro@gmail.com',
        telefono: '+56 9 1010 4455', genero: 'F', cumpleanos: _fecha(1995, 1, 22),
        planId: '5d_6m', racha_meses: 4, vence: _dias(-5), fechaIngreso: _meses(-6, 1),
        estado: 'Congelado', asistioHoy: false, asistenciasMes: 0,
        observaciones: 'Congelada por viaje — retoma el próximo mes.',
        pagos: [
            _pago('c10', 1, _meses(-6, 1), 'Plan 5 Días (6m)', 130000, 'Transferencia')
        ]
    }),

    // 11) SIN GÉNERO (null) · 5d_1m · Al día · ANIVERSARIO cerca (fechaIngreso Sep 15)
    _cli({
        id: 'c11', nombre: 'Ignacio', apellido: 'Reyes', correo: 'ignacio.reyes@gmail.com',
        telefono: '+56 9 1212 5566', genero: null, cumpleanos: _fecha(1993, 3, 11),
        planId: '5d_1m', racha_meses: 1, vence: _meses(1, 15), fechaIngreso: _fecha(2025, 9, 20),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 8,
        pagos: [
            _pago('c11', 1, _fecha(2025, 9, 20), 'Plan 5 Días (1m)', 25000, 'Débito'),
            _pago('c11', 2, _meses(0, 15), 'Renovación 5 Días (1m)', 25000, 'Débito')
        ]
    }),

    // 12) F · 5d_12m · Al día · racha 10 (descuento $10.000) · medidas 3 · PRs
    _cli({
        id: 'c12', nombre: 'Sofía', apellido: 'Vargas', correo: 'sofia.vargas@gmail.com',
        telefono: '+56 9 1313 6677', genero: 'F', cumpleanos: _fecha(1994, 10, 28),
        planId: '5d_12m', racha_meses: 10, vence: _meses(4, 3), fechaIngreso: _meses(-10, 3),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 17, saludControlesAlDia: true,
        pagos: [
            _pago('c12', 1, _meses(-10, 3), 'Plan 5 Días (12m)', 240000, 'Crédito'),
            _pago('c12', 2, _meses(-1, 3), 'Suplementos', 22000, 'Efectivo')
        ],
        medidasHistorial: [
            _med('c12', 1, _meses(-6, 3), { peso: 66, cintura: 74, cadera: 100, gluteos: 98 }),
            _med('c12', 2, _meses(-3, 3), { peso: 64, cintura: 72, cadera: 101, gluteos: 100 }),
            _med('c12', 3, _meses(0, 2),  { peso: 63, cintura: 70, cadera: 102, gluteos: 102 })
        ],
        prsHistorial: [
            _pr('c12', 1, 'Hip Thrust', 140, _meses(-1, 2)),
            _pr('c12', 2, 'Sentadilla', 100, _meses(-1, 2)),
            _pr('c12', 3, 'Press Banca', 50, _meses(-2, 12)),
            _pr('c12', 4, 'Bíceps', 20, _meses(-2, 12)),
            _pr('c12', 5, 'Dominadas', 6, _meses(0, 1))
        ]
    }),

    // 13) M · beta · Al día · SIN TELÉFONO (2º chip)
    _cli({
        id: 'c13', nombre: 'Martín', apellido: 'Núñez', correo: 'martin.nunez@gmail.com',
        telefono: null, genero: 'M', cumpleanos: _fecha(2001, 8, 9),
        planId: 'beta', racha_meses: 1, vence: _meses(1, 12), fechaIngreso: _meses(-1, 12),
        estado: 'Al día', asistioHoy: false, asistenciasMes: 5,
        observaciones: 'Beta tester — feedback de la app.',
        pagos: [
            _pago('c13', 1, _meses(-1, 12), 'Plan Beta Tester (1m)', 15000, 'Efectivo')
        ]
    }),

    // 14) SIN GÉNERO (null 2º) · 3d_1m · Al día
    _cli({
        id: 'c14', nombre: 'Isidora', apellido: 'Fuentealba', correo: 'isi.fuentealba@gmail.com',
        telefono: '+56 9 1414 7788', genero: null, cumpleanos: _fecha(1999, 11, 19),
        planId: '3d_1m', racha_meses: 2, vence: _meses(1, 8), fechaIngreso: _meses(-2, 8),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 7,
        pagos: [
            _pago('c14', 1, _meses(-2, 8), 'Plan 3 Días (1m)', 20000, 'Transferencia'),
            _pago('c14', 2, _meses(-1, 8), 'Renovación 3 Días (1m)', 20000, 'Transferencia')
        ]
    }),

    // 15) M · 5d_1m_ant · Al día · racha 6 · PRs (flexiones/dominadas/bíceps M)
    _cli({
        id: 'c15', nombre: 'Cristóbal', apellido: 'Díaz', correo: 'cristobal.diaz@gmail.com',
        telefono: '+56 9 1515 8899', genero: 'M', cumpleanos: _fecha(1990, 3, 27),
        planId: '5d_1m_ant', racha_meses: 6, vence: _meses(1, 9), fechaIngreso: _meses(-6, 9),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 15,
        pagos: [
            _pago('c15', 1, _meses(-3, 9), 'Renovación 5 Días (1m)', 20000, 'Débito'),
            _pago('c15', 2, _meses(-1, 9), 'Renovación 5 Días (1m)', 20000, 'Débito'),
            _pago('c15', 3, _meses(0, 9),  'Renovación 5 Días (1m)', 20000, 'Efectivo')
        ],
        prsHistorial: [
            _pr('c15', 1, 'Flexiones', 55, _meses(-1, 4)),
            _pr('c15', 2, 'Dominadas', 12, _meses(-1, 4)),
            _pr('c15', 3, 'Bíceps', 40, _meses(-2, 20)),
            _pr('c15', 4, 'Press Banca', 80, _meses(-2, 20)),
            _pr('c15', 5, 'Sentadilla', 120, _meses(-3, 10))
        ]
    }),

    // 16) F · 5d_3m_ant · Al día · racha 7 · cumple cerca · PRs (hip thrust/bíceps F)
    _cli({
        id: 'c16', nombre: 'Camila', apellido: 'Espinoza', correo: 'camila.espinoza@gmail.com',
        telefono: '+56 9 1616 9900', genero: 'F', cumpleanos: _fecha(1996, 9, 22),
        planId: '5d_3m_ant', racha_meses: 7, vence: _meses(2, 1), fechaIngreso: _meses(-7, 1),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 16,
        pagos: [
            _pago('c16', 1, _meses(-4, 1), 'Renovación 5 Días (3m)', 55000, 'Transferencia'),
            _pago('c16', 2, _meses(-1, 1), 'Renovación 5 Días (3m)', 55000, 'Transferencia')
        ],
        prsHistorial: [
            _pr('c16', 1, 'Hip Thrust', 110, _meses(-1, 1)),
            _pr('c16', 2, 'Bíceps', 22, _meses(-1, 1)),
            _pr('c16', 3, 'Press Banca', 40, _meses(-2, 5)),
            _pr('c16', 4, 'Fondos', 12, _meses(-2, 5))
        ]
    }),

    // 17) M · 5d_1m · Al día · POR VENCER (5 días) · PR banca
    _cli({
        id: 'c17', nombre: 'Lucas', apellido: 'Tapia', correo: 'lucas.tapia@gmail.com',
        telefono: '+56 9 1717 1010', telefonoEmergencia: '+56 9 6000 7777', emergencia1Nombre: 'Marta Tapia',
        genero: 'M', cumpleanos: _fecha(2002, 1, 14), planId: '5d_1m', racha_meses: 3,
        vence: _dias(5), fechaIngreso: _meses(-3, 12), estado: 'Al día',
        asistioHoy: false, asistenciasMes: 11,
        pagos: [
            _pago('c17', 1, _meses(-3, 12), 'Plan 5 Días (1m)', 25000, 'Efectivo'),
            _pago('c17', 2, _meses(-2, 12), 'Renovación 5 Días (1m)', 25000, 'Efectivo'),
            _pago('c17', 3, _meses(-1, 12), 'Renovación 5 Días (1m)', 25000, 'Débito')
        ],
        prsHistorial: [
            _pr('c17', 1, 'Press Banca', 70, _meses(-1, 5))
        ]
    }),

    // 18) F · 5d_6m · Al día · POR VENCER (3 días) · ANIVERSARIO cerca · medidas 2
    _cli({
        id: 'c18', nombre: 'Emilia', apellido: 'Sepúlveda', correo: 'emilia.sepulveda@gmail.com',
        telefono: '+56 9 1818 2020', genero: 'F', cumpleanos: _fecha(1998, 12, 1),
        planId: '5d_6m', racha_meses: 9, vence: _dias(3), fechaIngreso: _fecha(2025, 9, 19),
        estado: 'Al día', asistioHoy: true, asistenciasMes: 18,
        pagos: [
            _pago('c18', 1, _fecha(2025, 9, 19), 'Plan 5 Días (6m)', 130000, 'Crédito'),
            _pago('c18', 2, _meses(0, 1), 'Renovación 5 Días (6m)', 130000, 'Transferencia')
        ],
        medidasHistorial: [
            _med('c18', 1, _meses(-3, 1), { peso: 60, cintura: 68, cadera: 96, gluteos: 95 }),
            _med('c18', 2, _meses(0, 1),  { peso: 59, cintura: 66, cadera: 97, gluteos: 97 })
        ],
        prsHistorial: [
            _pr('c18', 1, 'Sentadilla', 85, _meses(-1, 1)),
            _pr('c18', 2, 'Hip Thrust', 100, _meses(-1, 1))
        ]
    })
];

// ------------------------------------------------------------
// RUT ficticio para el portal del socio (dígito verificador válido).
// El dashboard ignora este campo; el portal lo usa en "Mis datos".
// ------------------------------------------------------------
function _dvRut(num) {
    let suma = 0, mul = 2, x = num;
    while (x > 0) { suma += (x % 10) * mul; x = Math.floor(x / 10); mul = mul === 7 ? 2 : mul + 1; }
    const r = 11 - (suma % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
function _rutFicticio(num) {
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + _dvRut(num);
}
CLIENTES_DEMO.forEach((c, i) => {
    if (!c.rut) c.rut = c.contratoRut || _rutFicticio(11000000 + i * 613757);
});

// ------------------------------------------------------------
// INGRESOS: cuota mensual del mes actual para socios activos sin pago este
// mes, para que Finanzas y la Caja muestren un mes realista (no solo pagos
// sueltos). Monto = equivalente mensual del plan.
// ------------------------------------------------------------
(function sembrarCuotasDelMes() {
    const mesActual = _meses(0, 1).slice(0, 7); // 'YYYY-MM'
    const metodos = ['Efectivo', 'Transferencia', 'Débito', 'Crédito'];
    CLIENTES_DEMO.forEach(c => {
        if (c.planId === 'coach' || c.estado === 'Vencido' || c.estado === 'Congelado') return;
        const yaPago = (c.pagos || []).some(p => String(p.fecha).slice(0, 7) === mesActual);
        if (yaPago) return;
        const plan = PLANES.find(p => p.id === c.planId);
        const monto = plan ? Math.round(plan.precio / (plan.duracion_meses || 1)) : 25000;
        const num = parseInt(String(c.id).replace(/\D/g, '')) || 0;
        c.pagos.unshift(_pago(c.id, 90, _meses(0, 5), 'Cuota mensual', monto, metodos[num % 4]));
    });
})();

// ------------------------------------------------------------
// EGRESOS / GASTOS del gimnasio (para la sección "Gastos & Caja").
// Categorías: Servicios básicos, Insumos, Sueldos, Arriendo, Mantención, Otros.
// ------------------------------------------------------------
const CATEGORIAS_EGRESO = ['Servicios básicos', 'Insumos', 'Sueldos', 'Arriendo', 'Mantención', 'Otros'];

function _egr(i, fecha, categoria, descripcion, monto, metodo) {
    return { id: `eg${i}`, fecha, categoria, descripcion, monto, metodo, creado_en: _ts(fecha) };
}

const EGRESOS_DEMO = [
    // --- Mes actual (Septiembre) ---
    _egr(1,  _meses(0, 3),  'Servicios básicos', 'Cuenta de luz (CGE)',            58000,  'Transferencia'),
    _egr(2,  _meses(0, 3),  'Servicios básicos', 'Cuenta de agua',                 22000,  'Transferencia'),
    _egr(3,  _meses(0, 5),  'Servicios básicos', 'Internet / WiFi',                25000,  'Débito'),
    _egr(4,  _meses(0, 6),  'Insumos',           'Aseo: confort, jabón, cloro, limpiapisos', 34000, 'Efectivo'),
    _egr(5,  _meses(0, 5),  'Sueldos',           'Sueldo entrenador (Nicolás)',    200000, 'Transferencia'),
    _egr(6,  _meses(0, 10), 'Mantención',        'Service máquinas (trotadora)',   42000,  'Transferencia'),
    // --- Mes anterior (Agosto) ---
    _egr(7,  _meses(-1, 3), 'Servicios básicos', 'Cuenta de luz (CGE)',            61000,  'Transferencia'),
    _egr(8,  _meses(-1, 3), 'Servicios básicos', 'Cuenta de agua',                 20000,  'Transferencia'),
    _egr(9,  _meses(-1, 5), 'Servicios básicos', 'Internet / WiFi',                25000,  'Débito'),
    _egr(10, _meses(-1, 6), 'Insumos',           'Aseo e insumos de limpieza',     28000,  'Efectivo'),
    _egr(11, _meses(-1, 5), 'Sueldos',           'Sueldo entrenador (Nicolás)',    200000, 'Transferencia'),
    // --- Dos meses atrás (Julio) ---
    _egr(12, _meses(-2, 4), 'Servicios básicos', 'Cuenta de luz (CGE)',            55000,  'Transferencia'),
    _egr(13, _meses(-2, 5), 'Servicios básicos', 'Internet / WiFi',                25000,  'Débito'),
    _egr(14, _meses(-2, 7), 'Insumos',           'Aseo e insumos de limpieza',     30000,  'Efectivo'),
    _egr(15, _meses(-2, 5), 'Sueldos',           'Sueldo entrenador (Nicolás)',    200000, 'Transferencia')
];
