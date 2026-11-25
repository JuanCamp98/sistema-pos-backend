require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

describe("Sincronización de órdenes QR de Mercado Pago", () => {
    let server;
    let baseUrl;
    let originalFetch;
    let originalAccessToken;
    let originalPosId;
    let usuario;
    let categoria;
    let producto;
    let ordenes = new Map();
    let cantidadCreaciones = 0;
    let idsVentas = [];
    let token;

    function solicitar(ruta, opciones = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(ruta, baseUrl);
            const peticion = http.request(url, {
                method: opciones.method || "GET",
                headers: {
                    ...(opciones.body ? { "Content-Type": "application/json" } : {}),
                    ...(opciones.token ? { Authorization: "Bearer " + opciones.token } : {}),
                    ...(opciones.headers || {})
                }
            }, (respuesta) => {
                const bloques = [];
                respuesta.on("data", (bloque) => bloques.push(bloque));
                respuesta.on("end", () => {
                    const texto = Buffer.concat(bloques).toString("utf8");
                    resolve({
                        status: respuesta.statusCode,
                        datos: texto === "OK" ? texto : texto ? JSON.parse(texto) : null
                    });
                });
            });
            peticion.on("error", reject);
            if (opciones.body) peticion.write(JSON.stringify(opciones.body));
            peticion.end();
        });
    }

    async function crearVentaQr() {
        const resultado = await solicitar("/ventas/directa", {
            method: "POST",
            token,
            body: {
                items: [{ productoId: producto.id, cantidad: 1 }],
                metodoPago: "MercadoPago",
                cobrar: false
            }
        });
        assert.equal(resultado.status, 201);
        idsVentas.push(resultado.datos.venta.id);
        return resultado.datos.venta;
    }

    before(async () => {
        originalFetch = global.fetch;
        originalAccessToken = process.env.MP_ACCESS_TOKEN;
        originalPosId = process.env.MP_QR_EXTERNAL_POS_ID;
        process.env.MP_ACCESS_TOKEN = "test-access-token";
        process.env.MP_QR_EXTERNAL_POS_ID = "test-pos";

        global.fetch = async function (url, opciones) {
            const direccion = new URL(url);
            if (opciones.method === "POST" && direccion.pathname === "/v1/orders") {
                cantidadCreaciones += 1;
                const solicitud = JSON.parse(opciones.body);
                const orden = {
                    id: "order_test_" + cantidadCreaciones,
                    type: "qr",
                    external_reference: solicitud.external_reference,
                    total_amount: solicitud.total_amount,
                    currency: "ARS",
                    status: "created",
                    status_detail: "created",
                    expiration_time: "2026-11-09T12:15:00Z",
                    type_response: { qr_data: "qr-test-data" }
                };
                ordenes.set(orden.id, orden);
                return { ok: true, status: 201, json: async () => orden };
            }

            const id = decodeURIComponent(direccion.pathname.split("/").pop());
            const orden = ordenes.get(id);
            return orden
                ? { ok: true, status: 200, json: async () => orden }
                : { ok: false, status: 404, json: async () => ({ message: "Order not found" }) };
        };

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = "http://127.0.0.1:" + server.address().port;

        const rol = await prisma.rol.upsert({
            where: { nombre: "Administrador" },
            update: {},
            create: { nombre: "Administrador" }
        });
        usuario = await prisma.usuario.create({
            data: {
                nombre: "Test QR",
                apellido: "Mercado Pago",
                dni: String(Date.now()).slice(-8),
                email: "qr-test-" + Date.now() + "@pos.local",
                contrasena: "hashed-password",
                rolId: rol.id
            }
        });
        token = jwt.sign(
            { id: usuario.id, rol: "Administrador" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        categoria = await prisma.categoria.create({
            data: { nombre: "Test QR " + Date.now() }
        });
        const tipoProducto = await prisma.tipoProducto.upsert({
            where: { nombre: "General" },
            update: {},
            create: { nombre: "General" }
        });
        producto = await prisma.producto.create({
            data: {
                nombre: "Producto Test QR " + Date.now(),
                precio: 125,
                stock: 10,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });
    });

    after(async () => {
        global.fetch = originalFetch;
        if (originalAccessToken === undefined) delete process.env.MP_ACCESS_TOKEN;
        else process.env.MP_ACCESS_TOKEN = originalAccessToken;
        if (originalPosId === undefined) delete process.env.MP_QR_EXTERNAL_POS_ID;
        else process.env.MP_QR_EXTERNAL_POS_ID = originalPosId;

        if (idsVentas.length) {
            await prisma.movimientoStock.deleteMany({ where: { referenciaId: { in: idsVentas } } });
            await prisma.detalleVenta.deleteMany({ where: { ventaId: { in: idsVentas } } });
            await prisma.venta.deleteMany({ where: { id: { in: idsVentas } } });
        }
        if (producto) await prisma.producto.deleteMany({ where: { id: producto.id } });
        if (categoria) await prisma.categoria.deleteMany({ where: { id: categoria.id } });
        if (usuario) await prisma.usuario.deleteMany({ where: { id: usuario.id } });
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    test("crea una sola orden con cobrar=false, confirma, expira y procesa reembolsos idempotentemente", async () => {
        const ventaPagada = await crearVentaQr();
        const codigoOriginal = ventaPagada.codigoComprobante;
        const totalOriginal = Number(ventaPagada.total);
        const ordenPagada = ordenes.get(ventaPagada.mpOrderId);

        assert.equal(cantidadCreaciones, 1);
        assert.equal(ventaPagada.estado, "PENDIENTE");
        assert.equal(ventaPagada.mpQrData, "qr-test-data");

        ordenPagada.status = "processed";
        ordenPagada.status_detail = "accredited";
        const webhookPagado = await solicitar("/ventas/webhook/mercadopago?data.id=" + ordenPagada.id, {
            method: "POST"
        });
        assert.equal(webhookPagado.status, 200);

        const pagada = await prisma.venta.findUnique({ where: { id: ventaPagada.id } });
        assert.equal(pagada.estado, "COBRADA");
        assert.equal(pagada.mpOrderStatusDetail, "accredited");
        assert.equal(pagada.codigoComprobante, codigoOriginal);
        assert.equal(Number(pagada.total), totalOriginal);

        const stockTrasPago = await prisma.producto.findUnique({ where: { id: producto.id } });
        assert.equal(stockTrasPago.stock, 9);
        assert.equal(stockTrasPago.stockReservado, 0);

        const reintento = await solicitar("/ventas/webhook/mercadopago?data.id=" + ordenPagada.id, {
            method: "POST"
        });
        assert.equal(reintento.status, 200);
        const stockTrasReintento = await prisma.producto.findUnique({ where: { id: producto.id } });
        assert.equal(stockTrasReintento.stock, 9);

        ordenPagada.status = "refunded";
        ordenPagada.status_detail = "refunded";
        const webhookReembolso = await solicitar("/ventas/webhook/mercadopago?data.id=" + ordenPagada.id, {
            method: "POST"
        });
        assert.equal(webhookReembolso.status, 200);
        const reembolsada = await prisma.venta.findUnique({ where: { id: ventaPagada.id } });
        assert.equal(reembolsada.estado, "REEMBOLSADA");
        assert.equal(reembolsada.codigoComprobante, codigoOriginal);
        assert.equal(Number(reembolsada.total), totalOriginal);

        const ventaExpirada = await crearVentaQr();
        const ordenExpirada = ordenes.get(ventaExpirada.mpOrderId);
        ordenExpirada.status = "expired";
        ordenExpirada.status_detail = "expired";
        const webhookExpirado = await solicitar("/ventas/webhook/mercadopago?data.id=" + ordenExpirada.id, {
            method: "POST"
        });
        assert.equal(webhookExpirado.status, 200);
        const expirada = await prisma.venta.findUnique({ where: { id: ventaExpirada.id } });
        assert.equal(expirada.estado, "CANCELADA");
        assert.equal(expirada.mpOrderStatus, "expired");

        const stockTrasVencimiento = await prisma.producto.findUnique({ where: { id: producto.id } });
        assert.equal(stockTrasVencimiento.stock, 9);
        assert.equal(stockTrasVencimiento.stockReservado, 0);

        const ventaConOrdenInvalida = await crearVentaQr();
        const ordenInvalida = ordenes.get(ventaConOrdenInvalida.mpOrderId);
        const referenciaOriginal = ordenInvalida.external_reference;
        ordenInvalida.external_reference = "venta-ajena";
        const referenciaRechazada = await solicitar("/ventas/webhook/mercadopago?data.id=" + ordenInvalida.id, {
            method: "POST"
        });
        assert.equal(referenciaRechazada.status, 409);

        ordenInvalida.external_reference = referenciaOriginal;
        ordenInvalida.total_amount = "1.00";
        const importeRechazado = await solicitar("/ventas/webhook/mercadopago?data.id=" + ordenInvalida.id, {
            method: "POST"
        });
        assert.equal(importeRechazado.status, 409);
        const siguePendiente = await prisma.venta.findUnique({ where: { id: ventaConOrdenInvalida.id } });
        assert.equal(siguePendiente.estado, "PENDIENTE");

        ordenInvalida.total_amount = String(ventaConOrdenInvalida.total);
        ordenInvalida.status = "canceled";
        const webhookCancelado = await solicitar("/ventas/webhook/mercadopago?data.id=" + ordenInvalida.id, {
            method: "POST"
        });
        assert.equal(webhookCancelado.status, 200);
        const cancelada = await prisma.venta.findUnique({ where: { id: ventaConOrdenInvalida.id } });
        assert.equal(cancelada.estado, "CANCELADA");
        assert.equal(cancelada.mpOrderStatus, "canceled");

        const creacionesAntes = cantidadCreaciones;
        const desconocida = await solicitar("/ventas/webhook/mercadopago?data.id=unknown_order", {
            method: "POST"
        });
        assert.equal(desconocida.status, 200);
        assert.equal(cantidadCreaciones, creacionesAntes);

        const invalida = await solicitar("/ventas/webhook/mercadopago?data.id=invalid%20order", {
            method: "POST"
        });
        assert.equal(invalida.status, 400);
    });
});
