const express = require("express");
const usuarioController = require("../controllers/usuarioController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { limitarPeticiones } = require("../middlewares/limitarPeticiones");
const {
    publicRegistroSchema,
    loginSchema,
    solicitarRecuperacionSchema,
    restablecerContrasenaSchema,
    actualizarPerfilSchema,
    cambiarContrasenaSchema
} = require("../schemas/usuarioSchema");
const router = express.Router();

const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;

function claveConEmail(req) {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return req.ip + "|" + email;
}

// POST /usuarios/registro: Permitido para publico (se asigna rol Cliente) y Administradores.
router.post(
    "/registro",
    limitarPeticiones({ limite: 20, ventanaMs: HORA_MS }),
    validar(publicRegistroSchema),
    usuarioController.registrar
);

router.post(
    "/login",
    // Limite por IP ademas del limite por email: evita que un atacante rote
    // direcciones de correo para saltarse el control por credencial.
    limitarPeticiones({
        limite: 100,
        ventanaMs: 15 * MINUTO_MS,
        mensaje: "Demasiados intentos de inicio de sesión. Esperá unos minutos."
    }),
    limitarPeticiones({
        limite: 10,
        ventanaMs: 15 * MINUTO_MS,
        clave: claveConEmail,
        mensaje: "Demasiados intentos de inicio de sesión. Esperá unos minutos."
    }),
    validar(loginSchema),
    usuarioController.iniciarSesion
);
router.post(
    "/solicitar-recuperacion",
    // Tambien se limita por IP para que no se puedan enviar correos masivos
    // rotando el email solicitado.
    limitarPeticiones({
        limite: 20,
        ventanaMs: HORA_MS,
        mensaje: "Demasiadas solicitudes de recuperación. Esperá unos minutos."
    }),
    limitarPeticiones({
        limite: 5,
        ventanaMs: HORA_MS,
        clave: claveConEmail,
        mensaje: "Demasiadas solicitudes de recuperación. Esperá unos minutos."
    }),
    validar(solicitarRecuperacionSchema),
    usuarioController.solicitarRecuperacion
);
router.post(
    "/restablecer-contrasena",
    limitarPeticiones({ limite: 10, ventanaMs: HORA_MS }),
    validar(restablecerContrasenaSchema),
    usuarioController.restablecerContrasena
);

router.get("/perfil", verificarToken, usuarioController.obtenerPerfil);

// El usuario autenticado solo puede actualizar su propio perfil. El ID se
// obtiene del token y el esquema solo admite datos personales editables.
router.put(
    "/perfil",
    verificarToken,
    validar(actualizarPerfilSchema),
    usuarioController.actualizarPerfil
);

router.put(
    "/cambiar-contrasena",
    verificarToken,
    validar(cambiarContrasenaSchema),
    usuarioController.cambiarContrasena
);

// GET /usuarios/dni/:dni: consulta de cliente por DNI para Cajero y Administrador
router.get(
    "/dni/:dni",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    usuarioController.obtenerClientePorDni
);

module.exports = router;