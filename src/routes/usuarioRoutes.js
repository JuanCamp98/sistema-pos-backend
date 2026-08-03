const express = require("express");
const usuarioController = require("../controllers/usuarioController");
const validar = require("../middlewares/validar");
const { registroSchema, loginSchema } = require("../schemas/usuarioSchema");
const router = express.Router();

router.post("/registro", validar(registroSchema), usuarioController.registrar);
router.post("/login", validar(loginSchema), usuarioController.iniciarSesion);

module.exports = router;