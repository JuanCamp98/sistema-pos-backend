const ErrorPersonalizado = require("../utils/errorPersonalizado");

function verificarWebhookMercadoPago(req, res, next) {
    const dataId = req.query["data.id"] || req.body?.data?.id;
    if (typeof dataId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(dataId)) {
        return next(new ErrorPersonalizado("Identificador de orden de Mercado Pago inválido", 400));
    }

    req.mercadoPagoOrderId = dataId;
    next();
}

module.exports = verificarWebhookMercadoPago;