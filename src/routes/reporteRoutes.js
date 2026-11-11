const express = require("express");
const reporteController = require("../controllers/reporteController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");

const router = express.Router();
const soloAdministrador = [verificarToken, verificarRol(["Administrador"])];

router.get("/ventas.pdf", ...soloAdministrador, reporteController.exportarVentasPdf);
router.get("/ventas.xlsx", ...soloAdministrador, reporteController.exportarVentasExcel);
router.get("/stock.pdf", ...soloAdministrador, reporteController.exportarStockPdf);
router.get("/stock.xlsx", ...soloAdministrador, reporteController.exportarStockExcel);

module.exports = router;
