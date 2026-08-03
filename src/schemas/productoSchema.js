const { z } = require("zod");

const productoSchema = z.object({
    nombre: z.string().min(1, "El nombre es obligatorio"),
    descripcion: z.string().optional(),
    precio: z.number().positive("El precio debe ser mayor a cero"),
    stock: z.number().int().min(0, "El stock no puede ser negativo"),
    categoria: z.string().min(1, "La categoria es obligatoria")
});

module.exports = { productoSchema };