require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

describe("Activación y desactivación rápida de promociones", () => {
    let server;
    let baseUrl;
    let administrador;
    let cajero;
    let cliente;
    let tokenAdmin;
    let tokenCajero;
    let tokenCliente;
    let categoria;
    let tipoProducto;
    let productoA;
    let productoB;
    let promocionCreada;
    const ventas = [];

    async function solicitar(ruta, opciones = {}) {
        const respuesta = await fetch(baseUrl + ruta, {
            method: opciones.method || "GET",
            headers: {
                ...(opciones.body ? { "Content-Type": "application/json" } : {}),
                ...(opciones.token ? { Authorization: "Bearer " + opciones.token } : {})
            },
            ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {})
        });
        const tipo = respuesta.headers.get("content-type") || "";
        return {
            respuesta,
            datos: tipo.includes("application/json") ? await respuesta.json() : await respuesta.text()
        };
    }

    before(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = "http://127.0.0.1:" + server.address().port;

        const rolAdmin = await prisma.rol.upsert({
            where: { nombre: "Administrador" },
            update: {},
            create: { nombre: "Administrador" }
        });
        const rolCajero = await prisma.rol.upsert({
            where: { nombre: "Cajero" },
            update: {},
            create: { nombre: "Cajero" }
        });
        const rolCliente = await prisma.rol.upsert({
            where: { nombre: "Cliente" },
            update: {},
            create: { nombre: "Cliente" }
        });

        const marca = Date.now().toString();
        administrador = await prisma.usuario.create({
            data: {
                nombre: "Admin",
                apellido: "Test",
                dni: marca.slice(-8),
                email: "admin-promo-" + marca + "@pos.local",
                contrasena: "hashed",
                rolId: rolAdmin.id
            }
        });
        cajero = await prisma.usuario.create({
            data: {
                nombre: "Cajero",
                apellido: "Test",
                dni: (Number(marca.slice(-8)) + 1).toString(),
                email: "cajero-promo-" + marca + "@pos.local",
                contrasena: "hashed",
                rolId: rolCajero.id
            }
        });
        cliente = await prisma.usuario.create({
            data: {
                nombre: "Cliente",
                apellido: "Test",
                dni: (Number(marca.slice(-8)) + 2).toString(),
                email: "cliente-promo-" + marca + "@pos.local",
                contrasena: "hashed",
                rolId: rolCliente.id
            }
        });

        tokenAdmin = jwt.sign({ id: administrador.id, rol: "Administrador" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        tokenCajero = jwt.sign({ id: cajero.id, rol: "Cajero" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        tokenCliente = jwt.sign({ id: cliente.id, rol: "Cliente" }, process.env.JWT_SECRET, { expiresIn: "1h" });

        categoria = await prisma.categoria.create({
            data: { nombre: "Cat Promo " + marca }
        });
        tipoProducto = await prisma.tipoProducto.upsert({
            where: { nombre: "General" },
            update: {},
            create: { nombre: "General" }
        });

        productoA = await prisma.producto.create({
            data: {
                nombre: "Prod A Promo " + marca,
                precio: 1000,
                stock: 50,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });

        productoB = await prisma.producto.create({
            data: {
                nombre: "Prod B Promo " + marca,
                precio: 2000,
                stock: 50,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });

        // Crear una promoción activa inicial con productos y categorías asociados
        const resCrear = await solicitar("/promociones", {
            method: "POST",
            token: tokenAdmin,
            body: {
                titulo: "Promoción Especial " + marca,
                descripcion: "Descuento del 20%",
                tipoDescuento: "PORCENTAJE",
                valorDescuento: 20,
                fechaInicio: new Date(Date.now() - 3600_000).toISOString(),
                fechaFin: new Date(Date.now() + 86400_000).toISOString(),
                activo: true,
                productoIds: [productoA.id],
                categorias: [categoria.nombre]
            }
        });
        assert.equal(resCrear.respuesta.status, 201, JSON.stringify(resCrear.datos));
        promocionCreada = resCrear.datos.promocion;
    });

    after(async () => {
        if (ventas.length) {
            await prisma.detalleVenta.deleteMany({ where: { ventaId: { in: ventas } } });
            await prisma.venta.deleteMany({ where: { id: { in: ventas } } });
        }
        if (promocionCreada?.id) {
            await prisma.promocionProducto.deleteMany({ where: { promocionId: promocionCreada.id } });
            await prisma.promocionCategoria.deleteMany({ where: { promocionId: promocionCreada.id } });
            await prisma.promocion.deleteMany({ where: { id: promocionCreada.id } });
        }
        if (productoA?.id || productoB?.id) {
            await prisma.producto.deleteMany({ where: { id: { in: [productoA?.id, productoB?.id].filter(Boolean) } } });
        }
        if (categoria?.id) {
            await prisma.categoria.deleteMany({ where: { id: categoria.id } });
        }
        const userIds = [administrador?.id, cajero?.id, cliente?.id].filter(Boolean);
        if (userIds.length) {
            await prisma.usuario.deleteMany({ where: { id: { in: userIds } } });
        }
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test("la promoción inicialmente activa aparece en vigentes y aplica en el catálogo", async () => {
        const resVigentes = await solicitar("/promociones/vigentes");
        assert.equal(resVigentes.respuesta.status, 200);
        const vigentes = resVigentes.datos.promociones || [];
        assert.ok(vigentes.some((p) => p.id === promocionCreada.id));

        const resProd = await solicitar("/productos/" + productoA.id);
        assert.equal(resProd.respuesta.status, 200);
        assert.equal(resProd.datos.producto.precioFinal, 800); // 1000 - 20%
        assert.equal(resProd.datos.producto.promocion?.id, promocionCreada.id);
    });

    test("desactivar una promoción activa conserva sus datos y relaciones", async () => {
        const resActualizar = await solicitar("/promociones/" + promocionCreada.id, {
            method: "PUT",
            token: tokenAdmin,
            body: { activo: false }
        });
        assert.equal(resActualizar.respuesta.status, 200);
        const promoActualizada = resActualizar.datos.promocion;

        assert.equal(promoActualizada.id, promocionCreada.id);
        assert.equal(promoActualizada.activo, false);
        assert.equal(promoActualizada.titulo, promocionCreada.titulo);
        assert.equal(promoActualizada.tipoDescuento, "PORCENTAJE");
        assert.equal(Number(promoActualizada.valorDescuento), 20);

        // Comprobar que productos y categorías asociados siguen existiendo
        const relacionesProductos = await prisma.promocionProducto.findMany({
            where: { promocionId: promocionCreada.id }
        });
        assert.equal(relacionesProductos.length, 1);
        assert.equal(relacionesProductos[0].productoId, productoA.id);

        const relacionesCategorias = await prisma.promocionCategoria.findMany({
            where: { promocionId: promocionCreada.id }
        });
        assert.equal(relacionesCategorias.length, 1);
        assert.equal(relacionesCategorias[0].categoria, categoria.nombre);
    });

    test("una promoción desactivada no aparece en vigentes ni se aplica en catálogo ni en checkout", async () => {
        // 1. No aparece en vigentes
        const resVigentes = await solicitar("/promociones/vigentes");
        assert.equal(resVigentes.respuesta.status, 200);
        const vigentes = resVigentes.datos.promociones || [];
        assert.ok(!vigentes.some((p) => p.id === promocionCreada.id));

        // 2. No se aplica en catálogo
        const resProd = await solicitar("/productos/" + productoA.id);
        assert.equal(resProd.respuesta.status, 200);
        assert.equal(resProd.datos.producto.precioFinal, 1000); // Sin descuento
        assert.equal(resProd.datos.producto.promocion, null);

        // 3. No se aplica en checkout (venta directa)
        const resVenta = await solicitar("/ventas/directa", {
            method: "POST",
            token: tokenAdmin,
            body: {
                items: [{ productoId: productoA.id, cantidad: 1, precio: 1000 }],
                metodoPago: "Efectivo",
                cobrar: false
            }
        });
        assert.equal(resVenta.respuesta.status, 201);
        const venta = resVenta.datos.venta;
        ventas.push(venta.id);

        assert.equal(Number(venta.total), 1000);
        assert.equal(Number(venta.detalles[0].descuentoTotal), 0);
        assert.equal(venta.detalles[0].promocionTitulo, null);
    });

    test("al reactivar una promoción inactiva vuelve a estar disponible y a aplicarse", async () => {
        const resActualizar = await solicitar("/promociones/" + promocionCreada.id, {
            method: "PUT",
            token: tokenAdmin,
            body: { activo: true }
        });
        assert.equal(resActualizar.respuesta.status, 200);
        assert.equal(resActualizar.datos.promocion.activo, true);

        // Vuelve a aparecer en vigentes
        const resVigentes = await solicitar("/promociones/vigentes");
        assert.equal(resVigentes.respuesta.status, 200);
        const vigentes = resVigentes.datos.promociones || [];
        assert.ok(vigentes.some((p) => p.id === promocionCreada.id));

        // Vuelve a aplicar en catálogo
        const resProd = await solicitar("/productos/" + productoA.id);
        assert.equal(resProd.respuesta.status, 200);
        assert.equal(resProd.datos.producto.precioFinal, 800);
        assert.equal(resProd.datos.producto.promocion?.id, promocionCreada.id);

        // Vuelve a aplicar en checkout
        const resVenta = await solicitar("/ventas/directa", {
            method: "POST",
            token: tokenAdmin,
            body: {
                items: [{ productoId: productoA.id, cantidad: 1, precio: 1000 }],
                metodoPago: "Efectivo",
                cobrar: false
            }
        });
        assert.equal(resVenta.respuesta.status, 201);
        const venta = resVenta.datos.venta;
        ventas.push(venta.id);

        assert.equal(Number(venta.total), 800);
        assert.equal(Number(venta.detalles[0].descuentoTotal), 200);
    });

    test("usuarios sin permisos de Administrador no pueden modificar el estado de promociones", async () => {
        // Sin token (anónimo)
        const resSinToken = await solicitar("/promociones/" + promocionCreada.id, {
            method: "PUT",
            body: { activo: false }
        });
        assert.equal(resSinToken.respuesta.status, 401);

        // Con rol Cajero
        const resCajero = await solicitar("/promociones/" + promocionCreada.id, {
            method: "PUT",
            token: tokenCajero,
            body: { activo: false }
        });
        assert.equal(resCajero.respuesta.status, 403);

        // Con rol Cliente
        const resCliente = await solicitar("/promociones/" + promocionCreada.id, {
            method: "PUT",
            token: tokenCliente,
            body: { activo: false }
        });
        assert.equal(resCliente.respuesta.status, 403);
    });
});
