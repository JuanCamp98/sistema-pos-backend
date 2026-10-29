const express = require("express");
const promocionController = require("../controllers/promocionController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { crearPromocionSchema, actualizarPromocionSchema } = require("../schemas/promocionSchema");

const router = express.Router();

// Publico: el catalogo de clientes solo necesita promociones ya filtradas por vigencia.
router.get("/vigentes", promocionController.listarVigentes);
router.get("/", verificarToken, verificarRol(["Administrador"]), promocionController.listar);
router.get("/:id", verificarToken, verificarRol(["Administrador"]), promocionController.obtenerPorId);
router.post("/", verificarToken, verificarRol(["Administrador"]), validar(crearPromocionSchema), promocionController.crear);
router.put("/:id", verificarToken, verificarRol(["Administrador"]), validar(actualizarPromocionSchema), promocionController.actualizar);
router.delete("/:id", verificarToken, verificarRol(["Administrador"]), promocionController.eliminar);

module.exports = router;
