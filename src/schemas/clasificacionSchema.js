const { z } = require("zod");

const nombreClasificacionSchema = z.object({
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100, "El nombre no puede superar 100 caracteres")
});

module.exports = { nombreClasificacionSchema };
