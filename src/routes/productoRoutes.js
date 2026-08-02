const express = require("express");
const productoController = require("../controllers/productoController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const router = express.Router();

router.post("/", verificarToken, verificarRol(["Administrador"]), productoController.crear);
router.get("/", verificarToken, productoController.listar);
router.get("/:id", verificarToken, productoController.obtenerPorId);
router.put("/:id", verificarToken, verificarRol(["Administrador"]), productoController.actualizar);
router.delete("/:id", verificarToken, verificarRol(["Administrador"]), productoController.eliminar);

module.exports = router;