const express = require("express");
const ventaController = require("../controllers/ventaController");
const verificarToken = require("../middlewares/verificarToken");
const router = express.Router();

router.post("/", verificarToken, ventaController.registrar);
router.get("/", verificarToken, ventaController.listar);
router.get("/:id", verificarToken, ventaController.obtenerPorId);

module.exports = router;