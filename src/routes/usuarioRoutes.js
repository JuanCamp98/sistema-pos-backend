const express = require("express");
const usuarioController = require("../controllers/usuarioController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { registroSchema, publicRegistroSchema, loginSchema } = require("../schemas/usuarioSchema");
const router = express.Router();

// POST /usuarios/registro: Permitido para publico (se asigna rol Cliente) y Administradores.
router.post(
    "/registro",
    validar(publicRegistroSchema),
    usuarioController.registrar
);

router.post("/login", validar(loginSchema), usuarioController.iniciarSesion);

module.exports = router;