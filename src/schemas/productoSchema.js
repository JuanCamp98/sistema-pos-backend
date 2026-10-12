const { z } = require("zod");

const imagenSchema = z.string().trim().min(1).refine((valor) => {
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
    nombre: z.string().min(1, "El nombre es obligatorio"),
    descripcion: z.string().trim().optional(),
    imagen: imagenSchema.nullable().optional(),
    precio: z.number().positive("El precio debe ser mayor a cero"),
    stock: z.number().int().min(0, "El stock no puede ser negativo"),
    categoria: z.string().min(1, "La categoria es obligatoria")
});

const actualizarProductoSchema = productoSchema.partial().refine(
    (datos) => Object.keys(datos).length > 0,
    { message: "Debe enviar al menos un campo para actualizar" }
);

const paginacionProductoSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});

module.exports = { productoSchema, actualizarProductoSchema, paginacionProductoSchema };
