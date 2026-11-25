const express = require("express");
const usuarioController = require("../controllers/usuarioController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const {
    publicRegistroSchema,
    loginSchema,
    solicitarRecuperacionSchema,
    restablecerContrasenaSchema,
    actualizarPerfilSchema,
    cambiarContrasenaSchema
} = require("../schemas/usuarioSchema");
const router = express.Router();

// POST /usuarios/registro: Permitido para publico (se asigna rol Cliente) y Administradores.
router.post(
    "/registro",
    validar(publicRegistroSchema),
    usuarioController.registrar
);

router.post("/login", validar(loginSchema), usuarioController.iniciarSesion);
router.post(
    "/solicitar-recuperacion",
    validar(solicitarRecuperacionSchema),
    usuarioController.solicitarRecuperacion
);
router.post(
    "/restablecer-contrasena",
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