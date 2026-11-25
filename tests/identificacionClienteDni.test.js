require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

describe("Identificación de clientes por DNI en venta rápida", () => {
    let server;
    let baseUrl;
    let rolAdmin;
    let rolCajero;
    let rolCliente;
    let adminUsuario;
    let cajeroUsuario;
    let clienteUsuario;
    let otroClienteUsuario;
    let tokenAdmin;
    let tokenCajero;
    let tokenCliente;
    let categoria;
    let tipoProducto;
    let productoTest;
    const idsVentas = [];

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

        rolAdmin = await prisma.rol.upsert({
            where: { nombre: "Administrador" },
            update: {},
            create: { nombre: "Administrador" }
        });
        rolCajero = await prisma.rol.upsert({
            where: { nombre: "Cajero" },
            update: {},
            create: { nombre: "Cajero" }
        });
        rolCliente = await prisma.rol.upsert({
            where: { nombre: "Cliente" },
            update: {},
            create: { nombre: "Cliente" }
        });

        const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

        adminUsuario = await prisma.usuario.create({
            data: {
                nombre: "Admin",
                apellido: "VentaRapida",
                dni: `77${sufijo.slice(-6)}`,
                email: `admin_${sufijo}@pos.local`,
                contrasena: "hash_admin_123",
                rolId: rolAdmin.id
            }
        });

        cajeroUsuario = await prisma.usuario.create({
            data: {
                nombre: "Cajero",
                apellido: "VentaRapida",
                dni: `88${sufijo.slice(-6)}`,
                email: `cajero_${sufijo}@pos.local`,
                contrasena: "hash_cajero_123",
                rolId: rolCajero.id
            }
        });

        clienteUsuario = await prisma.usuario.create({
            data: {
                nombre: "Mariano",
                apellido: "Gomez",
                dni: `35${sufijo.slice(-6)}`,
                email: `cliente_${sufijo}@pos.local`,
                contrasena: "hash_cliente_123",
                rolId: rolCliente.id
            }
        });

        const dniOtroCliente = `42${sufijo.slice(-6)}`;
        otroClienteUsuario = await prisma.usuario.create({
            data: {
                nombre: "Lucia",
                apellido: "Perez",
                dni: `${dniOtroCliente.slice(0, 2)}.${dniOtroCliente.slice(2, 5)}.${dniOtroCliente.slice(5)}`,
                email: `lucia_${sufijo}@pos.local`,
                contrasena: "hash_lucia_123",
                rolId: rolCliente.id
            }
        });

        tokenAdmin = jwt.sign(
            { id: adminUsuario.id, rol: "Administrador" },
            process.env.JWT_SECRET || "secreto-test",
            { expiresIn: "2h" }
        );
        tokenCajero = jwt.sign(
            { id: cajeroUsuario.id, rol: "Cajero" },
            process.env.JWT_SECRET || "secreto-test",
            { expiresIn: "2h" }
        );
        tokenCliente = jwt.sign(
            { id: clienteUsuario.id, rol: "Cliente" },
            process.env.JWT_SECRET || "secreto-test",
            { expiresIn: "2h" }
        );

        categoria = await prisma.categoria.create({
            data: { nombre: `Cat-Dni-${sufijo}` }
        });
        tipoProducto = await prisma.tipoProducto.create({
            data: { nombre: `Tipo-Dni-${sufijo}` }
        });
        productoTest = await prisma.producto.create({
            data: {
                nombre: `Producto Venta DNI ${sufijo}`,
                precio: 1500,
                stock: 100,
                stockReservado: 0,
                activo: true,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id
            }
        });
    });

    after(async () => {
        try {
            if (idsVentas.length > 0) {
                await prisma.notificacion.deleteMany({ where: { ventaId: { in: idsVentas } } });
                await prisma.detalleVenta.deleteMany({ where: { ventaId: { in: idsVentas } } });
                await prisma.venta.deleteMany({ where: { id: { in: idsVentas } } });
            }
            if (productoTest) {
                await prisma.detalleVenta.deleteMany({ where: { productoId: productoTest.id } });
                await prisma.movimientoStock.deleteMany({ where: { productoId: productoTest.id } });
                await prisma.producto.deleteMany({ where: { id: productoTest.id } });
            }
            if (categoria) {
                await prisma.categoria.deleteMany({ where: { id: categoria.id } });
            }
            if (tipoProducto) {
                await prisma.tipoProducto.deleteMany({ where: { id: tipoProducto.id } });
            }
            const idsUsuarios = [adminUsuario?.id, cajeroUsuario?.id, clienteUsuario?.id, otroClienteUsuario?.id].filter(Boolean);
            if (idsUsuarios.length > 0) {
                await prisma.notificacion.deleteMany({ where: { usuarioId: { in: idsUsuarios } } });
                await prisma.usuario.deleteMany({ where: { id: { in: idsUsuarios } } });
            }
            if (server) {
                await new Promise((resolve) => server.close(resolve));
            }
        } catch (error) {
            console.error("Error en after:", error);
        }
    });

    test("1. Endpoint de búsqueda por DNI está protegido contra accesos no autenticados (401)", async () => {
        const res = await solicitar(`/usuarios/dni/${clienteUsuario.dni}`);
        assert.equal(res.respuesta.status, 401);
    });

    test("2. Endpoint no permite consulta a usuarios con rol Cliente (403)", async () => {
        const res = await solicitar(`/usuarios/dni/${clienteUsuario.dni}`, { token: tokenCliente });
        assert.equal(res.respuesta.status, 403);
    });

    test("3. Cajero y Administrador pueden consultar un cliente por DNI exitosamente (200)", async () => {
        const resCajero = await solicitar(`/usuarios/dni/${clienteUsuario.dni}`, { token: tokenCajero });
        assert.equal(resCajero.respuesta.status, 200);
        assert.deepEqual(resCajero.datos.cliente, {
            id: clienteUsuario.id,
            nombre: clienteUsuario.nombre,
            apellido: clienteUsuario.apellido,
            dni: clienteUsuario.dni,
            email: clienteUsuario.email
        });

        // No debe exponer contraseñas, hashes ni información sensible
        assert.equal(resCajero.datos.cliente.contrasena, undefined);
        assert.equal(resCajero.datos.cliente.tokenHash, undefined);
        assert.equal(resCajero.datos.cliente.hash, undefined);

        const resAdmin = await solicitar(`/usuarios/dni/${clienteUsuario.dni}`, { token: tokenAdmin });
        assert.equal(resAdmin.respuesta.status, 200);
        assert.equal(resAdmin.datos.cliente.id, clienteUsuario.id);

        const dniFormateado = `${clienteUsuario.dni.slice(0, 2)}.${clienteUsuario.dni.slice(2, 5)}.${clienteUsuario.dni.slice(5)}`;
        const resDniFormateado = await solicitar(`/usuarios/dni/${dniFormateado}`, { token: tokenCajero });
        assert.equal(resDniFormateado.respuesta.status, 200);
        assert.equal(resDniFormateado.datos.cliente.id, clienteUsuario.id);

        const resDniSinPuntos = await solicitar(
            `/usuarios/dni/${otroClienteUsuario.dni.replace(/\./g, "")}`,
            { token: tokenCajero }
        );
        assert.equal(resDniSinPuntos.respuesta.status, 200);
        assert.equal(resDniSinPuntos.datos.cliente.id, otroClienteUsuario.id);
    });

    test("4. Rechaza formatos de DNI inválidos (letras, símbolos, longitud incorrecta) con 400", async () => {
        const formatosInvalidos = ["letras", "123", "1234567890", "DNI-1234", "35.abc.123", "12.345678"];
        for (const formato of formatosInvalidos) {
            const res = await solicitar(`/usuarios/dni/${encodeURIComponent(formato)}`, { token: tokenCajero });
            assert.equal(res.respuesta.status, 400, `Esperaba 400 para formato '${formato}' pero obtuvo ${res.respuesta.status}`);
        }
    });

    test("5. Informa con 404 cuando el DNI no corresponde a ningún cliente registrado", async () => {
        const res = await solicitar("/usuarios/dni/99999999", { token: tokenCajero });
        assert.equal(res.respuesta.status, 404);
        assert.match(res.datos.mensaje, /no se encontró|no encontrado/i);
    });

    test("6. No retorna usuarios con roles distintos a Cliente (ej: Admin o Cajero) aunque coincida el DNI", async () => {
        // Intentar consultar el DNI del Cajero o Administrador
        const resAdminDni = await solicitar(`/usuarios/dni/${adminUsuario.dni}`, { token: tokenCajero });
        assert.equal(resAdminDni.respuesta.status, 404);

        const resCajeroDni = await solicitar(`/usuarios/dni/${cajeroUsuario.dni}`, { token: tokenCajero });
        assert.equal(resCajeroDni.respuesta.status, 404);
    });

    test("7. Venta directa con cliente asociado por DNI vincula la venta a la cuenta del cliente", async () => {
        const resVenta = await solicitar("/ventas/directa", {
            method: "POST",
            token: tokenCajero,
            body: {
                items: [{ productoId: productoTest.id, cantidad: 2 }],
                cliente: {
                    id: clienteUsuario.id,
                    dni: clienteUsuario.dni,
                    nombre: "Dato manipulado",
                    apellido: "No confiable",
                    email: "alterado@ejemplo.com"
                },
                metodoPago: "Tarjeta",
                cobrar: true
            }
        });

        assert.equal(resVenta.respuesta.status, 201);
        const venta = resVenta.datos.venta;
        idsVentas.push(venta.id);

        assert.equal(venta.usuarioId, clienteUsuario.id);
        assert.equal(venta.clienteNombre, clienteUsuario.nombre);
        assert.equal(venta.clienteDni, clienteUsuario.dni);
        assert.equal(venta.clienteEmail, clienteUsuario.email);
        assert.equal(venta.estado, "COBRADA");

        // Verificar que la venta aparece en el historial de compras del cliente
        const resHistorial = await solicitar("/ventas", { token: tokenCliente });
        assert.equal(resHistorial.respuesta.status, 200);
        const ventasCliente = resHistorial.datos.ventas || [];
        const ventaEncontrada = ventasCliente.find((v) => v.id === venta.id);
        assert.ok(ventaEncontrada, "La venta directa asociada debe figurar en el historial del cliente");

        // El cliente puede consultar el detalle de su compra
        const resDetalle = await solicitar(`/ventas/${venta.id}`, { token: tokenCliente });
        assert.equal(resDetalle.respuesta.status, 200);
    });

    test("8. Venta directa sin cliente mantiene el flujo actual y no se asocia al Cajero", async () => {
        const resVentaAnonima = await solicitar("/ventas/directa", {
            method: "POST",
            token: tokenCajero,
            body: {
                items: [{ productoId: productoTest.id, cantidad: 1 }],
                metodoPago: "Tarjeta",
                cobrar: true
            }
        });

        assert.equal(resVentaAnonima.respuesta.status, 201);
        const venta = resVentaAnonima.datos.venta;
        idsVentas.push(venta.id);

        // usuarioId no debe ser el del cajero ni de ningún cliente
        assert.equal(venta.usuarioId, null);
        assert.equal(venta.estado, "COBRADA");

        // No debe aparecer en el historial del cliente
        const resHistorial = await solicitar("/ventas", { token: tokenCliente });
        const ventasCliente = resHistorial.datos.ventas || [];
        const ventaEncontrada = ventasCliente.find((v) => v.id === venta.id);
        assert.equal(ventaEncontrada, undefined);
    });

    test("9. Venta directa asociando cliente únicamente por DNI resuelve el cliente en la base de datos", async () => {
        const resVenta = await solicitar("/ventas/directa", {
            method: "POST",
            token: tokenCajero,
            body: {
                items: [{ productoId: productoTest.id, cantidad: 1 }],
                cliente: {
                    dni: otroClienteUsuario.dni
                },
                metodoPago: "Efectivo",
                efectivoRecibido: 2000,
                cobrar: true
            }
        });

        assert.equal(resVenta.respuesta.status, 201);
        const venta = resVenta.datos.venta;
        idsVentas.push(venta.id);

        assert.equal(venta.usuarioId, otroClienteUsuario.id);
        assert.equal(venta.clienteNombre, otroClienteUsuario.nombre);
        assert.equal(venta.clienteDni, otroClienteUsuario.dni);
        assert.equal(venta.clienteEmail, otroClienteUsuario.email);
        assert.equal(venta.estado, "COBRADA");
    });

    test("10. Venta directa rechaza asociar como cliente a un usuario con otro rol", async () => {
        const resVenta = await solicitar("/ventas/directa", {
            method: "POST",
            token: tokenCajero,
            body: {
                items: [{ productoId: productoTest.id, cantidad: 1 }],
                cliente: {
                    id: adminUsuario.id,
                    dni: adminUsuario.dni
                }
            }
        });

        assert.equal(resVenta.respuesta.status, 404);
    });
});
