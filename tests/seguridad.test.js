require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

// Cubre los cinco puntos de la auditoria de seguridad:
// A. autorizacion al cancelar ventas,
// B. acceso a comprobantes mediante token,
// C. DTO publico del catalogo de productos,
// D. redirecciones del frontend (se prueba en el repositorio frontend),
// E. lectura publica de categorias y tipos con escritura solo de Administrador.
describe("Seguridad de ventas, comprobantes y catalogos publicos", () => {
    let server;
    let baseUrl;
    let marca;
    let categoriaActiva;
    let categoriaInactiva;
    let tipoActivo;
    let tipoInactivo;
    let producto;
    let promo;
    let administrador;
    let cajero;
    let clienteA;
    let clienteB;
    let tokenAdministrador;
    let tokenCajero;
    let tokenClienteA;
    let tokenClienteB;
    const ventasCreadas = [];
    const stockInicial = 10;
    const reservaInicial = 4;

    async function solicitar(ruta, opciones = {}) {
        const respuesta = await fetch(baseUrl + ruta, {
            method: opciones.method || "GET",
            headers: {
                ...(opciones.body ? { "Content-Type": "application/json" } : {}),
                ...(opciones.token ? { Authorization: "Bearer " + opciones.token } : {}),
                ...opciones.headers
            },
            ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {})
        });
        const texto = await respuesta.text();
        let datos = null;
        try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
        return { respuesta, datos };
    }

    async function crearUsuario(sufijo, rolId, indice) {
        return prisma.usuario.create({
            data: {
                nombre: "Seguridad",
                apellido: sufijo,
                dni: String(10000000 + (Number(marca) % 1000000) * 10 + indice),
                email: `seguridad-${sufijo}-${marca}@pos.local`,
                contrasena: "hashed-password",
                rolId
            }
        });
    }

    async function crearVenta(opciones = {}) {
        const cantidad = opciones.cantidad || 1;
        const tokenAcceso = opciones.tokenAcceso === null
            ? null
            : (opciones.tokenAcceso || crypto.randomBytes(32).toString("hex"));
        const venta = await prisma.venta.create({
            data: {
                usuarioId: opciones.usuarioId || null,
                clienteNombre: "Cliente de prueba",
                clienteApellido: "Seguridad",
                clienteEmail: "privado-seguridad@pos.local",
                clienteDni: opciones.clienteDni || null,
                codigoComprobante: "V-SEG-" + crypto.randomUUID(),
                tokenAcceso,
                estado: opciones.estado || "PENDIENTE",
                origen: "RAPIDA",
                metodoPago: "Efectivo",
                total: 100 * cantidad,
                detalles: {
                    create: [{
                        productoId: producto.id,
                        cantidad,
                        precioUnitario: 100,
                        subtotal: 100 * cantidad
                    }]
                }
            }
        });
        ventasCreadas.push(venta);
        if ((opciones.estado || "PENDIENTE") === "PENDIENTE") {
            await prisma.producto.update({
                where: { id: producto.id },
                data: { stockReservado: { increment: cantidad } }
            });
        }
        return venta;
    }

    async function reservaActual() {
        const actual = await prisma.producto.findUnique({
            where: { id: producto.id },
            select: { stockReservado: true }
        });
        return actual.stockReservado;
    }

    before(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = "http://127.0.0.1:" + server.address().port;
        marca = Date.now().toString().slice(-7);

        const [rolAdministrador, rolCajero, rolCliente] = await Promise.all([
            prisma.rol.upsert({ where: { nombre: "Administrador" }, update: {}, create: { nombre: "Administrador" } }),
            prisma.rol.upsert({ where: { nombre: "Cajero" }, update: {}, create: { nombre: "Cajero" } }),
            prisma.rol.upsert({ where: { nombre: "Cliente" }, update: {}, create: { nombre: "Cliente" } })
        ]);

        [administrador, cajero, clienteA, clienteB] = await Promise.all([
            crearUsuario("adm", rolAdministrador.id, 1),
            crearUsuario("caj", rolCajero.id, 2),
            crearUsuario("c1", rolCliente.id, 3),
            crearUsuario("c2", rolCliente.id, 4)
        ]);

        tokenAdministrador = jwt.sign({ id: administrador.id, rol: "Administrador" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        tokenCajero = jwt.sign({ id: cajero.id, rol: "Cajero" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        tokenClienteA = jwt.sign({ id: clienteA.id, rol: "Cliente" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        tokenClienteB = jwt.sign({ id: clienteB.id, rol: "Cliente" }, process.env.JWT_SECRET, { expiresIn: "1h" });

        categoriaActiva = await prisma.categoria.create({ data: { nombre: "Seguridad Activa " + marca } });
        categoriaInactiva = await prisma.categoria.create({ data: { nombre: "Seguridad Inactiva " + marca, activo: false } });
        tipoActivo = await prisma.tipoProducto.upsert({
            where: { nombre: "Seguridad Tipo Activo " + marca },
            update: { activo: true },
            create: { nombre: "Seguridad Tipo Activo " + marca }
        });
        tipoInactivo = await prisma.tipoProducto.create({ data: { nombre: "Seguridad Tipo Inactivo " + marca, activo: false } });

        producto = await prisma.producto.create({
            data: {
                nombre: "Producto Seguridad " + marca,
                descripcion: "Producto de prueba",
                precio: 100,
                stock: stockInicial,
                stockReservado: reservaInicial,
                categoriaId: categoriaActiva.id,
                tipoProductoId: tipoActivo.id,
                activo: true
            }
        });

        const ahora = Date.now();
        promo = await prisma.promocion.create({
            data: {
                titulo: "Promo Seguridad " + marca,
                tipoDescuento: "PORCENTAJE",
                valorDescuento: 10,
                fechaInicio: new Date(ahora - 60 * 60 * 1000),
                fechaFin: new Date(ahora + 60 * 60 * 1000),
                activo: true,
                productos: { create: [{ productoId: producto.id }] }
            }
        });
    });

    after(async () => {
        const ids = ventasCreadas.map((venta) => venta.id);
        if (ids.length) {
            await prisma.movimientoStock.deleteMany({ where: { referenciaId: { in: ids } } });
            await prisma.detalleVenta.deleteMany({ where: { ventaId: { in: ids } } });
            await prisma.venta.deleteMany({ where: { id: { in: ids } } });
        }
        if (promo) await prisma.promocion.delete({ where: { id: promo.id } });
        if (producto) await prisma.producto.delete({ where: { id: producto.id } });
        if (categoriaActiva) await prisma.categoria.delete({ where: { id: categoriaActiva.id } });
        if (categoriaInactiva) await prisma.categoria.delete({ where: { id: categoriaInactiva.id } });
        if (tipoActivo) await prisma.tipoProducto.delete({ where: { id: tipoActivo.id } }).catch(function () {});
        if (tipoInactivo) await prisma.tipoProducto.delete({ where: { id: tipoInactivo.id } });
        for (const usuario of [administrador, cajero, clienteA, clienteB]) {
            if (usuario) await prisma.usuario.delete({ where: { id: usuario.id } });
        }
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    test("A. sin credenciales no se puede cancelar una venta", async () => {
        const venta = await crearVenta();
        assert.equal(await reservaActual(), reservaInicial + 1);

        const intento = await solicitar("/ventas/" + venta.id + "/cancelar", {
            method: "PATCH",
            body: { usuarioId: clienteA.id }
        });

        assert.equal(intento.respuesta.status, 401);
        assert.equal(await reservaActual(), reservaInicial + 1);

        const estado = await prisma.venta.findUnique({ where: { id: venta.id } });
        assert.equal(estado.estado, "PENDIENTE");
    });

    test("A. un Cliente no puede cancelar la compra de otro Cliente", async () => {
        const venta = await crearVenta({ usuarioId: clienteB.id });
        assert.equal(await reservaActual(), reservaInicial + 2);

        const intento = await solicitar("/ventas/" + venta.id + "/cancelar", {
            method: "PATCH",
            token: tokenClienteA,
            body: { usuarioId: clienteA.id }
        });

        // 404 para no revelar la existencia de compras ajenas.
        assert.equal(intento.respuesta.status, 404);
        assert.equal(await reservaActual(), reservaInicial + 2);
        assert.equal((await prisma.venta.findUnique({ where: { id: venta.id } })).estado, "PENDIENTE");
    });

    test("A. un Cliente puede cancelar su propia compra y la reserva se libera una sola vez", async () => {
        const venta = await crearVenta({ usuarioId: clienteA.id });
        assert.equal(await reservaActual(), reservaInicial + 3);

        const cancelada = await solicitar("/ventas/" + venta.id + "/cancelar", {
            method: "PATCH",
            token: tokenClienteA,
            body: { usuarioId: clienteB.id }
        });

        assert.equal(cancelada.respuesta.status, 200);
        assert.equal(cancelada.datos.venta.estado, "CANCELADA");
        assert.equal(await reservaActual(), reservaInicial + 2);

        const repetida = await solicitar("/ventas/" + venta.id + "/cancelar", {
            method: "PATCH",
            token: tokenClienteA,
            body: {}
        });
        assert.equal(repetida.respuesta.status, 409);
        assert.equal(await reservaActual(), reservaInicial + 2);
    });

    test("A. Cajero y Administrador pueden cancelar ventas pendientes", async () => {
        const ventaCajero = await crearVenta();
        const canceladaCajero = await solicitar("/ventas/" + ventaCajero.id + "/cancelar", {
            method: "PATCH",
            token: tokenCajero,
            body: {}
        });
        assert.equal(canceladaCajero.respuesta.status, 200);
        assert.equal(canceladaCajero.datos.venta.estado, "CANCELADA");

        const ventaAdmin = await crearVenta();
        const canceladaAdmin = await solicitar("/ventas/" + ventaAdmin.id + "/cancelar", {
            method: "PATCH",
            token: tokenAdministrador,
            body: {}
        });
        assert.equal(canceladaAdmin.respuesta.status, 200);
        assert.equal(canceladaAdmin.datos.venta.estado, "CANCELADA");
    });

    test("A. una compra anonima se cancela solo con el token de su comprobante", async () => {
        const venta = await crearVenta();
        const sinToken = await solicitar("/ventas/" + venta.id + "/cancelar", {
            method: "PATCH",
            body: {}
        });
        assert.equal(sinToken.respuesta.status, 401);

        const conTokenInvalido = await solicitar("/ventas/" + venta.id + "/cancelar", {
            method: "PATCH",
            headers: { "x-token-comprobante": crypto.randomBytes(32).toString("hex") },
            body: {}
        });
        assert.equal(conTokenInvalido.respuesta.status, 404);

        const conToken = await solicitar("/ventas/" + venta.id + "/cancelar", {
            method: "PATCH",
            headers: { "x-token-comprobante": venta.tokenAcceso },
            body: {}
        });
        assert.equal(conToken.respuesta.status, 200);
        assert.equal(conToken.datos.venta.estado, "CANCELADA");
    });

    test("B. el comprobante no es publico y exige token o sesion autorizada", async () => {
        const venta = await crearVenta({ clienteDni: "30111222", estado: "COBRADA" });
        const ruta = "/ventas/comprobante/" + encodeURIComponent(venta.codigoComprobante);

        const sinCredenciales = await solicitar(ruta);
        assert.equal(sinCredenciales.respuesta.status, 401);

        const tokenInvalido = await solicitar(ruta, {
            headers: { "x-token-comprobante": crypto.randomBytes(32).toString("hex") }
        });
        assert.equal(tokenInvalido.respuesta.status, 404);

        const tokenCorrecto = await solicitar(ruta, {
            headers: { "x-token-comprobante": venta.tokenAcceso }
        });
        assert.equal(tokenCorrecto.respuesta.status, 200);
        const comprobante = tokenCorrecto.datos.venta;
        assert.equal(comprobante.codigoComprobante, venta.codigoComprobante);
        // No se exponen datos internos ni de pago.
        assert.equal(comprobante.tokenAcceso, undefined);
        assert.equal(comprobante.clienteEmail, undefined);
        assert.equal(comprobante.mpOrderId, undefined);
        assert.equal(comprobante.usuario, undefined);
        // Quien accede solo con el token no recibe el DNI.
        assert.equal(comprobante.clienteDni, undefined);
        // Los productos del comprobante no incluyen stock ni datos internos.
        assert.deepEqual(Object.keys(comprobante.detalles[0].producto).sort(), ["id", "nombre"]);
    });

    test("B. el propietario y el personal interno acceden al comprobante y a sus datos", async () => {
        const venta = await crearVenta({ usuarioId: clienteA.id, clienteDni: "30111222", estado: "COBRADA" });
        const ruta = "/ventas/comprobante/" + encodeURIComponent(venta.codigoComprobante);

        const propietario = await solicitar(ruta, { token: tokenClienteA });
        assert.equal(propietario.respuesta.status, 200);
        assert.equal(propietario.datos.venta.clienteDni, "30111222");

        const otroCliente = await solicitar(ruta, { token: tokenClienteB });
        assert.equal(otroCliente.respuesta.status, 404);

        const cajero = await solicitar(ruta, { token: tokenCajero });
        assert.equal(cajero.respuesta.status, 200);

        const administrador = await solicitar(ruta, { token: tokenAdministrador });
        assert.equal(administrador.respuesta.status, 200);

        const sinSesion = await solicitar(ruta);
        assert.equal(sinSesion.respuesta.status, 401);
    });

    test("B. un comprobante sin token asignado no se filtra a terceros", async () => {
        const venta = await crearVenta({ tokenAcceso: null, estado: "COBRADA" });
        const ruta = "/ventas/comprobante/" + encodeURIComponent(venta.codigoComprobante);

        const anonimo = await solicitar(ruta);
        assert.equal(anonimo.respuesta.status, 401);

        const conTokenInventado = await solicitar(ruta, {
            headers: { "x-token-comprobante": crypto.randomBytes(32).toString("hex") }
        });
        assert.equal(conTokenInventado.respuesta.status, 404);

        const staff = await solicitar(ruta, { token: tokenAdministrador });
        assert.equal(staff.respuesta.status, 200);
    });

    test("C. el catalogo publico no expone stock, reservas ni ids internos", async () => {
        const disponibleEsperado = stockInicial - await reservaActual();
        const listado = await solicitar("/productos?nombre=" + encodeURIComponent(producto.nombre));
        assert.equal(listado.respuesta.status, 200);
        const publico = listado.datos.data.find((item) => item.id === producto.id);
        assert.ok(publico);
        assert.equal(publico.stock, undefined);
        assert.equal(publico.stockReservado, undefined);
        assert.equal(publico.categoriaId, undefined);
        assert.equal(publico.tipoProductoId, undefined);
        assert.equal(publico.activo, undefined);
        assert.equal(publico.disponible, disponibleEsperado);

        const detalle = await solicitar("/productos/" + producto.id);
        assert.equal(detalle.respuesta.status, 200);
        assert.equal(detalle.datos.producto.stock, undefined);
        assert.equal(detalle.datos.producto.stockReservado, undefined);
        assert.equal(detalle.datos.producto.disponible, disponibleEsperado);
    });

    test("C. Administrador y Cajero siguen viendo la informacion completa de stock", async () => {
        for (const token of [tokenAdministrador, tokenCajero]) {
            const listado = await solicitar("/productos?nombre=" + encodeURIComponent(producto.nombre), { token });
            assert.equal(listado.respuesta.status, 200);
            const interno = listado.datos.data.find((item) => item.id === producto.id);
            assert.ok(interno);
            assert.equal(interno.stock, stockInicial);
            assert.ok("stockReservado" in interno);
            assert.equal(interno.categoriaId, categoriaActiva.id);
            assert.equal(interno.tipoProductoId, tipoActivo.id);

            const detalle = await solicitar("/productos/" + producto.id, { token });
            assert.equal(detalle.respuesta.status, 200);
            assert.equal(detalle.datos.producto.stock, stockInicial);
            assert.ok("stockReservado" in detalle.datos.producto);
        }
    });

    test("C. las promociones vigentes publicas no filtran stock de sus productos", async () => {
        const disponibleEsperado = stockInicial - await reservaActual();
        const promociones = await solicitar("/promociones/vigentes");
        assert.equal(promociones.respuesta.status, 200);
        const publicada = promociones.datos.promociones.find((item) => item.id === promo.id);
        assert.ok(publicada);
        const productoPublico = publicada.productos.find((item) => item.producto.id === producto.id).producto;
        assert.equal(productoPublico.stock, undefined);
        assert.equal(productoPublico.stockReservado, undefined);
        assert.equal(productoPublico.disponible, disponibleEsperado);
    });

    test("E. categorias y tipos activos se listan publicamente con solo id y nombre", async () => {
        const categorias = await solicitar("/categorias");
        assert.equal(categorias.respuesta.status, 200);
        const categoria = categorias.datos.data.find((item) => item.id === categoriaActiva.id);
        assert.ok(categoria);
        assert.deepEqual(Object.keys(categoria).sort(), ["id", "nombre"]);
        assert.equal(categorias.datos.data.some((item) => item.id === categoriaInactiva.id), false);

        const tipos = await solicitar("/tipos-producto");
        assert.equal(tipos.respuesta.status, 200);
        const tipo = tipos.datos.data.find((item) => item.id === tipoActivo.id);
        assert.ok(tipo);
        assert.deepEqual(Object.keys(tipo).sort(), ["id", "nombre"]);
        assert.equal(tipos.datos.data.some((item) => item.id === tipoInactivo.id), false);
    });

    test("E. crear, modificar y desactivar categorias o tipos sigue siendo solo de Administrador", async () => {
        const sinSesion = await solicitar("/categorias", {
            method: "POST",
            body: { nombre: "Categoria No Autorizada " + marca }
        });
        assert.equal(sinSesion.respuesta.status, 401);

        const cliente = await solicitar("/categorias", {
            method: "POST",
            token: tokenClienteA,
            body: { nombre: "Categoria Cliente " + marca }
        });
        assert.equal(cliente.respuesta.status, 403);

        const cajero = await solicitar("/tipos-producto", {
            method: "POST",
            token: tokenCajero,
            body: { nombre: "Tipo Cajero " + marca }
        });
        assert.equal(cajero.respuesta.status, 403);

        const creada = await solicitar("/categorias", {
            method: "POST",
            token: tokenAdministrador,
            body: { nombre: "Categoria Admin " + marca }
        });
        assert.equal(creada.respuesta.status, 201);
        const idCreada = creada.datos.dato.id;

        const modificacionCliente = await solicitar("/categorias/" + idCreada, {
            method: "PUT",
            token: tokenClienteA,
            body: { nombre: "Categoria Modificada " + marca }
        });
        assert.equal(modificacionCliente.respuesta.status, 403);

        const bajaCliente = await solicitar("/categorias/" + idCreada, {
            method: "DELETE",
            token: tokenClienteA
        });
        assert.equal(bajaCliente.respuesta.status, 403);

        const bajaAdmin = await solicitar("/categorias/" + idCreada, {
            method: "DELETE",
            token: tokenAdministrador
        });
        assert.equal(bajaAdmin.respuesta.status, 204);

        const inactiva = await prisma.categoria.findUnique({ where: { id: idCreada } });
        assert.equal(inactiva.activo, false);
        await prisma.categoria.delete({ where: { id: idCreada } });
    });
});
