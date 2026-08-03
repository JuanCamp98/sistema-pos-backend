const { z } = require("zod");

const registroSchema = z.object({
    nombre: z.string().min(1, "El nombre es obligatorio"),
    apellido: z.string().min(1, "El apellido es obligatorio"),
    email: z.string().email("El email no es valido"),
    contrasena: z.string().min(6, "La contrasena debe tener al menos 6 caracteres"),
    rol: z.string().min(1, "El rol es obligatorio")
});

const loginSchema = z.object({
    email: z.string().email("El email no es valido"),
    contrasena: z.string().min(1, "La contrasena es obligatoria")
});

module.exports = { registroSchema, loginSchema };