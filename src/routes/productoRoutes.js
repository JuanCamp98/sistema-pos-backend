const express = require("express");
const productoController = require("../controllers/productoController");
const router = express.Router();

router.post("/", productoController.crear);
router.get("/", productoController.listar);
router.get("/:id", productoController.obtenerPorId);
router.put("/:id", productoController.actualizar);
router.delete("/:id", productoController.eliminar);

module.exports = router;