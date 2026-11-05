require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

describe("Notificaciones de compras en preparación", () => {
    let server;
    let baseUrl;
    let administrador;
    let cajero;
    let otroCajero;
    let cliente;
    let ventas = [];
    let usuarios = [];
    let tokenAdministrador;
    let tokenCajero;
    let tokenOtroCajero;
    let tokenCliente;

    before(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;

        const [rolAdministrador, rolCajero, rolCliente] = await Promise.all([
            prisma.rol.upsert({ where: { nombre: "Administrador" }, update: {}, create: { nombre: "Administrador" } }),
            prisma.rol.upsert({ where: { nombre: "Cajero" }, update: {}, create: { nombre: "Cajero" } }),
            prisma.rol.upsert({ where: { nombre: "Cliente" }, update: {}, create: { nombre: "Cliente" } })
        ]);
        const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const usuariosCreados = await Promise.all([
            prisma.usuario.create({ data: { nombre: "Admin", apellido: "Test", dni: "A" + sufijo, email: `admin_${sufijo}@pos.local`, contrasena: "test", rolId: rolAdministrador.id } }),
            prisma.usuario.create({ data: { nombre: "Cajero", apellido: "Test", dni: "C" + sufijo, email: `cajero_${sufijo}@pos.local`, contrasena: "test", rolId: rolCajero.id } }),
            prisma.usuario.create({ data: { nombre: "Otro cajero", apellido: "Test", dni: "D" + sufijo, email: `otro_cajero_${sufijo}@pos.local`, contrasena: "test", rolId: rolCajero.id } }),
            prisma.usuario.create({ data: { nombre: "Cliente", apellido: "Test", dni: "U" + sufijo, email: `cliente_${sufijo}@pos.local`, contrasena: "test", rolId: rolCliente.id } })
        ]);
        [administrador, cajero, otroCajero, cliente] = usuariosCreados;
        usuarios = usuariosCreados;

        tokenAdministrador = crearToken(administrador, "Administrador");
        tokenCajero = crearToken(cajero, "Cajero");
        tokenOtroCajero = crearToken(otroCajero, "Cajero");
        tokenCliente = crearToken(cliente, "Cliente");

        const sufijoVenta = Date.now();
        const [ventaPreparacion, ventaCancelada, ventaRapida, ventaAdicional] = await Promise.all([
            crearVenta(`V-NOTIF-${sufijoVenta}-1`, cliente.id, "AUTOGESTION", "PENDIENTE"),
            crearVenta(`V-NOTIF-${sufijoVenta}-2`, cliente.id, "AUTOGESTION", "CANCELADA"),
            crearVenta(`V-NOTIF-${sufijoVenta}-3`, cajero.id, "RAPIDA", "COBRADA"),
            crearVenta(`V-NOTIF-${sufijoVenta}-4`, cliente.id, "AUTOGESTION", "PENDIENTE")
        ]);
        ventas = [ventaPreparacion, ventaCancelada, ventaRapida, ventaAdicional];
    });

    after(async () => {
        if (ventas.length) {
            await prisma.venta.deleteMany({ where: { id: { in: ventas.map((venta) => venta.id) } } });
        }
        if (usuarios.length) {
            await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((usuario) => usuario.id) } } });
        }
        await prisma.$disconnect();
        if (server) await new Promise((resolve) => server.close(resolve));
    });

    test("notifica a personal en la transición, permite leer y abrir la compra, y respeta los permisos", async () => {
        const ventaPreparacion = ventas[0];
        const ventaCancelada = ventas[1];
        const ventaRapida = ventas[2];
        const ventaAdicional = ventas[3];

        assert.equal((await fetch(`${baseUrl}/notificaciones`)).status, 401);
        assert.equal((await fetch(`${baseUrl}/notificaciones`, { headers: auth(tokenCliente) })).status, 403);

        const notificacionesAntesDelPago = await (await fetch(`${baseUrl}/notificaciones`, {
            headers: auth(tokenAdministrador)
        })).json();
        assert.equal(notificacionesAntesDelPago.noLeidas, 0);

        const pago = await fetch(`${baseUrl}/ventas/${ventaPreparacion.id}/cobrar`, {
            method: "PATCH",
            headers: { ...auth(tokenCajero), "Content-Type": "application/json" },
            body: JSON.stringify({ metodoPago: "Efectivo", efectivoRecibido: 1 })
        });
        assert.equal(pago.status, 200);
        assert.equal((await pago.json()).venta.estado, "COBRADA");

        const [respuestaAdmin, respuestaCajero, respuestaOtroCajero] = await Promise.all([
            fetch(`${baseUrl}/notificaciones`, { headers: auth(tokenAdministrador) }),
            fetch(`${baseUrl}/notificaciones`, { headers: auth(tokenCajero) }),
            fetch(`${baseUrl}/notificaciones`, { headers: auth(tokenOtroCajero) })
        ]);
        const datosAdmin = await respuestaAdmin.json();
        const datosCajero = await respuestaCajero.json();
        const datosOtroCajero = await respuestaOtroCajero.json();
        assert.equal(datosAdmin.noLeidas, 1);
        assert.equal(datosCajero.noLeidas, 1);
        assert.equal(datosOtroCajero.noLeidas, 1);
        assert.equal(datosAdmin.notificaciones[0].venta.codigoComprobante, ventaPreparacion.codigoComprobante);
        assert.match(datosAdmin.notificaciones[0].mensaje, /pagada y lista para comenzar a preparar/);

        const idNotificacionAjena = datosCajero.notificaciones[0].id;
        const lecturaAjena = await fetch(`${baseUrl}/notificaciones/${idNotificacionAjena}/leida`, {
            method: "PATCH",
            headers: auth(tokenOtroCajero)
        });
        assert.equal(lecturaAjena.status, 404);

        const lectura = await fetch(`${baseUrl}/notificaciones/${datosAdmin.notificaciones[0].id}/leida`, {
            method: "PATCH",
            headers: auth(tokenAdministrador)
        });
        assert.equal(lectura.status, 200);
        assert.ok((await lectura.json()).notificacion.leidaEn);
        const listadoLeido = await (await fetch(`${baseUrl}/notificaciones`, { headers: auth(tokenAdministrador) })).json();
        assert.equal(listadoLeido.noLeidas, 0);
        assert.ok(listadoLeido.notificaciones[0].leidaEn);

        const transicionPreparacion = await fetch(`${baseUrl}/ventas/${ventaPreparacion.id}/preparar`, {
            method: "PATCH",
            headers: auth(tokenCajero)
        });
        assert.equal(transicionPreparacion.status, 200);
        assert.equal((await transicionPreparacion.json()).venta.estado, "EN_PREPARACION");

        const reintento = await fetch(`${baseUrl}/ventas/${ventaPreparacion.id}/preparar`, {
            method: "PATCH",
            headers: auth(tokenCajero)
        });
        assert.equal(reintento.status, 400);
        const despuesDelReintento = await (await fetch(`${baseUrl}/notificaciones`, { headers: auth(tokenAdministrador) })).json();
        assert.equal(despuesDelReintento.notificaciones.length, 1);

        const prepararCancelada = await fetch(`${baseUrl}/ventas/${ventaCancelada.id}/preparar`, {
            method: "PATCH",
            headers: auth(tokenCajero)
        });
        assert.equal(prepararCancelada.status, 400);
        const prepararRapida = await fetch(`${baseUrl}/ventas/${ventaRapida.id}/preparar`, {
            method: "PATCH",
            headers: auth(tokenCajero)
        });
        assert.equal(prepararRapida.status, 400);

        const segundoPago = await fetch(`${baseUrl}/ventas/${ventaAdicional.id}/cobrar`, {
            method: "PATCH",
            headers: { ...auth(tokenAdministrador), "Content-Type": "application/json" },
            body: JSON.stringify({ metodoPago: "Efectivo", efectivoRecibido: 1 })
        });
        assert.equal(segundoPago.status, 200);
        const variasNotificaciones = await (await fetch(`${baseUrl}/notificaciones`, { headers: auth(tokenCajero) })).json();
        assert.equal(variasNotificaciones.noLeidas, 2);
        assert.equal(variasNotificaciones.notificaciones.length, 2);

        const segundaTransicion = await fetch(`${baseUrl}/ventas/${ventaAdicional.id}/preparar`, {
            method: "PATCH",
            headers: auth(tokenAdministrador)
        });
        assert.equal(segundaTransicion.status, 200);
        const sinDuplicados = await (await fetch(`${baseUrl}/notificaciones`, { headers: auth(tokenCajero) })).json();
        assert.equal(sinDuplicados.noLeidas, 2);
        assert.equal(sinDuplicados.notificaciones.length, 2);
    });
});

function crearToken(usuario, rol) {
    return jwt.sign({ id: usuario.id, rol: rol }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function auth(token) {
    return { Authorization: `Bearer ${token}` };
}

function crearVenta(codigoComprobante, usuarioId, origen, estado) {
    return prisma.venta.create({
        data: {
            usuarioId: usuarioId,
            codigoComprobante: codigoComprobante,
            total: 0,
            origen: origen,
            estado: estado
        }
    });
}
