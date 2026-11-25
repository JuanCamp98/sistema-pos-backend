const express = require("express");
const movimientoStockController = require("../controllers/movimientoStockController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const {
    registrarMovimientoSchema,
    ajustarStockSchema,
    configuracionStockSchema
} = require("../schemas/movimientoStockSchema");
const router = express.Router();
const soloAdministrador = [verificarToken, verificarRol(["Administrador"])];
const personalInterno = [verificarToken, verificarRol(["Administrador", "Cajero"])];

router.post("/", ...soloAdministrador, validar(registrarMovimientoSchema), movimientoStockController.registrar);

router.get("/configuracion", ...soloAdministrador, movimientoStockController.obtenerConfiguracion);
router.put("/configuracion", ...soloAdministrador, validar(configuracionStockSchema), movimientoStockController.guardarConfiguracion);
router.get("/resumen", ...soloAdministrador, movimientoStockController.resumenStockBajo);
router.get("/vista-previa", ...soloAdministrador, movimientoStockController.vistaPreviaStockBajo);

router.get("/", ...personalInterno, movimientoStockController.listar);
router.get("/movimientos", ...personalInterno, movimientoStockController.listarMovimientos);
router.get("/producto/:productoId", ...personalInterno, movimientoStockController.listarPorProducto);
router.patch("/:productoId", ...soloAdministrador, validar(ajustarStockSchema), movimientoStockController.ajustar);

module.exports = router;
