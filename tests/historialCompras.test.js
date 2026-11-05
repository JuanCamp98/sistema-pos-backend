require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

describe("TASK-012: Historial de compras del cliente", () => {
    let server;
    let baseUrl;
    let clienteA;
    let clienteB;
    let productoTest;
    let categoriaTest;
    let tipoProductoTest;
    let tokenClienteA;
    let tokenClienteB;
    let tokenCajero;
    let ventaClienteA;
    let ventaClienteB;

    before(async () => {
        // Start ephemeral server
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;

        // Ensure roles exist
        const rolCliente = await prisma.rol.upsert({
            where: { nombre: "Cliente" },
            update: {},
            create: { nombre: "Cliente" }
        });
        const rolCajero = await prisma.rol.upsert({
            where: { nombre: "Cajero" },
            update: {},
            create: { nombre: "Cajero" }
        });

        categoriaTest = await prisma.categoria.create({
            data: { nombre: "Test Historial " + Date.now() }
        });
        tipoProductoTest = await prisma.tipoProducto.upsert({
            where: { nombre: "General" },
            update: {},
            create: { nombre: "General" }
        });

        // Ensure product exists
        productoTest = await prisma.producto.create({
            data: {
                nombre: "Producto Test Historial " + Date.now(),
                precio: 1250.50,
                stock: 100,
                categoriaId: categoriaTest.id,
                tipoProductoId: tipoProductoTest.id,
                activo: true
            }
        });

        // Create 2 test clients
        const uniqueSuffix = Date.now().toString().slice(-6);
        clienteA = await prisma.usuario.create({
            data: {
                nombre: "ClienteA",
                apellido: "Test",
                dni: "91" + uniqueSuffix,
                email: `clientea_${uniqueSuffix}@pos.local`,
                contrasena: "hashedpassword",
                rolId: rolCliente.id
            }
        });

        clienteB = await prisma.usuario.create({
            data: {
                nombre: "ClienteB",
                apellido: "Test",
                dni: "92" + uniqueSuffix,
                email: `clienteb_${uniqueSuffix}@pos.local`,
                contrasena: "hashedpassword",
                rolId: rolCliente.id
            }
        });

        // Generate tokens
        tokenClienteA = jwt.sign(
            { id: clienteA.id, rol: "Cliente" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        tokenClienteB = jwt.sign(
            { id: clienteB.id, rol: "Cliente" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        tokenCajero = jwt.sign(
            { id: "cajero-uuid", rol: "Cajero" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        // Create a sale for Cliente A
        ventaClienteA = await prisma.venta.create({
            data: {
                usuarioId: clienteA.id,
                clienteNombre: clienteA.nombre,
                clienteApellido: clienteA.apellido,
                clienteDni: clienteA.dni,
                clienteEmail: clienteA.email,
                codigoComprobante: `V-TEST-A-${uniqueSuffix}`,
                estado: "COBRADA",
                metodoPago: "Efectivo",
                total: 2501.00,
                detalles: {
                    create: [
                        {
                            productoId: productoTest.id,
                            cantidad: 2,
                            precioUnitario: 1250.50,
                            subtotal: 2501.00
                        }
                    ]
                }
            }
        });

        // Create a sale for Cliente B
        ventaClienteB = await prisma.venta.create({
            data: {
                usuarioId: clienteB.id,
                clienteNombre: clienteB.nombre,
                clienteApellido: clienteB.apellido,
                clienteDni: clienteB.dni,
                clienteEmail: clienteB.email,
                codigoComprobante: `V-TEST-B-${uniqueSuffix}`,
                estado: "COBRADA",
                metodoPago: "MercadoPago",
                total: 1250.50,
                detalles: {
                    create: [
                        {
                            productoId: productoTest.id,
                            cantidad: 1,
                            precioUnitario: 1250.50,
                            subtotal: 1250.50
                        }
                    ]
                }
            }
        });
    });

    after(async () => {
        // Cleanup test data
        if (ventaClienteA) {
            await prisma.detalleVenta.deleteMany({ where: { ventaId: ventaClienteA.id } });
            await prisma.venta.delete({ where: { id: ventaClienteA.id } });
        }
        if (ventaClienteB) {
            await prisma.detalleVenta.deleteMany({ where: { ventaId: ventaClienteB.id } });
            await prisma.venta.delete({ where: { id: ventaClienteB.id } });
        }
        if (productoTest) {
            await prisma.producto.delete({ where: { id: productoTest.id } });
        }
        if (categoriaTest) {
            await prisma.categoria.delete({ where: { id: categoriaTest.id } });
        }
        if (clienteA) {
            await prisma.usuario.delete({ where: { id: clienteA.id } });
        }
        if (clienteB) {
            await prisma.usuario.delete({ where: { id: clienteB.id } });
        }
        await prisma.$disconnect();
        await new Promise((resolve) => server.close(resolve));
    });

    test("1. Rechaza la petición a GET /ventas si no se envía token (401)", async () => {
        const res = await fetch(`${baseUrl}/ventas`);
        assert.strictEqual(res.status, 401);
    });

    test("2. Rechaza la petición si el rol del usuario no tiene permisos (403)", async () => {
        const tokenInvalido = jwt.sign(
            { id: "alguno", rol: "Invitado" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        const res = await fetch(`${baseUrl}/ventas`, {
            headers: { Authorization: `Bearer ${tokenInvalido}` }
        });
        assert.strictEqual(res.status, 403);
    });

    test("3. Cliente autenticado puede consultar su historial y solo ve sus compras", async () => {
        const res = await fetch(`${baseUrl}/ventas`, {
            headers: { Authorization: `Bearer ${tokenClienteA}` }
        });
        assert.strictEqual(res.status, 200);

        const data = await res.json();
        assert.ok(Array.isArray(data.ventas), "data.ventas debe ser un array");
        assert.ok(data.ventas.length >= 1, "Debe contener al menos la venta creada para el cliente A");

        // Ninguna de las ventas debe pertenecer al cliente B
        const tieneVentaB = data.ventas.some((v) => v.id === ventaClienteB.id);
        assert.strictEqual(tieneVentaB, false, "No debe incluir ventas de otros clientes");

        const miVenta = data.ventas.find((v) => v.id === ventaClienteA.id);
        assert.ok(miVenta, "Debe incluir la venta del cliente A");
        assert.strictEqual(miVenta.codigoComprobante, ventaClienteA.codigoComprobante);
        assert.strictEqual(Number(miVenta.total), 2501.00);

        // Verifica que los detalles incluyan información del producto
        assert.ok(Array.isArray(miVenta.detalles));
        assert.strictEqual(miVenta.detalles.length, 1);
        assert.strictEqual(miVenta.detalles[0].producto.nombre, productoTest.nombre);
        assert.strictEqual(miVenta.detalles[0].cantidad, 2);
    });

    test("4. Seguridad: Si el cliente envía clienteId de otro cliente en query, el backend lo ignora y fuerza el suyo", async () => {
        const res = await fetch(`${baseUrl}/ventas?clienteId=${clienteB.id}`, {
            headers: { Authorization: `Bearer ${tokenClienteA}` }
        });
        assert.strictEqual(res.status, 200);

        const data = await res.json();
        // A pesar de pedir clienteId de B, debe devolver ventas de A
        const tieneVentaB = data.ventas.some((v) => v.id === ventaClienteB.id);
        assert.strictEqual(tieneVentaB, false, "No debe devolver ventas de B aunque las solicite por query param");

        const miVenta = data.ventas.find((v) => v.id === ventaClienteA.id);
        assert.ok(miVenta, "Debe seguir devolviendo solo las ventas de A");
    });

    test("5. Seguridad: Un cliente no puede consultar el detalle de la venta de otro cliente vía GET /ventas/:id (403)", async () => {
        // Cliente A intenta acceder a la venta de Cliente B
        const res = await fetch(`${baseUrl}/ventas/${ventaClienteB.id}`, {
            headers: { Authorization: `Bearer ${tokenClienteA}` }
        });
        assert.strictEqual(res.status, 403);
    });

    test("6. Un cliente sí puede consultar el detalle de su propia venta vía GET /ventas/:id", async () => {
        const res = await fetch(`${baseUrl}/ventas/${ventaClienteA.id}`, {
            headers: { Authorization: `Bearer ${tokenClienteA}` }
        });
        assert.strictEqual(res.status, 200);

        const data = await res.json();
        assert.ok(data.venta);
        assert.strictEqual(data.venta.id, ventaClienteA.id);
        assert.strictEqual(data.venta.detalles[0].producto.nombre, productoTest.nombre);
    });

    test("7. Cliente sin compras recibe lista vacía", async () => {
        const rolCliente = await prisma.rol.findUnique({ where: { nombre: "Cliente" } });
        const uniqueSuffix2 = (Date.now() + 1).toString().slice(-6);
        const clienteSinCompras = await prisma.usuario.create({
            data: {
                nombre: "SinCompras",
                apellido: "Test",
                dni: "93" + uniqueSuffix2,
                email: `sincompras_${uniqueSuffix2}@pos.local`,
                contrasena: "hashedpassword",
                rolId: rolCliente.id
            }
        });

        const tokenSinCompras = jwt.sign(
            { id: clienteSinCompras.id, rol: "Cliente" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        const res = await fetch(`${baseUrl}/ventas`, {
            headers: { Authorization: `Bearer ${tokenSinCompras}` }
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.ventas.length, 0);

        await prisma.usuario.delete({ where: { id: clienteSinCompras.id } });
    });
});
