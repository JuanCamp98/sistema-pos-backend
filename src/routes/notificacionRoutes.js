const express = require("express");
const notificacionController = require("../controllers/notificacionController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");

const router = express.Router();
const verificarPersonal = verificarRol(["Administrador", "Cajero"]);

router.use(verificarToken, verificarPersonal);
router.get("/", notificacionController.listar);
router.patch("/:id/leida", notificacionController.marcarComoLeida);

module.exports = router;
