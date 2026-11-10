const { z } = require("zod");

const idsSchema = z.array(z.string().uuid("Debe contener identificadores validos")).max(100);
const categoriasSchema = z.array(z.string().trim().min(1).max(100)).max(100);
const valorDescuentoSchema = z.preprocess(
    (valor) => valor === "" || valor === null || valor === undefined ? null : valor,
    z.coerce.number()
        .positive("El descuento debe ser mayor a cero")
        .max(99999999.99, "El descuento supera el máximo permitido")
        .refine((valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-8, "El descuento admite como máximo dos decimales")
        .nullable()
        .optional()
);
const precioComboSchema = z.preprocess(
    (valor) => valor === "" || valor === null || valor === undefined ? null : valor,
    z.coerce.number()
        .positive("El precio del combo debe ser mayor a cero")
        .max(99999999.99, "El precio del combo supera el máximo permitido")
        .refine((valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-8, "El precio del combo admite como máximo dos decimales")
        .nullable()
        .optional()
);

const camposPromocionSchema = z.object({
    titulo: z.string().trim().min(1, "El titulo es obligatorio").max(150),
    descripcion: z.string().trim().max(1000).nullable().optional(),
    tipoDescuento: z.enum(["PORCENTAJE", "IMPORTE", "DOS_POR_UNO", "COMBO"]),
    valorDescuento: valorDescuentoSchema,
    precioCombo: precioComboSchema,
    fechaInicio: z.coerce.date(),
    fechaFin: z.coerce.date(),
    activo: z.boolean().default(true),
    productoIds: idsSchema.default([]),
    categorias: categoriasSchema.default([])
});

const crearPromocionSchema = camposPromocionSchema.superRefine(function (datos, contexto) {
    if (datos.fechaFin <= datos.fechaInicio) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["fechaFin"], message: "La fecha de fin debe ser posterior a la fecha de inicio" });
    }
    if (datos.tipoDescuento === "DOS_POR_UNO" && datos.valorDescuento !== null && datos.valorDescuento !== undefined) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "La promoción 2x1 no lleva un valor de descuento" });
    }
    if (datos.tipoDescuento === "COMBO") {
        if (datos.valorDescuento != null) {
            contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "El combo no lleva un descuento adicional" });
        }
        if (datos.precioCombo == null) {
            contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["precioCombo"], message: "El precio total del combo es obligatorio" });
        }
        if (datos.productoIds.length < 2 || datos.categorias.length) {
            contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["productoIds"], message: "Un combo debe incluir al menos dos productos específicos y no puede usar categorías" });
        }
    } else if (datos.tipoDescuento && datos.precioCombo != null) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["precioCombo"], message: "El precio de combo solo corresponde al tipo COMBO" });
    }
    if (!["DOS_POR_UNO", "COMBO"].includes(datos.tipoDescuento) && datos.valorDescuento == null) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "El valor del descuento es obligatorio" });
    }
    if (datos.tipoDescuento === "PORCENTAJE" && datos.valorDescuento > 100) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "El porcentaje no puede superar 100" });
    }
    if (!datos.productoIds.length && !datos.categorias.length) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["productoIds"], message: "Debe seleccionar al menos un producto o categoria" });
    }
});

const actualizarPromocionSchema = camposPromocionSchema.extend({
    activo: z.boolean(),
    productoIds: idsSchema,
    categorias: categoriasSchema
}).partial().superRefine(function (datos, contexto) {
    if (datos.fechaInicio && datos.fechaFin && datos.fechaFin <= datos.fechaInicio) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["fechaFin"], message: "La fecha de fin debe ser posterior a la fecha de inicio" });
    }
    if (datos.tipoDescuento === "DOS_POR_UNO" && datos.valorDescuento != null) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "La promoción 2x1 no lleva un valor de descuento" });
    }
    if (datos.tipoDescuento === "COMBO") {
        if (datos.valorDescuento != null) {
            contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "El combo no lleva un descuento adicional" });
        }
        if (datos.precioCombo === null) {
            contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["precioCombo"], message: "El precio total del combo es obligatorio" });
        }
        if (datos.productoIds && datos.productoIds.length < 2) {
            contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["productoIds"], message: "Un combo debe incluir al menos dos productos específicos" });
        }
        if (datos.categorias?.length) {
            contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["categorias"], message: "Un combo no puede usar categorías" });
        }
    } else if (datos.tipoDescuento && datos.precioCombo != null) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["precioCombo"], message: "El precio de combo solo corresponde al tipo COMBO" });
    }
    if (datos.tipoDescuento && !["DOS_POR_UNO", "COMBO"].includes(datos.tipoDescuento) && datos.valorDescuento === null) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "El valor del descuento es obligatorio" });
    }
    if (datos.tipoDescuento === "PORCENTAJE" && datos.valorDescuento !== undefined && datos.valorDescuento > 100) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: ["valorDescuento"], message: "El porcentaje no puede superar 100" });
    }
});

module.exports = { crearPromocionSchema, actualizarPromocionSchema };
