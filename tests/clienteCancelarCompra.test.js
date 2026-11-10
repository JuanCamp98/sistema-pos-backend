require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

describe("Cancelación de compras propias por clientes", () => {
    let server;
    let baseUrl;
    let cliente;
    let otroCliente;
    let administrador;
    let producto;
    let categoria;
    let tokenCliente;
    let tokenAdministrador;
    let ventas = [];
    let fetchOriginal;
    let accessTokenOriginal;
    let externalPosIdOriginal;
    let ordenes = new Map();
    const stockInicial = 20;
    const reservasIniciales = 0;

    async function solicitar(ruta, opciones = {}) {
        return new Promise((resolve, reject) => {
            const direccion = new URL(ruta, baseUrl);
            const peticion = http.request(direccion, {
                method: opciones.method || "GET",
                headers: {
                    ...(opciones.body ? { "Content-Type": "application/json" } : {}),
                    ...(opciones.token ? { Authorization: "Bearer " + opciones.token } : {})
                }
            }, (respuesta) => {
                const bloques = [];
                respuesta.setEncoding("utf8");
                respuesta.on("data", (bloque) => bloques.push(bloque));
                respuesta.on("end", () => {
                    const texto = bloques.join("");
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

    async function crearVenta({ usuario = cliente, estado = "PENDIENTE", cantidad = 1, conQr = false } = {}) {
        const idOrden = conQr ? "order_" + crypto.randomUUID() : null;
        const venta = await prisma.venta.create({
            data: {
                usuarioId: usuario?.id || null,
                clienteNombre: usuario?.nombre || "Cliente anónimo",
                clienteApellido: usuario?.apellido || "Prueba",
                clienteEmail: usuario?.email || null,
                codigoComprobante: "V-TEST-CANCEL-" + crypto.randomUUID(),
                estado,
                origen: "RAPIDA",
                metodoPago: conQr ? "Mercado Pago QR" : "Efectivo",
                total: 125 * cantidad,
                ...(idOrden && {
                    mpOrderId: idOrden,
                    mpOrderStatus: "created",
                    mpQrData: "qr-test-data"
                }),
                detalles: {
                    create: [{
                        productoId: producto.id,
                        cantidad,
                        precioUnitario: 125,
                        subtotal: 125 * cantidad
                    }]
                }
            }
        });
        ventas.push(venta);
        if (estado === "PENDIENTE") {
            await prisma.producto.update({
                where: { id: producto.id },
                data: { stockReservado: { increment: cantidad } }
            });
        }
        if (idOrden) {
            ordenes.set(idOrden, {
                id: idOrden,
                type: "qr",
                external_reference: venta.id,
                total_amount: String(venta.total),
                currency: "ARS",
                status: "created",
                status_detail: "created"
            });
            await prisma.venta.update({
                where: { id: venta.id },
                data: { mpOrderId: idOrden, mpOrderStatus: "created", mpQrData: "qr-test-data" }
            });
        }
        return venta;
    }

    async function obtenerProducto() {
        return prisma.producto.findUnique({ where: { id: producto.id } });
    }

    before(async () => {
        fetchOriginal = global.fetch;
        accessTokenOriginal = process.env.MP_ACCESS_TOKEN;
        externalPosIdOriginal = process.env.MP_QR_EXTERNAL_POS_ID;
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = "http://127.0.0.1:" + server.address().port;

        const [rolCliente, rolAdministrador] = await Promise.all([
            prisma.rol.upsert({
                where: { nombre: "Cliente" },
                update: {},
                create: { nombre: "Cliente" }
            }),
            prisma.rol.upsert({
                where: { nombre: "Administrador" },
                update: {},
                create: { nombre: "Administrador" }
            })
        ]);
        const marca = Date.now().toString();
        const crearUsuario = (sufijo, rolId) => prisma.usuario.create({
            data: {
                nombre: "Cliente",
                apellido: "Cancelación",
                dni: marca.slice(-7) + sufijo,
                email: "cancelar-" + sufijo + "-" + marca + "@pos.local",
                contrasena: "hashed-password",
                rolId
            }
        });
        [cliente, otroCliente, administrador] = await Promise.all([
            crearUsuario("1", rolCliente.id),
            crearUsuario("2", rolCliente.id),
            crearUsuario("3", rolAdministrador.id)
        ]);

        tokenCliente = jwt.sign({ id: cliente.id, rol: "Cliente" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        tokenAdministrador = jwt.sign({ id: administrador.id, rol: "Administrador" }, process.env.JWT_SECRET, { expiresIn: "1h" });

        categoria = await prisma.categoria.create({ data: { nombre: "Test Cancelación " + marca } });
        const tipoProducto = await prisma.tipoProducto.upsert({
            where: { nombre: "General" },
            update: {},
            create: { nombre: "General" }
        });
        producto = await prisma.producto.create({
            data: {
                nombre: "Producto Test Cancelación " + marca,
                precio: 125,
                stock: stockInicial,
                stockReservado: reservasIniciales,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });
    });

    after(async () => {
        global.fetch = fetchOriginal;
        if (accessTokenOriginal === undefined) delete process.env.MP_ACCESS_TOKEN;
        else process.env.MP_ACCESS_TOKEN = accessTokenOriginal;
        if (externalPosIdOriginal === undefined) delete process.env.MP_QR_EXTERNAL_POS_ID;
        else process.env.MP_QR_EXTERNAL_POS_ID = externalPosIdOriginal;
        const ids = ventas.map((venta) => venta.id);
        if (ids.length) {
            await prisma.movimientoStock.deleteMany({ where: { referenciaId: { in: ids } } });
            await prisma.detalleVenta.deleteMany({ where: { ventaId: { in: ids } } });
            await prisma.venta.deleteMany({ where: { id: { in: ids } } });
        }
        if (producto) {
            await prisma.producto.update({
                where: { id: producto.id },
                data: { stock: stockInicial, stockReservado: reservasIniciales }
            });
            await prisma.producto.delete({ where: { id: producto.id } });
        }
        if (categoria) await prisma.categoria.delete({ where: { id: categoria.id } });
        if (cliente) await prisma.usuario.delete({ where: { id: cliente.id } });
        if (otroCliente) await prisma.usuario.delete({ where: { id: otroCliente.id } });
        if (administrador) await prisma.usuario.delete({ where: { id: administrador.id } });
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    test("exige autenticación y cancela una compra propia liberando la reserva una sola vez", async () => {
        const venta = await crearVenta({ cantidad: 2 });
        const codigoOriginal = venta.codigoComprobante;
        const totalOriginal = Number(venta.total);
        assert.equal((await obtenerProducto()).stockReservado, 2);

        const sinToken = await solicitar("/ventas/" + venta.id + "/cancelar-cliente", {
            method: "PATCH",
            body: {}
        });
        assert.equal(sinToken.status, 401);

        const cancelada = await solicitar("/ventas/" + venta.id + "/cancelar-cliente", {
            method: "PATCH",
            token: tokenCliente,
            body: { usuarioId: otroCliente.id }
        });
        assert.equal(cancelada.status, 200);
        assert.equal(cancelada.datos.venta.estado, "CANCELADA");
        assert.equal(cancelada.datos.venta.codigoComprobante, codigoOriginal);
        assert.equal(Number(cancelada.datos.venta.total), totalOriginal);
        assert.equal((await obtenerProducto()).stockReservado, 0);

        const repetida = await solicitar("/ventas/" + venta.id + "/cancelar-cliente", {
            method: "PATCH",
            token: tokenCliente,
            body: {}
        });
        assert.equal(repetida.status, 409);
        assert.equal((await obtenerProducto()).stockReservado, 0);
    });

    test("no permite cancelar compras ajenas, anónimas ni ya cobradas", async () => {
        const ajena = await crearVenta({ usuario: otroCliente });
        const anonima = await crearVenta({ usuario: null });
        const cobrada = await crearVenta({ estado: "COBRADA" });
        const reservaEsperada = 2;

        const rechazadaAjena = await solicitar("/ventas/" + ajena.id + "/cancelar-cliente", {
            method: "PATCH",
            token: tokenCliente,
            body: {}
        });
        const rechazadaAnonima = await solicitar("/ventas/" + anonima.id + "/cancelar-cliente", {
            method: "PATCH",
            token: tokenCliente,
            body: {}
        });
        const rechazadaCobrada = await solicitar("/ventas/" + cobrada.id + "/cancelar-cliente", {
            method: "PATCH",
            token: tokenCliente,
            body: {}
        });

        assert.equal(rechazadaAjena.status, 404);
        assert.equal(rechazadaAnonima.status, 404);
        assert.equal(rechazadaCobrada.status, 409);
        assert.equal((await prisma.venta.findUnique({ where: { id: ajena.id } })).estado, "PENDIENTE");
        assert.equal((await prisma.venta.findUnique({ where: { id: anonima.id } })).estado, "PENDIENTE");
        assert.equal((await prisma.venta.findUnique({ where: { id: cobrada.id } })).estado, "COBRADA");
        assert.equal((await obtenerProducto()).stockReservado, reservaEsperada);
    });

    test("solo una operación gana si el cliente cancela mientras un cajero intenta cobrar", async () => {
        const reservaAntes = (await obtenerProducto()).stockReservado;
        const stockAntes = (await obtenerProducto()).stock;
        const venta = await crearVenta();
        const resultados = await Promise.all([
            solicitar("/ventas/" + venta.id + "/cancelar-cliente", {
                method: "PATCH",
                token: tokenCliente,
                body: {}
            }),
            solicitar("/ventas/" + venta.id + "/cobrar", {
                method: "PATCH",
                token: tokenAdministrador,
                body: { metodoPago: "Efectivo", efectivoRecibido: 125 }
            })
        ]);

        assert.equal(resultados.filter((resultado) => resultado.status === 200).length, 1);
        assert.equal(resultados.filter((resultado) => resultado.status === 409).length, 1);

        const ventaFinal = await prisma.venta.findUnique({ where: { id: venta.id } });
        const productoFinal = await obtenerProducto();
        assert.ok(["CANCELADA", "COBRADA"].includes(ventaFinal.estado));
        assert.equal(productoFinal.stockReservado, reservaAntes);
        assert.equal(productoFinal.stock, ventaFinal.estado === "COBRADA" ? stockAntes - 1 : stockAntes);
    });

    test("cancela el QR en Mercado Pago y rechaza el cobro posterior", async () => {
        const reservaAntes = (await obtenerProducto()).stockReservado;
        const stockAntes = (await obtenerProducto()).stock;
        const venta = await crearVenta({ conQr: true });
        const orden = ordenes.get(venta.mpOrderId);
        const fetchAnterior = global.fetch;
        process.env.MP_ACCESS_TOKEN = "test-access-token";
        process.env.MP_QR_EXTERNAL_POS_ID = "test-pos";
        global.fetch = async function (url, opciones) {
            const direccion = new URL(url);
            const segmentos = direccion.pathname.split("/");
            const id = decodeURIComponent(segmentos[segmentos.length - 1] === "cancel"
                ? segmentos[segmentos.length - 2]
                : segmentos[segmentos.length - 1]);
            const ordenActual = ordenes.get(id);
            if (!ordenActual) return { ok: false, status: 404, json: async () => ({}) };
            if (opciones.method === "POST" && direccion.pathname.endsWith("/cancel")) {
                ordenActual.status = "canceled";
                ordenActual.status_detail = "canceled";
            }
            return { ok: true, status: 200, json: async () => ordenActual };
        };

        try {
            const resultado = await solicitar("/ventas/" + venta.id + "/cancelar-cliente", {
                method: "PATCH",
                token: tokenCliente,
                body: {}
            });
            assert.equal(resultado.status, 200);
            assert.equal(resultado.datos.venta.estado, "CANCELADA");
            assert.equal(orden.status, "canceled");
            assert.equal((await obtenerProducto()).stockReservado, reservaAntes);

            const cobroPosterior = await solicitar("/ventas/" + venta.id + "/cobrar", {
                method: "PATCH",
                token: tokenAdministrador,
                body: { metodoPago: "Efectivo", efectivoRecibido: 125 }
            });
            assert.equal(cobroPosterior.status, 409);
            assert.equal((await prisma.venta.findUnique({ where: { id: venta.id } })).estado, "CANCELADA");

            orden.status = "processed";
            const webhookTardio = await solicitar("/ventas/webhook/mercadopago?data.id=" + orden.id, {
                method: "POST"
            });
            assert.equal(webhookTardio.status, 409);
            assert.equal((await prisma.venta.findUnique({ where: { id: venta.id } })).estado, "CANCELADA");
            assert.equal((await obtenerProducto()).stock, stockAntes);
        } finally {
            global.fetch = fetchAnterior;
        }
    });

    test("la ruta de cancelación administrativa existente conserva su funcionamiento", async () => {
        const reservaAntes = (await obtenerProducto()).stockReservado;
        const venta = await crearVenta();
        const resultado = await solicitar("/ventas/" + venta.id + "/cancelar", {
            method: "PATCH",
            token: tokenAdministrador,
            body: {}
        });
        assert.equal(resultado.status, 200);
        assert.equal(resultado.datos.venta.estado, "CANCELADA");
        assert.equal((await obtenerProducto()).stockReservado, reservaAntes);
    });
});
