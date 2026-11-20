const crypto = require("node:crypto");

// Genera las cabeceras de firma que Mercado Pago envía en sus webhooks.
// Se usa solo en pruebas; si no hay MP_WEBHOOK_SECRET devuelve un objeto vacío.
function firmarWebhook(url) {
    const secreto = process.env.MP_WEBHOOK_SECRET;
    if (!secreto) return {};

    const dataId = url.searchParams.get("data.id");
    if (!dataId) return {};

    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = crypto.randomUUID();
    const manifiesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");

    return {
        "x-signature": `ts=${ts},v1=${v1}`,
        "x-request-id": requestId
    };
}

function cabecerasWebhook(ruta, baseUrl) {
    if (!ruta.includes("/webhook/mercadopago")) return {};
    return firmarWebhook(new URL(ruta, baseUrl));
}

module.exports = { firmarWebhook, cabecerasWebhook };
