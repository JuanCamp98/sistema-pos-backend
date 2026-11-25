const { z } = require("zod");

const registrarMovimientoSchema = z.object({
    productoId: z.string().uuid("El id de producto no es valido"),
    tipo: z.enum(["ENTRADA", "SALIDA"], { errorMap: () => ({ message: "El tipo debe ser ENTRADA o SALIDA" }) }),
    motivo: z.enum(["AJUSTE_MANUAL", "DEVOLUCION"], { errorMap: () => ({ message: "El motivo debe ser AJUSTE_MANUAL o DEVOLUCION" }) }),
    cantidad: z.number().int().positive("La cantidad debe ser mayor a cero"),
    referenciaId: z.string().optional()
});

const ajustarStockSchema = z.object({
    tipo: z.enum(["ENTRADA", "SALIDA"], { errorMap: () => ({ message: "El tipo debe ser ENTRADA o SALIDA" }) }),
    cantidad: z.number().int().positive("La cantidad debe ser mayor a cero"),
    referenciaId: z.string().optional()
});

const productoIdParamSchema = z.object({
    productoId: z.string().uuid("El id de producto no es valido")
});

const paginacionStockSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});

const listarStockSchema = paginacionStockSchema.extend({
    bajo: z.enum(["true", "false"])
        .optional()
        .transform((valor) => valor === "true")
});

const configuracionStockSchema = z.object({
    umbralStockBajo: z.number()
        .int("El umbral debe ser un número entero")
        .min(0, "El umbral no puede ser negativo")
        .max(2147483647, "El umbral es demasiado grande")
}).strict();

const vistaPreviaStockSchema = z.object({
    umbral: z.string()
        .trim()
        .min(1, "El umbral es obligatorio")
        .regex(/^\d+$/, "El umbral debe ser un número entero mayor o igual a cero")
        .transform((valor) => Number(valor))
        .refine(
            (valor) => Number.isSafeInteger(valor) && valor <= 2147483647,
            "El umbral es demasiado grande"
        )
});

const historialMovimientosSchema = paginacionStockSchema.extend({
    productoId: z.string().uuid("El id de producto no es valido").optional(),
    tipo: z.enum(["ENTRADA", "SALIDA"]).optional(),
    motivo: z.enum(["VENTA", "AJUSTE_MANUAL", "DEVOLUCION"]).optional(),
    desde: z.coerce.date().optional(),
    hasta: z.coerce.date().optional()
}).refine(
    (filtros) => !filtros.desde || !filtros.hasta || filtros.desde <= filtros.hasta,
    { message: "La fecha desde no puede ser posterior a la fecha hasta" }
);

module.exports = {
    registrarMovimientoSchema,
    ajustarStockSchema,
    productoIdParamSchema,
    paginacionStockSchema,
    listarStockSchema,
    configuracionStockSchema,
    vistaPreviaStockSchema,
    historialMovimientosSchema
};
