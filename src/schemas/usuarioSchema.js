const { z } = require("zod");

const registroSchema = z.object({
    nombre: z.string().min(1, "El nombre es obligatorio"),
    apellido: z.string().min(1, "El apellido es obligatorio"),
    dni: z.string().min(1, "El DNI es obligatorio"),
    email: z.string().email("El email no es valido"),
    contrasena: z.string().min(6, "La contrasena debe tener al menos 6 caracteres"),
    rol: z.string().min(1, "El rol es obligatorio")
});

const publicRegistroSchema = registroSchema.omit({ rol: true });

const loginSchema = z.object({
    email: z.string().email("El email no es valido"),
    contrasena: z.string().min(1, "La contrasena es obligatoria")
});

const solicitarRecuperacionSchema = z.object({
    email: z.string().trim().email("El email no es valido")
});

const restablecerContrasenaSchema = z.object({
    token: z.string().min(1, "El token es obligatorio").max(128),
    contrasena: z.string().min(6, "La contrasena debe tener al menos 6 caracteres")
});

module.exports = {
    registroSchema,
    publicRegistroSchema,
    loginSchema,
    solicitarRecuperacionSchema,
    restablecerContrasenaSchema
};