const { z } = require("zod");

const imagenSchema = z.string().trim().min(1).max(5000, "La ruta de imagen es demasiado larga").refine((valor) => {
    try {
        const url = new URL(valor);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return valor.length > 0
            && !valor.startsWith("//")
            && !valor.includes("\\")
            && !/\s/.test(valor)
            && !/^[a-z][a-z\d+.-]*:/i.test(valor);
    }
}, "La imagen debe ser una URL HTTP(S) o una ruta relativa");

const productoSchema = z.object({
    nombre: z.string()
        .trim()
        .min(1, "El nombre es obligatorio")
        .max(150, "El nombre no puede superar los 150 caracteres"),
    descripcion: z.string()
        .trim()
        .max(2000, "La descripción no puede superar los 2000 caracteres")
        .optional(),
    imagen: imagenSchema.nullable().optional(),
    precio: z.number()
        .positive("El precio debe ser mayor a cero")
        .max(99999999.99, "El precio supera el máximo permitido"),
    stock: z.number().int().min(0, "El stock no puede ser negativo"),
    categoriaId: z.string().min(1, "El id de categoria es obligatorio").max(64),
    tipoProductoId: z.string().min(1, "El id de tipo de producto es obligatorio").max(64)
});

// El stock solo se modifica mediante movimientos de inventario. En la
// actualizacion se omite para no pisar el valor sin dejar historial.
const actualizarProductoSchema = productoSchema.omit({ stock: true }).partial().refine(
    (datos) => Object.keys(datos).length > 0,
    { message: "Debe enviar al menos un campo para actualizar" }
);

const paginacionProductoSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    nombre: z.string().trim().max(100).optional(),
    categoria: z.string().trim().max(100).optional(),
    categoriaId: z.string().min(1).optional(),
    tipoProductoId: z.string().min(1).optional()
});

module.exports = { productoSchema, actualizarProductoSchema, paginacionProductoSchema };
