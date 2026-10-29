const express = require("express");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { nombreClasificacionSchema } = require("../schemas/clasificacionSchema");
const { crearControlador } = require("../controllers/clasificacionController");

function crearRutas(tipo) {
    const router = express.Router();
    const controller = crearControlador(tipo);
    router.use(verificarToken, verificarRol(["Administrador"]));
    router.get("/", controller.listar);
    router.post("/", validar(nombreClasificacionSchema), controller.crear);
    router.put("/:id", validar(nombreClasificacionSchema), controller.actualizar);
    router.delete("/:id", controller.desactivar);
    return router;
}

module.exports = crearRutas;
