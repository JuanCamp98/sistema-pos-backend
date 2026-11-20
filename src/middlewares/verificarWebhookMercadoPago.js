const ErrorPersonalizado = require("../utils/errorPersonalizado");
const crypto = require("node:crypto");

function compararSeguro(a, b) {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");
    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

function parsearFirma(encabezado) {
    const partes = {};
    for (const fragmento of String(encabezado).split(",")) {
        const indice = fragmento.indexOf("=");
        if (indice === -1) continue;
        const nombre = fragmento.slice(0, indice).trim();
        const valor = fragmento.slice(indice + 1).trim();
        if (nombre) partes[nombre] = valor;
    }
    return partes;
}

function verificarFirma(req, dataId) {
    const secreto = process.env.MP_WEBHOOK_SECRET;
    // Sin secreto configurado se mantiene el comportamiento anterior: el estado
    // real igualmente se revalida contra la API de Mercado Pago.
    if (!secreto) return true;

    const encabezadoFirma = req.get("x-signature");
    const requestId = req.get("x-request-id");
    if (!encabezadoFirma || !requestId) return false;

    const { ts, v1 } = parsearFirma(encabezadoFirma);
    if (!ts || !v1) return false;

    const manifiesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const esperado = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
    return compararSeguro(esperado, v1);
}

function verificarWebhookMercadoPago(req, res, next) {
    const dataId = req.query["data.id"] || req.body?.data?.id;
    if (typeof dataId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(dataId)) {
        return next(new ErrorPersonalizado("Identificador de orden de Mercado Pago inválido", 400));
    }

    if (!verificarFirma(req, dataId)) {
        return next(new ErrorPersonalizado("Firma de webhook inválida", 401));
    }

    req.mercadoPagoOrderId = dataId;
    next();
}

module.exports = verificarWebhookMercadoPago;
