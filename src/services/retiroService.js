const ErrorPersonalizado = require("../utils/errorPersonalizado");
const prisma = require("../config/prisma");

const DIAS_EN_MILISEGUNDOS = 24 * 60 * 60 * 1000;
const ZONA_HORARIA = process.env.ZONA_HORARIA_NEGOCIO || "America/Argentina/Buenos_Aires";

function obtenerPartesFechaHora(fecha = new Date()) {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONA_HORARIA,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(fecha);
    const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));

    return {
        fecha: `${valores.year}-${valores.month}-${valores.day}`,
        minutos: Number(valores.hour) * 60 + Number(valores.minute)
    };
}

function minutosDesdeMedianoche(horario) {
    const [hora, minuto] = horario.split(":").map(Number);
    return hora * 60 + minuto;
}

function sumarMinutos(minutos) {
    const hora = Math.floor(minutos / 60);
    const minuto = minutos % 60;
    return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function obtenerHorarioDeFecha(fecha, configuracion) {
    const excepcion = configuracion.excepciones.find((item) => item.fecha === fecha);
    if (excepcion?.cerrado) return null;

    const diaSemana = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
    if (!excepcion && !configuracion.diasAtencion.includes(diaSemana)) return null;

    return {
        apertura: excepcion?.horaApertura || configuracion.horaApertura,
        cierre: excepcion?.horaCierre || configuracion.horaCierre
    };
}

function generarHorarios(fecha, configuracion, ahora = new Date()) {
    if (!configuracion) return [];

    const partesActuales = obtenerPartesFechaHora(ahora);
    if (fecha < partesActuales.fecha) return [];

    const horario = obtenerHorarioDeFecha(fecha, configuracion);
    if (!horario) return [];

    const apertura = minutosDesdeMedianoche(horario.apertura);
    const cierre = minutosDesdeMedianoche(horario.cierre);
    const ahoraMinutos = fecha === partesActuales.fecha ? partesActuales.minutos : -1;
    const intervalos = [];

    for (let inicio = apertura; inicio + configuracion.intervaloMinutos <= cierre; inicio += configuracion.intervaloMinutos) {
        if (inicio <= ahoraMinutos) continue;
        intervalos.push({
            horaInicio: sumarMinutos(inicio),
            horaFin: sumarMinutos(inicio + configuracion.intervaloMinutos)
        });
    }

    return intervalos;
}

function validarHorarioDisponible(retiro, configuracion, ahora = new Date()) {
    return generarHorarios(retiro.fecha, configuracion, ahora).some((horario) =>
        horario.horaInicio === retiro.horaInicio && horario.horaFin === retiro.horaFin
    );
}

async function obtenerConfiguracion(tx) {
    const registro = await tx.configuracionRetiro.findUnique({ where: { id: 1 } });
    return registro?.configuracion || null;
}

async function obtenerDisponibilidad(dias) {
    const configuracion = await obtenerConfiguracion(prisma);
    const ahora = new Date();
    const fechaActual = obtenerPartesFechaHora(ahora).fecha;
    const fechaInicio = new Date(`${fechaActual}T00:00:00.000Z`);
    const fechas = [];

    for (let desplazamiento = 0; desplazamiento < dias; desplazamiento += 1) {
        const fecha = new Date(fechaInicio.getTime() + desplazamiento * DIAS_EN_MILISEGUNDOS)
            .toISOString()
            .slice(0, 10);
        const horarios = generarHorarios(fecha, configuracion, ahora);
        if (horarios.length > 0) fechas.push({ fecha, horarios });
    }

    return { fechaDesde: fechaActual, fechas };
}

async function validarHorarioRetiro(tx, retiro) {
    const { fecha, horaInicio, horaFin } = retiro;
    const partesActuales = obtenerPartesFechaHora();
    if (fecha < partesActuales.fecha) {
        throw new ErrorPersonalizado("No se puede seleccionar una fecha pasada", 400);
    }

    const configuracion = await obtenerConfiguracion(tx);
    if (!validarHorarioDisponible(retiro, configuracion)) {
        throw new ErrorPersonalizado(
            "El horario de retiro ya no está disponible. Elegí otra fecha y horario.",
            409
        );
    }

    return new Date(`${fecha}T00:00:00.000Z`);
}

async function obtenerConfiguracionAdministrativa() {
    return obtenerConfiguracion(prisma);
}

async function guardarConfiguracion(configuracion) {
    const registro = await prisma.configuracionRetiro.upsert({
        where: { id: 1 },
        create: { id: 1, configuracion },
        update: { configuracion }
    });
    return registro.configuracion;
}

module.exports = {
    obtenerDisponibilidad,
    obtenerConfiguracionAdministrativa,
    guardarConfiguracion,
    generarHorarios,
    validarHorarioDisponible,
    validarHorarioRetiro
};
