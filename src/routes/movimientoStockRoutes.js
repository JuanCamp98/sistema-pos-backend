const express = require("express");
const movimientoStockController = require("../controllers/movimientoStockController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const router = express.Router();

router.post("/", verificarToken, verificarRol(["Administrador"]), movimientoStockController.registrar);
router.get("/", verificarToken, movimientoStockController.listar);
router.get("/producto/:productoId", verificarToken, movimientoStockController.listarPorProducto);

module.exports = router;