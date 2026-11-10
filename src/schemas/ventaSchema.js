const { z } = require("zod");
const { retiroVentaSchema } = require("./retiroSchema");

const normalizarNombrePersonalizado = (nombre) => nombre
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const nombrePersonalizadoSchema = z.string()
    .transform((nombre) => normalizarNombrePersonalizado(nombre))
    .pipe(z.string()
        .min(1, "El nombre de la compra no puede estar vacio")
        .max(80, "El nombre de la compra no puede superar los 80 caracteres"));

const clienteSchema = z.object({
    nombre: z.string().min(1, "El nombre del cliente es obligatorio"),
    apellido: z.string().min(1, "El apellido del cliente es obligatorio"),
    dni: z.string().min(1, "El DNI del cliente es obligatorio"),
    email: z.string().email("El email del cliente no es valido"),
    confirmarEmail: z.string().email("La confirmacion de email no es valida")
}).refine(
    (cliente) => cliente.email.toLowerCase() === cliente.confirmarEmail.toLowerCase(),
    { message: "Los emails no coinciden", path: ["confirmarEmail"] }
);

const registrarVentaSchema = z.object({
    items: z.array(
        z.object({
            productoId: z.string().uuid("El id de producto no es valido"),
            cantidad: z.number().int().positive("La cantidad debe ser mayor a cero")
        })
    ).min(1, "La venta debe tener al menos un producto"),
    cliente: clienteSchema.optional(),
    metodoPago: z.string().min(1).optional(),
    retiro: retiroVentaSchema,
    nombrePersonalizado: nombrePersonalizadoSchema.optional()
});

const clienteVentaDirectaSchema = z.object({
    nombre: z.string().trim().min(1, "El nombre del cliente no puede estar vacio").optional(),
    apellido: z.string().trim().min(1, "El apellido del cliente no puede estar vacio").optional(),
    dni: z.string().trim().min(1, "El DNI del cliente no puede estar vacio").optional(),
    email: z.string().email("El email del cliente no es valido").optional(),
    confirmarEmail: z.string().email("La confirmacion de email no es valida").optional()
}).refine(
    (cliente) => !cliente.confirmarEmail || (cliente.email && cliente.email.toLowerCase() === cliente.confirmarEmail.toLowerCase()),
    { message: "Los emails no coinciden", path: ["confirmarEmail"] }
).optional();

const ventaDirectaSchema = z.object({
    items: z.array(
        z.object({
            productoId: z.string().uuid("El id de producto no es valido"),
            cantidad: z.number().int().positive("La cantidad debe ser mayor a cero")
        })
    ).min(1, "La venta debe tener al menos un producto"),
    cliente: clienteVentaDirectaSchema,
    metodoPago: z.string().min(1).optional(),
    cobrar: z.boolean().optional(),
    nombrePersonalizado: nombrePersonalizadoSchema.optional()
}).refine(
    (data) => !data.cobrar || Boolean(data.metodoPago && data.metodoPago.trim().length > 0),
    { message: "El metodo de pago es obligatorio para cobrar la venta directamente", path: ["metodoPago"] }
);

const cancelarVentaSchema = z.object({}).optional();

const cobrarVentaSchema = z.object({
    metodoPago: z.string().min(1, "El metodo de pago es obligatorio"),
    efectivoRecibido: z.number().finite().optional()
}).superRefine((datos, contexto) => {
    if (datos.metodoPago !== "Efectivo") return;

    if (datos.efectivoRecibido === undefined) {
        contexto.addIssue({
            code: "custom",
            message: "El efectivo recibido es obligatorio",
            path: ["efectivoRecibido"]
        });
    } else if (datos.efectivoRecibido <= 0) {
        contexto.addIssue({
            code: "custom",
            message: "El efectivo recibido debe ser mayor a 0",
            path: ["efectivoRecibido"]
        });
    }
});

const renombrarVentaSchema = z.object({
    nombrePersonalizado: nombrePersonalizadoSchema
}).strict();

const listarVentasQuerySchema = z.object({
    pagina: z.coerce.number().int().positive().optional(),
    limite: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
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
    clienteId: z.string().uuid("El id de cliente no es valido").optional()
}).transform((datos) => ({
    pagina: datos.pagina ?? datos.page,
    limite: datos.limite ?? datos.limit,
    estado: datos.estado,
    fechaDesde: datos.fechaDesde,
    fechaHasta: datos.fechaHasta,
    clienteId: datos.clienteId
})).refine(
    (filtros) => !filtros.fechaDesde || !filtros.fechaHasta || filtros.fechaDesde <= filtros.fechaHasta,
    { message: "La fecha desde no puede ser posterior a la fecha hasta" }
);

module.exports = {
    registrarVentaSchema,
    ventaDirectaSchema,
    cobrarVentaSchema,
    cancelarVentaSchema,
    renombrarVentaSchema,
    listarVentasQuerySchema,
    clienteSchema
};
