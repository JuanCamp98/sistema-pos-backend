const express = require("express");
const ventaController = require("../controllers/ventaController");
const verificarToken = require("../middlewares/verificarToken");
const intentarAutenticar = require("../middlewares/intentarAutenticar");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const {
    registrarVentaSchema,
    cobrarVentaSchema,
    cancelarVentaSchema,
    listarVentasQuerySchema
} = require("../schemas/ventaSchema");
const router = express.Router();

// POST /ventas: publico para cliente anonimo, pero si hay token lo usa.
// El controller detecta si req.usuario existe para setear usuarioId.
router.post(
    "/",
    intentarAutenticar,
    validar(registrarVentaSchema),
    ventaController.registrar
);

// GET /ventas: solo Cajero o Administrador. Acepta filtros ?estado= y paginacion.
router.get(
    "/",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    ventaController.listar
);

// GET /ventas/comprobante/:codigo: publico para reimprimir.
// Va antes de /:id para que Express no matchee "comprobante" como id.
router.get(
    "/comprobante/:codigo",
    ventaController.buscarPorComprobante
);

// GET /ventas/:id: solo Cajero o Administrador.
router.get(
    "/:id",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    ventaController.obtenerPorId
);

// PATCH /ventas/:id/cobrar: solo Cajero o Administrador.
router.patch(
    "/:id/cobrar",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    validar(cobrarVentaSchema),
    ventaController.cobrar
);

// PATCH /ventas/:id/cancelar: cualquiera puede cancelar una PENDIENTE
// (cliente anonimo con el id o usuario autenticado).
router.patch(
    "/:id/cancelar",
    intentarAutenticar,
    validar(cancelarVentaSchema),
    ventaController.cancelar
);

module.exports = router;