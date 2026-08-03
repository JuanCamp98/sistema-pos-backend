const express = require("express");
const ventaController = require("../controllers/ventaController");
const verificarToken = require("../middlewares/verificarToken");
const validar = require("../middlewares/validar");
const { registrarVentaSchema } = require("../schemas/ventaSchema");
const router = express.Router();

router.post("/", verificarToken, validar(registrarVentaSchema), ventaController.registrar);
router.get("/", verificarToken, ventaController.listar);
router.get("/:id", verificarToken, ventaController.obtenerPorId);

module.exports = router;