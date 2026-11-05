const { z } = require("zod");

const idsSchema = z.array(z.string().uuid("Debe contener identificadores validos")).max(100).default([]);
const categoriasSchema = z.array(z.string().trim().min(1).max(100)).max(100).default([]);

const camposPromocionSchema = z.object({
    titulo: z.string().trim().min(1, "El titulo es obligatorio").max(150),
    descripcion: z.string().trim().max(1000).nullable().optional(),
    tipoDescuento: z.enum(["PORCENTAJE", "IMPORTE"]),
    valorDescuento: z.coerce.number().positive("El descuento debe ser mayor a cero"),
    fechaInicio: z.coerce.date(),
    fechaFin: z.coerce.date(),
    activo: z.boolean().default(true),
    productoIds: idsSchema,
    categorias: categoriasSchema
});

const crearPromocionSchema = camposPromocionSchema.superRefine(function (datos, contexto) {
    if (datos.fechaFin <= datos.fechaInicio) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["fechaFin"], message: "La fecha de fin debe ser posterior a la fecha de inicio" });
    }
    if (datos.tipoDescuento === "PORCENTAJE" && datos.valorDescuento > 100) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "El porcentaje no puede superar 100" });
    }
    if (!datos.productoIds.length && !datos.categorias.length) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["productoIds"], message: "Debe seleccionar al menos un producto o categoria" });
    }
});

const actualizarPromocionSchema = camposPromocionSchema.partial().superRefine(function (datos, contexto) {
    if (datos.fechaInicio && datos.fechaFin && datos.fechaFin <= datos.fechaInicio) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["fechaFin"], message: "La fecha de fin debe ser posterior a la fecha de inicio" });
    }
    if (datos.tipoDescuento === "PORCENTAJE" && datos.valorDescuento !== undefined && datos.valorDescuento > 100) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "El porcentaje no puede superar 100" });
    }
});

module.exports = { crearPromocionSchema, actualizarPromocionSchema };
