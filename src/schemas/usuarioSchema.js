const { z } = require("zod");
const { validarFormatoDni } = require("../utils/dni");

// bcrypt trunca silenciosamente a 72 bytes, por eso se limita la longitud.
// Se exige un minimo de 8 caracteres sin imponer complejidad para no romper
// el flujo actual de registro.
const contrasenaSchema = z.string()
    .min(8, "La contrasena debe tener al menos 8 caracteres")
    .max(72, "La contrasena no puede superar los 72 caracteres");

const registroSchema = z.object({
    nombre: z.string()
        .trim()
        .min(1, "El nombre es obligatorio")
        .max(100, "El nombre no puede superar los 100 caracteres"),
    apellido: z.string()
        .trim()
        .min(1, "El apellido es obligatorio")
        .max(100, "El apellido no puede superar los 100 caracteres"),
    dni: z.string()
        .trim()
        .min(1, "El DNI es obligatorio")
        .max(20, "El DNI no es valido")
        .refine(validarFormatoDni, "El formato del DNI no es válido"),
    email: z.string()
        .trim()
        .toLowerCase()
        .max(255, "El email no puede superar los 255 caracteres")
        .email("El email no es valido"),
    contrasena: contrasenaSchema,
    rol: z.string()
        .trim()
        .min(1, "El rol es obligatorio")
        .max(50, "El rol no es valido")
});

const publicRegistroSchema = registroSchema.omit({ rol: true });

const loginSchema = z.object({
    email: z.string()
        .trim()
        .toLowerCase()
        .max(255, "El email no puede superar los 255 caracteres")
        .email("El email no es valido"),
    contrasena: z.string()
        .min(1, "La contrasena es obligatoria")
        .max(200, "La contrasena no es valida")
});

const solicitarRecuperacionSchema = z.object({
    email: z.string()
        .trim()
        .toLowerCase()
        .max(255, "El email no puede superar los 255 caracteres")
        .email("El email no es valido")
});

const restablecerContrasenaSchema = z.object({
    token: z.string().min(1, "El token es obligatorio").max(128),
    contrasena: contrasenaSchema
});

const consultarClientePorDniSchema = z.object({
    dni: z.string()
        .trim()
        .min(1, "El DNI es obligatorio")
        .max(20, "El DNI no es valido")
        .refine(
            validarFormatoDni,
            "El formato del DNI no es válido"
        )
});

// Solo se permiten los campos personales editables. El rol y el ID quedan
// fuera del esquema para que no puedan modificarse desde el cuerpo del request.
// contrasenaActual se exige en el servicio solo cuando cambia el email.
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
        .max(20, "El DNI no es valido")
        .refine(validarFormatoDni, "El formato del DNI no es válido")
        .optional(),
    email: z.string()
        .trim()
        .toLowerCase()
        .min(1, "El email es obligatorio")
        .max(255, "El email no puede superar los 255 caracteres")
        .email("El email no es valido")
        .optional(),
    contrasenaActual: z.string()
        .min(1, "La contrasena actual es obligatoria")
        .max(200, "La contrasena actual no es valida")
        .optional()
})
    .strict()
    .refine(
        (datos) => Object.keys(datos).length > 0,
        "Debés enviar al menos un dato para actualizar"
    );

const cambiarContrasenaSchema = z.object({
    contrasenaActual: z.string()
        .min(1, "La contrasena actual es obligatoria")
        .max(200, "La contrasena actual no es valida"),
    contrasenaNueva: contrasenaSchema,
    confirmarContrasena: z.string()
        .min(1, "Debes confirmar la nueva contrasena")
        .max(72, "La contrasena no puede superar los 72 caracteres")
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
