const { z } = require("zod");
const { validarFormatoDni } = require("../utils/dni");

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

const consultarClientePorDniSchema = z.object({
    dni: z.string()
        .trim()
        .min(1, "El DNI es obligatorio")
        .refine(
            validarFormatoDni,
            "El formato del DNI no es válido"
        )
});

// Solo se permiten los campos personales editables. El rol y el ID quedan
// fuera del esquema para que no puedan modificarse desde el cuerpo del request.
const actualizarPerfilSchema = z.object({
    nombre: z.string()
        .trim()
        .min(1, "El nombre es obligatorio")
        .max(100, "El nombre no puede superar los 100 caracteres")
        .optional(),
    apellido: z.string()
        .trim()
        .min(1, "El apellido es obligatorio")
        .max(100, "El apellido no puede superar los 100 caracteres")
        .optional(),
    dni: z.string()
        .trim()
        .min(1, "El DNI es obligatorio")
        .refine(validarFormatoDni, "El formato del DNI no es válido")
        .optional(),
    email: z.string()
        .trim()
        .min(1, "El email es obligatorio")
        .email("El email no es valido")
        .max(255, "El email no puede superar los 255 caracteres")
        .optional()
})
    .strict()
    .refine(
        (datos) => Object.keys(datos).length > 0,
        "Debés enviar al menos un dato para actualizar"
    );

const cambiarContrasenaSchema = z.object({
    contrasenaActual: z.string()
        .min(1, "La contrasena actual es obligatoria"),
    contrasenaNueva: z.string()
        .min(6, "La contrasena debe tener al menos 6 caracteres"),
    confirmarContrasena: z.string()
        .min(1, "Debes confirmar la nueva contrasena")
})
    .strict()
    .refine(
        (datos) => datos.contrasenaNueva === datos.confirmarContrasena,
        {
            message: "Las contrasenas no coinciden",
            path: ["confirmarContrasena"]
        }
    );

module.exports = {
    registroSchema,
    publicRegistroSchema,
    loginSchema,
    solicitarRecuperacionSchema,
    restablecerContrasenaSchema,
    consultarClientePorDniSchema,
    actualizarPerfilSchema,
    cambiarContrasenaSchema
};