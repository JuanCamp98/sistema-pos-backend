const express = require("express");
const retiroController = require("../controllers/retiroController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { configuracionRetiroSchema } = require("../schemas/retiroSchema");

const router = express.Router();

router.get("/disponibilidad", retiroController.disponibilidad);
router.get(
    "/configuracion",
    verificarToken,
    verificarRol(["Administrador"]),
    retiroController.obtenerConfiguracion
);
router.put(
    "/configuracion",
    verificarToken,
    verificarRol(["Administrador"]),
    validar(configuracionRetiroSchema),
    retiroController.guardarConfiguracion
);

module.exports = router;
