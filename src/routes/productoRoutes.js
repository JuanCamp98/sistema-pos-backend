const express = require("express");
const productoController = require("../controllers/productoController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { productoSchema, actualizarProductoSchema } = require("../schemas/productoSchema");
const router = express.Router();

// GET publico para que el cliente anonimo pueda ver el catalogo.
router.get("/", productoController.listar);
router.get("/:id", productoController.obtenerPorId);

// CRUD solo para Administrador.
router.post("/", verificarToken, verificarRol(["Administrador"]), validar(productoSchema), productoController.crear);
router.put("/:id", verificarToken, verificarRol(["Administrador"]), validar(actualizarProductoSchema), productoController.actualizar);
router.delete("/:id", verificarToken, verificarRol(["Administrador"]), productoController.eliminar);

module.exports = router;
