const express = require("express");
const productoController = require("../controllers/productoController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const subirImagenProducto = require("../middlewares/subirImagenProducto");
const { productoSchema, actualizarProductoSchema } = require("../schemas/productoSchema");
const router = express.Router();

// GET publico para que el cliente anonimo pueda ver el catalogo.
router.get("/", productoController.listar);
router.get("/:id", productoController.obtenerPorId);

// CRUD solo para Administrador.
router.post("/", verificarToken, verificarRol(["Administrador"]), subirImagenProducto, prepararDatosFormulario, validar(productoSchema), productoController.crear);
router.put("/:id", verificarToken, verificarRol(["Administrador"]), subirImagenProducto, prepararDatosFormulario, validar(actualizarProductoSchema), productoController.actualizar);
router.delete("/:id", verificarToken, verificarRol(["Administrador"]), productoController.eliminar);

function prepararDatosFormulario(req, res, next) {
    if (req.is("multipart/form-data")) {
        req.body.precio = Number(req.body.precio);
        req.body.stock = Number(req.body.stock);
    }
    next();
}

module.exports = router;
