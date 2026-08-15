const express = require("express");
const movimientoStockController = require("../controllers/movimientoStockController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const {
    registrarMovimientoSchema,
    ajustarStockSchema
} = require("../schemas/movimientoStockSchema");
const router = express.Router();

router.post("/", verificarToken, verificarRol(["Administrador"]), validar(registrarMovimientoSchema), movimientoStockController.registrar);
router.get("/", verificarToken, movimientoStockController.listar);
router.get("/movimientos", verificarToken, movimientoStockController.listarMovimientos);
router.get("/producto/:productoId", verificarToken, movimientoStockController.listarPorProducto);
router.patch("/:productoId", verificarToken, verificarRol(["Administrador"]), validar(ajustarStockSchema), movimientoStockController.ajustar);

module.exports = router;
