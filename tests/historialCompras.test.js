require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const comprobantePdfService = require("../src/services/comprobantePdfService");

function extraerBloquesTextoPdf(pdf) {
    const contenido = pdf.toString("latin1");
    return Array.from(contenido.matchAll(/BT([\s\S]*?)ET/g), function (coincidencia) {
        return Array.from(coincidencia[1].matchAll(/<([a-f0-9]+)>/gi), function (texto) {
            return Buffer.from(texto[1], "hex").toString("latin1");
        }).join("").trim();
    });
}

function extraerTextoPdf(pdf) {
    return extraerBloquesTextoPdf(pdf).join("");
}

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
    let tokenAdministrador;
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
        tokenAdministrador = jwt.sign(
            { id: "administrador-uuid", rol: "Administrador" },
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
            await prisma.detalleVenta.deleteMany({ where: { productoId: productoTest.id } });
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
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
            server.closeAllConnections();
        });
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

    test("3a. Cliente autenticado puede definir un nombre personalizado al confirmar una compra", async () => {
        const fechaRetiro = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const fechaRetiroISO = new Date(fechaRetiro.getTime() - fechaRetiro.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

        await prisma.configuracionRetiro.upsert({
            where: { id: 1 },
            update: {
                configuracion: {
                    diasAtencion: [0, 1, 2, 3, 4, 5, 6],
                    horaApertura: "08:00",
                    horaCierre: "20:00",
                    intervaloMinutos: 60,
                    excepciones: []
                }
            },
            create: {
                id: 1,
                configuracion: {
                    diasAtencion: [0, 1, 2, 3, 4, 5, 6],
                    horaApertura: "08:00",
                    horaCierre: "20:00",
                    intervaloMinutos: 60,
                    excepciones: []
                }
            }
        });

        const res = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenClienteA}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                nombrePersonalizado: "  Compra   confirmada  ",
                items: [{ productoId: productoTest.id, cantidad: 1 }],
                retiro: {
                    fecha: fechaRetiroISO,
                    horaInicio: "10:00",
                    horaFin: "11:00"
                }
            })
        });
        assert.strictEqual(res.status, 201);
        const data = await res.json();
        assert.strictEqual(data.venta.nombrePersonalizado, "Compra confirmada");
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
        assert.strictEqual(miVenta.nombrePersonalizado, null);
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
        assert.strictEqual(data.venta.nombrePersonalizado, null);
        assert.strictEqual(data.venta.detalles[0].producto.nombre, productoTest.nombre);
    });

    test("Renombrar compra: valida autenticación, propiedad, nombre y conserva datos de venta", async () => {
        const url = `${baseUrl}/ventas/${ventaClienteA.id}/nombre`;
        const sinSesion = await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombrePersonalizado: "Compra semanal" })
        });
        assert.strictEqual(sinSesion.status, 401);
        await sinSesion.arrayBuffer();

        const nombreVacio = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${tokenClienteA}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ nombrePersonalizado: "   " })
        });
        assert.strictEqual(nombreVacio.status, 400);
        await nombreVacio.arrayBuffer();

        const nombreLargo = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${tokenClienteA}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ nombrePersonalizado: "x".repeat(81) })
        });
        assert.strictEqual(nombreLargo.status, 400);
        await nombreLargo.arrayBuffer();

        const codigoOriginal = ventaClienteA.codigoComprobante;
        const totalOriginal = Number(ventaClienteA.total);
        const respuestaInicial = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${tokenClienteA}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ nombrePersonalizado: "  Compra   semanal  " })
        });
        assert.strictEqual(respuestaInicial.status, 200);
        const resultadoInicial = await respuestaInicial.json();
        assert.strictEqual(resultadoInicial.venta.nombrePersonalizado, "Compra semanal");
        assert.strictEqual(resultadoInicial.venta.codigoComprobante, codigoOriginal);
        assert.strictEqual(Number(resultadoInicial.venta.total), totalOriginal);

        const historial = await fetch(`${baseUrl}/ventas`, {
            headers: { Authorization: `Bearer ${tokenClienteA}` }
        });
        const historialData = await historial.json();
        const compraHistorial = historialData.ventas.find((venta) => venta.id === ventaClienteA.id);
        assert.strictEqual(compraHistorial.nombrePersonalizado, "Compra semanal");

        const detalle = await fetch(`${baseUrl}/ventas/${ventaClienteA.id}`, {
            headers: { Authorization: `Bearer ${tokenClienteA}` }
        });
        const detalleData = await detalle.json();
        assert.strictEqual(detalleData.venta.nombrePersonalizado, "Compra semanal");
        assert.strictEqual(detalleData.venta.codigoComprobante, codigoOriginal);
        assert.strictEqual(Number(detalleData.venta.total), totalOriginal);
        assert.strictEqual(detalleData.venta.detalles[0].cantidad, 2);

        const respuestaModificacion = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${tokenClienteA}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ nombrePersonalizado: "Compra mensual" })
        });
        assert.strictEqual(respuestaModificacion.status, 200);
        assert.strictEqual((await respuestaModificacion.json()).venta.nombrePersonalizado, "Compra mensual");

        const ajena = await fetch(`${baseUrl}/ventas/${ventaClienteB.id}/nombre`, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${tokenClienteA}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ nombrePersonalizado: "No autorizada" })
        });
        assert.strictEqual(ajena.status, 403);
        await ajena.arrayBuffer();
        const compraAjena = await prisma.venta.findUnique({
            where: { id: ventaClienteB.id },
            select: { nombrePersonalizado: true }
        });
        assert.strictEqual(compraAjena.nombrePersonalizado, null);
    });

    test("7. El cliente descarga un PDF con los datos históricos de su compra", async () => {
        const productoAdicional = await prisma.producto.create({
            data: {
                nombre: "Producto adicional comprobante",
                precio: 7000,
                stock: 10,
                categoriaId: categoriaTest.id,
                tipoProductoId: tipoProductoTest.id,
                activo: true
            }
        });
        const ventaPdf = await prisma.venta.create({
            data: {
                usuarioId: clienteA.id,
                clienteNombre: clienteA.nombre,
                nombrePersonalizado: "Compra para mi casa",
                codigoComprobante: `V-TEST-PDF-${Date.now()}`,
                fechaRetiro: new Date("2030-05-17T00:00:00.000Z"),
                horarioRetiroInicio: "08:00",
                horarioRetiroFin: "09:00",
                estado: "COBRADA",
                total: 2726.75,
                detalles: {
                    create: [
                        { productoId: productoTest.id, cantidad: 2, precioUnitario: 1250.50, subtotal: 2501.00 },
                        { productoId: productoAdicional.id, cantidad: 3, precioUnitario: 75.25, subtotal: 225.75 }
                    ]
                }
            }
        });

        try {
            const res = await fetch(`${baseUrl}/ventas/${ventaPdf.id}/comprobante.pdf`, {
                headers: { Authorization: `Bearer ${tokenClienteA}` }
            });
            assert.strictEqual(res.status, 200);
            assert.match(res.headers.get("content-type"), /application\/pdf/);
            assert.match(res.headers.get("content-disposition"), /comprobante-compra-V-TEST-PDF-/);

            const pdf = Buffer.from(await res.arrayBuffer());
            const pdfBytes = pdf.toString("latin1");
            const bloquesTexto = extraerBloquesTextoPdf(pdf);
            const contenido = extraerTextoPdf(pdf);
            assert.ok(pdfBytes.startsWith("%PDF-"));
            assert.ok(pdfBytes.endsWith("%%EOF\n"));
            assert.ok(contenido.includes(productoTest.nombre));
            assert.ok(contenido.includes("Producto adicional comprobante"));
            assert.ok(contenido.includes("Compra para mi casa"));
            assert.ok(contenido.includes("Fecha de retiro"));
            assert.ok(contenido.includes("17/05/2030"));
            assert.ok(contenido.includes("08:00 a 09:00"));
            assert.ok(!contenido.includes("Fecha de retironull"));
            assert.ok(bloquesTexto.includes("2"));
            assert.ok(bloquesTexto.includes("3"));
            assert.ok(contenido.includes("2.501,00"));
            assert.ok(contenido.includes("75,25"));
            assert.ok(contenido.includes("2.726,75"));
            assert.match(contenido, /Descuentos:.*0,00/);
            assert.ok(contenido.includes("COBRADA"));
        } finally {
            await prisma.detalleVenta.deleteMany({ where: { ventaId: ventaPdf.id } });
            await prisma.venta.delete({ where: { id: ventaPdf.id } });
            await prisma.producto.delete({ where: { id: productoAdicional.id } });
        }
    });

    test("7a. La compra anónima de autogestión descarga el PDF usando el código público sin sesión", async () => {
        const codigoComprobante = `V-TEST-ANONIMO-${Date.now()}`;
        const ventaAnonima = await prisma.venta.create({
            data: {
                codigoComprobante,
                clienteNombre: "Consumidor final",
                estado: "COBRADA",
                total: 1250.50,
                detalles: {
                    create: [{
                        productoId: productoTest.id,
                        cantidad: 1,
                        precioUnitario: 1250.50,
                        subtotal: 1250.50
                    }]
                }
            }
        });

        try {
            const res = await fetch(`${baseUrl}/ventas/comprobante/${encodeURIComponent(codigoComprobante)}/pdf`);
            assert.strictEqual(res.status, 200);
            assert.match(res.headers.get("content-type"), /application\/pdf/);
            assert.match(res.headers.get("content-disposition"), /comprobante-compra-V-TEST-ANONIMO-/);
            assert.strictEqual(res.headers.get("cache-control"), "no-store");

            const pdf = Buffer.from(await res.arrayBuffer());
            assert.strictEqual(pdf.subarray(0, 5).toString(), "%PDF-");
            assert.ok(extraerTextoPdf(pdf).includes(codigoComprobante));
            assert.ok(extraerTextoPdf(pdf).includes(productoTest.nombre));
        } finally {
            await prisma.detalleVenta.deleteMany({ where: { ventaId: ventaAnonima.id } });
            await prisma.venta.delete({ where: { id: ventaAnonima.id } });
        }
    });

    test("8. Rechaza descargas sin sesión y de compras de otras personas", async () => {
        const sinSesion = await fetch(`${baseUrl}/ventas/${ventaClienteA.id}/comprobante.pdf`);
        assert.strictEqual(sinSesion.status, 401);

        const res = await fetch(`${baseUrl}/ventas/${ventaClienteB.id}/comprobante.pdf`, {
            headers: { Authorization: `Bearer ${tokenClienteA}` }
        });
        assert.strictEqual(res.status, 403);
    });

    test("9. Cajero y administrador pueden descargar comprobantes", async () => {
        for (const token of [tokenCajero, tokenAdministrador]) {
            const res = await fetch(`${baseUrl}/ventas/${ventaClienteA.id}/comprobante.pdf`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            assert.strictEqual(res.status, 200);
            const pdf = Buffer.from(await res.arrayBuffer());
            assert.strictEqual(pdf.subarray(0, 5).toString(), "%PDF-");
        }
    });

    test("10. Un comprobante sin productos o con datos opcionales ausentes genera un PDF válido", async () => {
        const ventaSinDetalles = await prisma.venta.create({
            data: {
                codigoComprobante: `V-TEST-VACIA-${Date.now()}`,
                total: 0,
                usuarioId: clienteA.id,
                estado: "PENDIENTE"
            }
        });

        try {
            const res = await fetch(`${baseUrl}/ventas/${ventaSinDetalles.id}/comprobante.pdf`, {
                headers: { Authorization: `Bearer ${tokenClienteA}` }
            });
            assert.strictEqual(res.status, 200);
            const pdf = Buffer.from(await res.arrayBuffer());
            const contenido = extraerTextoPdf(pdf);
            assert.strictEqual(pdf.subarray(0, 5).toString(), "%PDF-");
            assert.ok(contenido.replace(/\s+/g, "").includes("Nohayproductosregistradosparaestacompra."));
            assert.ok(contenido.includes("Consumidor final"));
        } finally {
            await prisma.venta.delete({ where: { id: ventaSinDetalles.id } });
        }
    });

    test("11. Informa un error del generador sin devolver un PDF inválido", async () => {
        const generadorOriginal = comprobantePdfService.generarComprobantePdf;
        comprobantePdfService.generarComprobantePdf = async function () {
            throw new Error("Fallo de prueba en la generación");
        };

        try {
            const res = await fetch(`${baseUrl}/ventas/${ventaClienteA.id}/comprobante.pdf`, {
                headers: { Authorization: `Bearer ${tokenClienteA}` }
            });
            assert.strictEqual(res.status, 500);
            assert.match((await res.json()).mensaje, /error en el servidor/i);
        } finally {
            comprobantePdfService.generarComprobantePdf = generadorOriginal;
        }
    });

    test("12. Cliente sin compras recibe lista vacía", async () => {
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
