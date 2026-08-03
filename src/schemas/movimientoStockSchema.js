const { z } = require("zod");

const registrarMovimientoSchema = z.object({
    productoId: z.string().uuid("El id de producto no es valido"),
    tipo: z.enum(["ENTRADA", "SALIDA"], { errorMap: () => ({ message: "El tipo debe ser ENTRADA o SALIDA" }) }),
    motivo: z.enum(["AJUSTE_MANUAL", "DEVOLUCION"], { errorMap: () => ({ message: "El motivo debe ser AJUSTE_MANUAL o DEVOLUCION" }) }),
    cantidad: z.number().int().positive("La cantidad debe ser mayor a cero"),
    referenciaId: z.string().optional()
});

module.exports = { registrarMovimientoSchema };