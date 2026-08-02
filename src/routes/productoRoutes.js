const express = require("express");
const productoController = require("../controllers/productoController");
const verificarToken = require("../middlewares/verificarToken");
const router = express.Router();

router.post("/", verificarToken, productoController.crear);
router.get("/", verificarToken, productoController.listar);
router.get("/:id", verificarToken, productoController.obtenerPorId);
router.put("/:id", verificarToken, productoController.actualizar);
router.delete("/:id", verificarToken, productoController.eliminar);

module.exports = router;