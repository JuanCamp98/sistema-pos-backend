const { z } = require("zod");
const { retiroVentaSchema } = require("./retiroSchema");
const { validarFormatoDni } = require("../utils/dni");

const MAX_ITEMS_VENTA = 100;
const MAX_CANTIDAD_ITEM = 9999;
const MAX_MONTO = 99999999.99;

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
    nombre: z.string()
        .trim()
        .min(1, "El nombre del cliente es obligatorio")
        .max(100, "El nombre del cliente no puede superar los 100 caracteres"),
    apellido: z.string()
        .trim()
        .min(1, "El apellido del cliente es obligatorio")
        .max(100, "El apellido del cliente no puede superar los 100 caracteres"),
    dni: z.string()
        .trim()
        .min(1, "El DNI del cliente es obligatorio")
        .max(20, "El DNI del cliente no es valido")
        .refine(validarFormatoDni, "El formato del DNI no es válido"),
    email: z.string()
        .trim()
        .toLowerCase()
        .max(255, "El email del cliente no puede superar los 255 caracteres")
        .email("El email del cliente no es valido"),
    confirmarEmail: z.string()
        .trim()
        .toLowerCase()
        .max(255, "La confirmacion de email no puede superar los 255 caracteres")
        .email("La confirmacion de email no es valida")
}).refine(
    (cliente) => cliente.email === cliente.confirmarEmail,
    { message: "Los emails no coinciden", path: ["confirmarEmail"] }
);

const itemVentaSchema = z.object({
    productoId: z.string().uuid("El id de producto no es valido"),
    cantidad: z.number()
        .int()
        .positive("La cantidad debe ser mayor a cero")
        .max(MAX_CANTIDAD_ITEM, "La cantidad supera el máximo permitido")
});

const itemsVentaSchema = z.array(itemVentaSchema)
    .min(1, "La venta debe tener al menos un producto")
    .max(MAX_ITEMS_VENTA, "La venta no puede tener más de 100 productos distintos");

const registrarVentaSchema = z.object({
    items: itemsVentaSchema,
    cliente: clienteSchema.optional(),
    metodoPago: z.string().trim().min(1).max(50).optional(),
    retiro: retiroVentaSchema,
    nombrePersonalizado: nombrePersonalizadoSchema.optional()
});

const clienteVentaDirectaSchema = z.object({
    id: z.string().uuid("El id de cliente no es valido").optional(),
    nombre: z.string()
        .trim()
        .min(1, "El nombre del cliente no puede estar vacio")
        .max(100, "El nombre del cliente no puede superar los 100 caracteres")
        .optional(),
    apellido: z.string()
        .trim()
        .min(1, "El apellido del cliente no puede estar vacio")
        .max(100, "El apellido del cliente no puede superar los 100 caracteres")
        .optional(),
    dni: z.string()
        .trim()
        .min(1, "El DNI del cliente no puede estar vacio")
        .max(20, "El DNI del cliente no es valido")
        .refine(validarFormatoDni, "El formato del DNI no es válido")
        .optional(),
    email: z.string()
        .trim()
        .toLowerCase()
        .max(255, "El email del cliente no puede superar los 255 caracteres")
        .email("El email del cliente no es valido")
        .optional(),
    confirmarEmail: z.string()
        .trim()
        .toLowerCase()
        .max(255, "La confirmacion de email no puede superar los 255 caracteres")
        .email("La confirmacion de email no es valida")
        .optional()
}).refine(
    (cliente) => !cliente.confirmarEmail || (cliente.email && cliente.email === cliente.confirmarEmail),
    { message: "Los emails no coinciden", path: ["confirmarEmail"] }
).optional();

const ventaDirectaSchema = z.object({
    items: itemsVentaSchema,
    cliente: clienteVentaDirectaSchema,
    metodoPago: z.string().trim().min(1).max(50).optional(),
    efectivoRecibido: z.number().finite().max(MAX_MONTO, "El efectivo recibido supera el máximo permitido").optional(),
    cobrar: z.boolean().optional(),
    nombrePersonalizado: nombrePersonalizadoSchema.optional()
}).refine(
    (data) => !data.cobrar || Boolean(data.metodoPago && data.metodoPago.trim().length > 0),
    { message: "El metodo de pago es obligatorio para cobrar la venta directamente", path: ["metodoPago"] }
);

const cancelarVentaSchema = z.object({}).optional();

const cobrarVentaSchema = z.object({
    metodoPago: z.string().trim().min(1, "El metodo de pago es obligatorio").max(50, "El metodo de pago no es valido"),
    efectivoRecibido: z.number().finite().max(MAX_MONTO, "El efectivo recibido supera el máximo permitido").optional()
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
    pagina: z.coerce.number().int().positive().max(100000).optional(),
    limite: z.coerce.number().int().positive().max(100).optional(),
    page: z.coerce.number().int().positive().max(100000).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
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
