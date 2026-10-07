const crypto = require("node:crypto");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

function verificarWebhookMercadoPago(req, res, next) {
    const secreto = process.env.MP_WEBHOOK_SECRET;
    if (!secreto) {
        return next(new ErrorPersonalizado("Falta configurar MP_WEBHOOK_SECRET", 503));
    }

    const firma = req.get("x-signature") || "";
    const requestId = req.get("x-request-id") || "";
    const dataId = req.query["data.id"] || req.body?.data?.id;
    const camposFirma = Object.fromEntries(firma.split(",").map(function (campo) {
        const [clave, ...valores] = campo.trim().split("=");
        return [clave, valores.join("=")];
    }));
    const timestamp = camposFirma.ts;
    const firmaRecibida = camposFirma.v1;

    if (!dataId || !requestId || !/^\d+$/.test(timestamp || "") || !/^[a-f\d]{64}$/i.test(firmaRecibida || "")) {
        return next(new ErrorPersonalizado("Firma de notificación de Mercado Pago inválida", 401));
    }

    const manifiesto = "id:" + String(dataId).toLowerCase() +
        ";request-id:" + requestId +
        ";ts:" + timestamp + ";";
    const firmaEsperada = crypto.createHmac("sha256", secreto).update(manifiesto).digest();
    const firmaRecibidaBuffer = Buffer.from(firmaRecibida, "hex");

    if (!crypto.timingSafeEqual(firmaEsperada, firmaRecibidaBuffer)) {
        return next(new ErrorPersonalizado("Firma de notificación de Mercado Pago inválida", 401));
    }

    next();
}

module.exports = verificarWebhookMercadoPago;