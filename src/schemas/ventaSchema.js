const { z } = require("zod");

const registrarVentaSchema = z.object({
    items: z.array(
        z.object({
            productoId: z.string().uuid("El id de producto no es valido"),
            cantidad: z.number().int().positive("La cantidad debe ser mayor a cero")
        })
    ).min(1, "La venta debe tener al menos un producto")
});

module.exports = { registrarVentaSchema };