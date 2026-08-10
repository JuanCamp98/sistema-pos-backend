const express = require("express");
const usuarioController = require("../controllers/usuarioController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { registroSchema, loginSchema } = require("../schemas/usuarioSchema");
const router = express.Router();

// POST /usuarios/registro: solo Administrador puede crear usuarios.
// Antes era publico y permitia autoasignarse cualquier rol.
router.post(
    "/registro",
    verificarToken,
    verificarRol(["Administrador"]),
    validar(registroSchema),
    usuarioController.registrar
);

router.post("/login", validar(loginSchema), usuarioController.iniciarSesion);

module.exports = router;