const express = require("express");
const movimientoStockController = require("../controllers/movimientoStockController");
const router = express.Router();

router.post("/", movimientoStockController.registrar);
router.get("/", movimientoStockController.listar);
router.get("/producto/:productoId", movimientoStockController.listarPorProducto);

module.exports = router;