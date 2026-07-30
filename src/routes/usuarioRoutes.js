// Rutas relacionadas a usuarios
const express = require("express");
const usuarioController = require("../controllers/usuarioController");

const router = express.Router();

router.post("/registro", usuarioController.registrar);
router.post("/login", usuarioController.iniciarSesion);

module.exports = router;