const { z } = require("zod");

const patronFecha = /^\d{4}-\d{2}-\d{2}$/;
const patronHorario = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function esFechaValida(fecha) {
    if (!patronFecha.test(fecha)) return false;
    const fechaUtc = new Date(fecha + "T00:00:00.000Z");
    return !Number.isNaN(fechaUtc.getTime()) && fechaUtc.toISOString().slice(0, 10) === fecha;
}

const horarioSchema = z.string().regex(patronHorario, "El horario debe tener formato HH:mm");

const excepcionRetiroSchema = z.object({
    fecha: z.string().refine(esFechaValida, "La fecha de excepción no es válida"),
    cerrado: z.boolean(),
    horaApertura: horarioSchema.optional(),
    horaCierre: horarioSchema.optional()
}).superRefine((excepcion, contexto) => {
    if (!excepcion.cerrado) {
        if (!excepcion.horaApertura || !excepcion.horaCierre) {
            contexto.addIssue({
                code: "custom",
                message: "Una excepción abierta requiere horario de apertura y cierre",
                path: ["horaApertura"]
            });
        } else if (excepcion.horaApertura >= excepcion.horaCierre) {
            contexto.addIssue({
                code: "custom",
                message: "El horario de cierre debe ser posterior al de apertura",
                path: ["horaCierre"]
            });
        }
    }
});

const configuracionRetiroSchema = z.object({
    diasAtencion: z.array(z.number().int().min(0).max(6)).min(1).max(7)
        .refine((dias) => new Set(dias).size === dias.length, "Los días de atención no deben repetirse"),
    horaApertura: horarioSchema,
    horaCierre: horarioSchema,
    intervaloMinutos: z.number().int().min(1).max(720),
    excepciones: z.array(excepcionRetiroSchema).max(100)
}).superRefine((configuracion, contexto) => {
    if (configuracion.horaApertura >= configuracion.horaCierre) {
        contexto.addIssue({
            code: "custom",
            message: "El horario de cierre debe ser posterior al de apertura",
            path: ["horaCierre"]
        });
    }
    const fechas = configuracion.excepciones.map((excepcion) => excepcion.fecha);
    if (new Set(fechas).size !== fechas.length) {
        contexto.addIssue({
            code: "custom",
            message: "No puede haber más de una excepción para la misma fecha",
            path: ["excepciones"]
        });
    }
});

const disponibilidadRetiroQuerySchema = z.object({
    dias: z.coerce.number().int().min(1).max(90).default(60)
});

const retiroVentaSchema = z.object({
    fecha: z.string().refine(esFechaValida, "La fecha de retiro no es válida"),
    horaInicio: horarioSchema,
    horaFin: horarioSchema
});

module.exports = {
    configuracionRetiroSchema,
    disponibilidadRetiroQuerySchema,
    retiroVentaSchema
};
