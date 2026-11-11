const { z } = require("zod");

const reporteVentasQuerySchema = z.object({
    estado: z.enum([
        "PENDIENTE",
        "COBRADA",
        "EN_PREPARACION",
        "LISTA_PARA_RETIRAR",
        "RETIRADA",
        "CANCELADA",
        "REEMBOLSADA"
    ]).optional(),
    fechaDesde: z.coerce.date().optional(),
    fechaHasta: z.coerce.date().optional(),
    buscar: z.string().trim().max(100, "La búsqueda no puede superar los 100 caracteres").optional()
}).refine(
    (filtros) => !filtros.fechaDesde || !filtros.fechaHasta || filtros.fechaDesde <= filtros.fechaHasta,
    { message: "La fecha desde no puede ser posterior a la fecha hasta" }
);

const reporteStockQuerySchema = z.object({
    bajo: z.enum(["true", "false"]).optional().transform((valor) => valor === "true")
});

module.exports = { reporteVentasQuerySchema, reporteStockQuerySchema };
