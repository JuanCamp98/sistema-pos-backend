const crypto = require("node:crypto");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

const API_URL = "https://api.mercadopago.com/v1/orders";

function obtenerConfiguracion() {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    const externalPosId = process.env.MP_QR_EXTERNAL_POS_ID;

    if (!accessToken || !externalPosId) {
        throw new ErrorPersonalizado(
            "Falta configurar MP_ACCESS_TOKEN o MP_QR_EXTERNAL_POS_ID",
            503
        );
    }

    return { accessToken, externalPosId };
}

async function solicitarMercadoPago(url, opciones) {
    const { accessToken } = obtenerConfiguracion();
    const respuesta = await fetch(url, {
        ...opciones,
        headers: {
            Authorization: "Bearer " + accessToken,
            Accept: "application/json",
            "Content-Type": "application/json",
            ...opciones.headers
        }
    });

    const datos = await respuesta.json().catch(function () { return {}; });
    if (!respuesta.ok) {
        console.error("Error de Mercado Pago", respuesta.status, JSON.stringify(datos, null, 2));
        const detalle = [
            datos.message || datos.error,
            ...(Array.isArray(datos.cause)
                ? datos.cause.map(function (causa) { return causa.description || causa.message; })
                : []),
            ...(Array.isArray(datos.errors)
                ? datos.errors.map(function (error) {
                    const detalles = Array.isArray(error.details)
                        ? error.details.map(function (item) {
                            if (typeof item === "string") return item;
                            return item.description || item.message || JSON.stringify(item);
                        }).join(", ")
                        : "";
                    return [error.message, detalles].filter(Boolean).join(": ");
                })
                : [])
        ].filter(Boolean).join(". ");
        throw new ErrorPersonalizado(
            "Mercado Pago rechazó la operación (HTTP " + respuesta.status + ")" +
                (detalle ? ": " + detalle : ""),
            502
        );
    }

    return datos;
}

function aMontoApi(valor) {
    return Number(valor).toFixed(2);
}

async function crearQrDinamico(venta) {
    const { externalPosId } = obtenerConfiguracion();
    const total = aMontoApi(venta.total);
    const items = venta.detalles.map(function (detalle) {
        return {
            title: detalle.producto.nombre.slice(0, 120),
            unit_price: aMontoApi(detalle.precioUnitario),
            quantity: detalle.cantidad,
            unit_measure: "unit"
        };
    });

    const orden = await solicitarMercadoPago(API_URL, {
        method: "POST",
        headers: {
            "X-Idempotency-Key": venta.id
        },
        body: JSON.stringify({
            type: "qr",
            total_amount: total,
            description: "Venta POS " + venta.codigoComprobante,
            external_reference: venta.id,
            expiration_time: "PT15M",
            config: {
                qr: {
                    external_pos_id: externalPosId,
                    mode: "dynamic"
                }
            },
            transactions: {
                payments: [{ amount: total }]
            },
            items: items
        })
    });

    const qrData = orden.type_response?.qr_data;
    if (!orden.id || !qrData) {
        console.error("Respuesta QR incompleta de Mercado Pago", orden);
        throw new ErrorPersonalizado("Mercado Pago no devolvió los datos del QR", 502);
    }

    return {
        orderId: orden.id,
        qrData: qrData,
        expiresAt: orden.expiration_time || null,
        status: orden.status
    };
}

async function obtenerOrden(orderId) {
    return solicitarMercadoPago(API_URL + "/" + encodeURIComponent(orderId), {
        method: "GET"
    });
}

async function cancelarOrden(orderId, ventaId) {
    return solicitarMercadoPago(API_URL + "/" + encodeURIComponent(orderId) + "/cancel", {
        method: "POST",
        headers: {
            "X-Idempotency-Key": crypto.createHash("sha256").update("cancel:" + ventaId).digest("hex")
        },
        body: JSON.stringify({})
    });
}

module.exports = {
    crearQrDinamico,
    obtenerOrden,
    cancelarOrden
};