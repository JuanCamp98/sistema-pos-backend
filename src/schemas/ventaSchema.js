const { z } = require("zod");

const clienteSchema = z.object({
    nombre: z.string().min(1, "El nombre del cliente es obligatorio"),
    apellido: z.string().min(1, "El apellido del cliente es obligatorio"),
    dni: z.string().min(1, "El DNI del cliente es obligatorio"),
    email: z.string().email("El email del cliente no es valido")
});

const registrarVentaSchema = z.object({
    items: z.array(
        z.object({
            productoId: z.string().uuid("El id de producto no es valido"),
            cantidad: z.number().int().positive("La cantidad debe ser mayor a cero")
        })
    ).min(1, "La venta debe tener al menos un producto"),
    cliente: clienteSchema.optional(),
    metodoPago: z.string().min(1).optional()
});

const cobrarVentaSchema = z.object({
    metodoPago: z.string().min(1, "El metodo de pago es obligatorio"),
    codigoComprobante: z.string().optional()
});

const cancelarVentaSchema = z.object({}).optional();

const listarVentasQuerySchema = z.object({
    pagina: z.coerce.number().int().positive().optional(),
    limite: z.coerce.number().int().positive().optional(),
    estado: z.enum(["PENDIENTE", "COBRADA", "CANCELADA"]).optional()
});

module.exports = {
    registrarVentaSchema,
    cobrarVentaSchema,
    cancelarVentaSchema,
    listarVentasQuerySchema,
    clienteSchema
};