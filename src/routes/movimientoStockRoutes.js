const express = require("express");
const movimientoStockController = require("../controllers/movimientoStockController");
const verificarToken = require("../middlewares/verificarToken");
const router = express.Router();

router.post("/", verificarToken, movimientoStockController.registrar);
router.get("/", verificarToken, movimientoStockController.listar);
router.get("/producto/:productoId", verificarToken, movimientoStockController.listarPorProducto);

module.exports = router;