const express = require("express");
const ventaController = require("../controllers/ventaController");
const verificarToken = require("../middlewares/verificarToken");
const intentarAutenticar = require("../middlewares/intentarAutenticar");
const verificarWebhookMercadoPago = require("../middlewares/verificarWebhookMercadoPago");
const verificarRol = require("../middlewares/verificarRol");
const validar = require("../middlewares/validar");
const { limitarPeticiones } = require("../middlewares/limitarPeticiones");
const {
    registrarVentaSchema,
    ventaDirectaSchema,
    cobrarVentaSchema,
    cancelarVentaSchema,
    renombrarVentaSchema,
    listarVentasQuerySchema
} = require("../schemas/ventaSchema");
const router = express.Router();

const HORA_MS = 60 * 60 * 1000;

// Evita usar el sistema de comprobantes para inundar de correos a un mismo
// destinatario. Si la venta no informa email, el limite no se aplica.
function claveDestinatario(req) {
    const email = typeof req.body?.cliente?.email === "string"
        ? req.body.cliente.email
        : typeof req.body?.clienteEmail === "string"
            ? req.body.clienteEmail
            : "";
    const normalizado = email.trim().toLowerCase();
    return normalizado ? "comprobante|" + normalizado : null;
}

const limitarComprobantes = limitarPeticiones({
    limite: 20,
    ventanaMs: HORA_MS,
    clave: claveDestinatario,
    mensaje: "Se enviaron demasiados comprobantes a ese correo. Esperá unos minutos."
});

// POST /ventas: publico para cliente anonimo, pero si hay token lo usa.
// El controller detecta si req.usuario existe para setear usuarioId.
router.post(
    "/",
    limitarPeticiones({
        limite: 60,
        ventanaMs: 10 * 60 * 1000,
        mensaje: "Demasiadas compras en poco tiempo. Esperá unos minutos."
    }),
    limitarComprobantes,
    intentarAutenticar,
    validar(registrarVentaSchema),
    ventaController.registrar
);

// POST /ventas/directa: solo Cajero o Administrador.
// Permite registrar una venta directa de forma atómica desde el flujo de venta rápida.
router.post(
    "/directa",
    limitarComprobantes,
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    validar(ventaDirectaSchema),
    ventaController.registrarDirecta
);

// GET /ventas: Cajero, Administrador o Cliente autenticado. Acepta filtros ?estado= y paginacion.
router.get(
    "/",
    verificarToken,
    verificarRol(["Cajero", "Administrador", "Cliente"]),
    ventaController.listar
);

// GET /ventas/comprobante/:codigo: requiere sesion propietaria o el token de
// acceso entregado al comprador al confirmar la compra.
// Va antes de /:id para que Express no matchee "comprobante" como id.
router.get(
    "/comprobante/:codigo/pdf",
    limitarPeticiones({ limite: 120, ventanaMs: 60 * 1000 }),
    intentarAutenticar,
    ventaController.descargarComprobantePdfPorCodigo
);

router.get(
    "/comprobante/:codigo",
    limitarPeticiones({ limite: 120, ventanaMs: 60 * 1000 }),
    intentarAutenticar,
    ventaController.buscarPorComprobante
);

// Mercado Pago envía notificaciones sin sesión; el estado se verifica consultando su API.
router.post(
    "/webhook/mercadopago",
    limitarPeticiones({ limite: 120, ventanaMs: 60 * 1000 }),
    verificarWebhookMercadoPago,
    ventaController.webhookMercadoPago
);

// El cajero consulta el estado confirmado por Mercado Pago mientras se muestra el QR.
router.get(
    "/:id/pago-qr",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    ventaController.consultarEstadoQr
);

// GET /ventas/:id/comprobante.pdf: descarga autenticada con las mismas reglas de acceso al detalle.
router.get(
    "/:id/comprobante.pdf",
    verificarToken,
    verificarRol(["Cajero", "Administrador", "Cliente"]),
    ventaController.descargarComprobantePdf
);

// PATCH /ventas/:id/nombre: el cliente solo puede renombrar una compra propia.
router.patch(
    "/:id/nombre",
    verificarToken,
    verificarRol(["Cliente"]),
    validar(renombrarVentaSchema),
    ventaController.renombrar
);

// GET /ventas/:id: Cajero, Administrador o Cliente autenticado (solo su propia compra).
router.get(
    "/:id",
    verificarToken,
    verificarRol(["Cajero", "Administrador", "Cliente"]),
    ventaController.obtenerPorId
);

// PATCH /ventas/:id/cobrar: solo Cajero o Administrador autenticado.
router.patch(
    "/:id/cobrar",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    validar(cobrarVentaSchema),
    ventaController.cobrar
);

// PATCH /ventas/:id/cancelar: Administrador/Cajero o el Cliente propietario.
// Una compra anonima puede cancelarse presentando el token de su comprobante.
router.patch(
    "/:id/cancelar",
    intentarAutenticar,
    validar(cancelarVentaSchema),
    ventaController.cancelar
);

// PATCH /ventas/:id/cancelar-cliente: un cliente autenticado solo cancela compras propias.
router.patch(
    "/:id/cancelar-cliente",
    verificarToken,
    verificarRol(["Cliente"]),
    ventaController.cancelarCliente
);

// Flujo de preparación y retiro: no modifica ni consulta el estado de Mercado Pago.
router.patch(
    "/:id/preparar",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    ventaController.preparar
);

router.patch(
    "/:id/lista-para-retirar",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    ventaController.listaParaRetirar
);

router.patch(
    "/:id/retirar",
    verificarToken,
    verificarRol(["Cajero", "Administrador"]),
    ventaController.retirar
);

module.exports = router;
