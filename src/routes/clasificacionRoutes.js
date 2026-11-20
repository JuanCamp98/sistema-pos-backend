const express = require("express");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { nombreClasificacionSchema } = require("../schemas/clasificacionSchema");
const { crearControlador } = require("../controllers/clasificacionController");

function crearRutas(tipo) {
    const router = express.Router();
    const controller = crearControlador(tipo);
    // Solo se listan opciones activas, necesarias para el catalogo publico.
    router.get("/", controller.listar);
    // Crear, actualizar y desactivar sigue reservado a Administrador.
    router.post("/", verificarToken, verificarRol(["Administrador"]), validar(nombreClasificacionSchema), controller.crear);
    router.put("/:id", verificarToken, verificarRol(["Administrador"]), validar(nombreClasificacionSchema), controller.actualizar);
    router.delete("/:id", verificarToken, verificarRol(["Administrador"]), controller.desactivar);
    return router;
}

module.exports = crearRutas;
