require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const mercadoPagoQrService = require("../src/services/mercadoPagoQrService");

function extraerTextoPdf(pdf) {
    const contenido = pdf.toString("latin1");
    return Array.from(contenido.matchAll(/BT([\s\S]*?)ET/g), function (coincidencia) {
        return Array.from(coincidencia[1].matchAll(/<([a-f0-9]+)>/gi), function (texto) {
            return Buffer.from(texto[1], "hex").toString("latin1");
        }).join("").trim();
    }).join("");
}

describe("Promociones 2x1 y combo", () => {
    let server;
    let baseUrl;
    let administrador;
    let token;
    let categoria;
    let producto;
    let productoAjeno;
    let productoComboA;
    let productoComboB;
    let promo2x1;
    let promoCombo;
    let promoComboCompetencia;
    let promoPorcentaje;
    let promoInactiva;
    let promoVencida;
    let ventas = [];

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
            datos: tipo.includes("application/json") ? await respuesta.json() : await respuesta.arrayBuffer()
        };
    }

    async function crearPromocion(datos) {
        const resultado = await solicitar("/promociones", {
            method: "POST",
            token,
            body: {
                titulo: "Promo " + Date.now() + " " + Math.random(),
                descripcion: "",
                tipoDescuento: "DOS_POR_UNO",
                valorDescuento: null,
                fechaInicio: new Date(Date.now() - 60_000).toISOString(),
                fechaFin: new Date(Date.now() + 60 * 60_000).toISOString(),
                activo: true,
                productoIds: [producto.id],
                categorias: [],
                ...datos
            }
        });
        assert.equal(resultado.respuesta.status, 201);
        return resultado.datos.promocion;
    }

    async function registrarVenta(productoVenta = producto, cantidad = 1, camposExtra = {}) {
        return registrarVentaConItems([{
            productoId: productoVenta.id,
            cantidad,
            precio: 0.01,
            descuento: 999999,
            precioUnitario: 0
        }], camposExtra);
    }

    async function registrarVentaConItems(items, camposExtra = {}) {
        const resultado = await solicitar("/ventas/directa", {
            method: "POST",
            token,
            body: {
                items,
                metodoPago: "Efectivo",
                cobrar: false,
                ...camposExtra
            }
        });
        assert.equal(resultado.respuesta.status, 201);
        ventas.push(resultado.datos.venta.id);
        return resultado.datos.venta;
    }

    before(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = "http://127.0.0.1:" + server.address().port;

        const rol = await prisma.rol.upsert({
            where: { nombre: "Cliente" },
            update: {},
            create: { nombre: "Cliente" }
        });
        const marca = Date.now().toString();
        administrador = await prisma.usuario.create({
            data: {
                nombre: "Admin",
                apellido: "Promos",
                dni: marca.slice(-8),
                email: "promo-2x1-" + marca + "@pos.local",
                contrasena: "hashed-password",
                rolId: rol.id
            }
        });
        token = jwt.sign({ id: administrador.id, rol: "Administrador" }, process.env.JWT_SECRET, { expiresIn: "1h" });

        categoria = await prisma.categoria.create({ data: { nombre: "Categoría 2x1 " + marca } });
        const tipoProducto = await prisma.tipoProducto.upsert({
            where: { nombre: "General" },
            update: {},
            create: { nombre: "General" }
        });
        producto = await prisma.producto.create({
            data: {
                nombre: "Producto 2x1 " + marca,
                precio: 2000,
                stock: 100,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });
        productoAjeno = await prisma.producto.create({
            data: {
                nombre: "Producto sin promo " + marca,
                precio: 300,
                stock: 20,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });
        productoComboA = await prisma.producto.create({
            data: {
                nombre: "Café de combo " + marca,
                precio: 200,
                stock: 100,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });
        productoComboB = await prisma.producto.create({
            data: {
                nombre: "Medialuna de combo " + marca,
                precio: 100,
                stock: 100,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });

        promo2x1 = await crearPromocion({});
        promoCombo = await crearPromocion({
            titulo: "Café + medialuna " + marca,
            tipoDescuento: "COMBO",
            valorDescuento: null,
            precioCombo: 250,
            productoIds: [productoComboA.id, productoComboB.id]
        });
    });

    after(async () => {
        if (ventas.length) {
            await prisma.movimientoStock.deleteMany({ where: { referenciaId: { in: ventas } } });
            await prisma.detalleVenta.deleteMany({ where: { ventaId: { in: ventas } } });
            await prisma.venta.deleteMany({ where: { id: { in: ventas } } });
        }
        const promoIds = [promo2x1?.id, promoCombo?.id, promoComboCompetencia?.id, promoPorcentaje?.id, promoInactiva?.id, promoVencida?.id].filter(Boolean);
        if (promoIds.length) await prisma.promocion.deleteMany({ where: { id: { in: promoIds } } });
        if (producto || productoAjeno) {
            await prisma.promocionProducto.deleteMany({
                where: { productoId: { in: [producto?.id, productoAjeno?.id, productoComboA?.id, productoComboB?.id].filter(Boolean) } }
            });
        }
        for (const productoTemporal of [producto, productoAjeno, productoComboA, productoComboB].filter(Boolean)) {
            await prisma.producto.update({ where: { id: productoTemporal.id }, data: { stockReservado: 0 } });
            await prisma.producto.delete({ where: { id: productoTemporal.id } });
        }
        if (categoria) await prisma.categoria.delete({ where: { id: categoria.id } });
        if (administrador) await prisma.usuario.delete({ where: { id: administrador.id } });
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    test("aplica el 2x1 a cantidades 1, 2, 3 y 4 y persiste el precio original, el ahorro y las unidades gratis", async () => {
        const esperados = [
            { cantidad: 1, subtotal: 2000, descuento: 0, bonificadas: 0 },
            { cantidad: 2, subtotal: 2000, descuento: 2000, bonificadas: 1 },
            { cantidad: 3, subtotal: 4000, descuento: 2000, bonificadas: 1 },
            { cantidad: 4, subtotal: 4000, descuento: 4000, bonificadas: 2 }
        ];

        for (const esperado of esperados) {
            const venta = await registrarVenta(producto, esperado.cantidad);
            const detalle = venta.detalles[0];
            assert.equal(Number(venta.total), esperado.subtotal);
            assert.equal(Number(detalle.precioUnitario), 2000);
            assert.equal(Number(detalle.subtotal), esperado.subtotal);
            assert.equal(Number(detalle.descuentoTotal), esperado.descuento);
            assert.equal(detalle.unidadesBonificadas, esperado.bonificadas);
            assert.equal(detalle.promocionTitulo, esperado.bonificadas ? promo2x1.titulo : null);
        }
    });

    test("rechaza un valor de descuento numérico para una promoción 2x1", async () => {
        const resultado = await solicitar("/promociones", {
            method: "POST",
            token,
            body: {
                titulo: "2x1 inválida",
                tipoDescuento: "DOS_POR_UNO",
                valorDescuento: 10,
                fechaInicio: new Date(Date.now() - 60_000).toISOString(),
                fechaFin: new Date(Date.now() + 60 * 60_000).toISOString(),
                activo: true,
                productoIds: [producto.id],
                categorias: []
            }
        });
        assert.equal(resultado.respuesta.status, 400);
    });

    test("rechaza combos incompletos, basados en categorías o sin ahorro real", async () => {
        const base = {
            titulo: "Combo inválido " + Date.now(),
            tipoDescuento: "COMBO",
            precioCombo: 100,
            fechaInicio: new Date(Date.now() - 60_000).toISOString(),
            fechaFin: new Date(Date.now() + 60 * 60_000).toISOString(),
            activo: true,
            categorias: []
        };
        const soloUnProducto = await solicitar("/promociones", {
            method: "POST",
            token,
            body: { ...base, productoIds: [productoComboA.id] }
        });
        assert.equal(soloUnProducto.respuesta.status, 400);

        const porCategoria = await solicitar("/promociones", {
            method: "POST",
            token,
            body: { ...base, productoIds: [productoComboA.id, productoComboB.id], categorias: [categoria.nombre] }
        });
        assert.equal(porCategoria.respuesta.status, 400);

        const sinAhorro = await solicitar("/promociones", {
            method: "POST",
            token,
            body: { ...base, productoIds: [productoComboA.id, productoComboB.id], precioCombo: 300 }
        });
        assert.equal(sinAhorro.respuesta.status, 400);
    });

    test("incluye el precio del combo en el catálogo de promociones vigentes", async () => {
        const resultado = await solicitar("/promociones/vigentes");
        assert.equal(resultado.respuesta.status, 200);
        const comboPublicado = resultado.datos.promociones.find((promocion) => promocion.id === promoCombo.id);
        assert.ok(comboPublicado);
        assert.equal(Number(comboPublicado.precioCombo), 250);
    });

    test("aplica el precio fijo por combo completo, repite conjuntos y cobra sobrantes normalmente", async () => {
        const venta = await registrarVentaConItems([
            { productoId: productoComboA.id, cantidad: 2 },
            { productoId: productoComboB.id, cantidad: 3 }
        ]);
        assert.equal(Number(venta.total), 600);
        const detalleA = venta.detalles.find((detalle) => detalle.productoId === productoComboA.id);
        const detalleB = venta.detalles.find((detalle) => detalle.productoId === productoComboB.id);
        assert.equal(Number(detalleA.precioUnitario), 200);
        assert.equal(Number(detalleB.precioUnitario), 100);
        assert.equal(Number(detalleA.subtotal) + Number(detalleB.subtotal), 600);
        assert.equal(Number(detalleA.descuentoTotal) + Number(detalleB.descuentoTotal), 100);
        assert.equal(detalleA.combosAplicados, 2);
        assert.equal(detalleB.combosAplicados, 2);
        assert.match(detalleA.promocionTitulo, /Combo: Café \+ medialuna/);
        assert.match(detalleB.promocionTitulo, /Combo: Café \+ medialuna/);
        const pdf = await solicitar("/ventas/" + venta.id + "/comprobante.pdf", { token });
        assert.equal(pdf.respuesta.status, 200);
        assert.match(extraerTextoPdf(Buffer.from(pdf.datos)), /2 combo\(s\)aplicado\(s\)/);

        const incompleta = await registrarVentaConItems([
            { productoId: productoComboA.id, cantidad: 1 }
        ]);
        assert.equal(Number(incompleta.total), 200);
        assert.equal(incompleta.detalles[0].combosAplicados, 0);
    });

    test("no combina el precio fijo cuando las promociones individuales ahorran más", async () => {
        promoComboCompetencia = await crearPromocion({
            titulo: "Descuento individual combo " + Date.now(),
            tipoDescuento: "PORCENTAJE",
            valorDescuento: 50,
            productoIds: [productoComboA.id],
            categorias: []
        });
        const venta = await registrarVentaConItems([
            { productoId: productoComboA.id, cantidad: 1 },
            { productoId: productoComboB.id, cantidad: 1 }
        ]);
        assert.equal(Number(venta.total), 200);
        const detalleA = venta.detalles.find((detalle) => detalle.productoId === productoComboA.id);
        const detalleB = venta.detalles.find((detalle) => detalle.productoId === productoComboB.id);
        assert.equal(detalleA.combosAplicados, 0);
        assert.equal(detalleB.combosAplicados, 0);
        assert.equal(Number(detalleA.descuentoTotal), 100);
        assert.equal(Number(detalleB.descuentoTotal), 0);
    });

    test("no aplica una promoción a un producto no alcanzado y el cliente no puede enviar su propio precio", async () => {
        const venta = await registrarVenta(productoAjeno, 2);
        assert.equal(Number(venta.total), 600);
        assert.equal(Number(venta.detalles[0].precioUnitario), 300);
        assert.equal(Number(venta.detalles[0].descuentoTotal), 0);
        assert.equal(venta.detalles[0].unidadesBonificadas, 0);
    });

    test("selecciona solo la promoción más conveniente cuando hay promociones incompatibles", async () => {
        promoPorcentaje = await crearPromocion({
            titulo: "Porcentaje competitivo " + Date.now(),
            tipoDescuento: "PORCENTAJE",
            valorDescuento: 20
        });
        const venta = await registrarVenta(producto, 4);
        const detalle = venta.detalles[0];
        assert.equal(Number(detalle.descuentoTotal), 4000);
        assert.equal(detalle.unidadesBonificadas, 2);
        assert.equal(detalle.promocionTitulo, promo2x1.titulo);
    });

    test("ignora promociones inactivas o fuera de vigencia", async () => {
        await prisma.promocion.update({ where: { id: promo2x1.id }, data: { activo: false } });
        await prisma.promocion.update({ where: { id: promoPorcentaje.id }, data: { activo: false } });
        promoInactiva = promo2x1;
        promo2x1 = null;
        promoVencida = await crearPromocion({
            titulo: "Promo vencida " + Date.now(),
            fechaInicio: new Date(Date.now() - 48 * 60 * 60_000).toISOString(),
            fechaFin: new Date(Date.now() - 24 * 60 * 60_000).toISOString()
        });
        const productoConsultado = await solicitar("/productos/" + producto.id);
        assert.equal(productoConsultado.respuesta.status, 200);
        assert.deepEqual(productoConsultado.datos.producto.promocionesDisponibles, []);
        const venta = await registrarVenta(producto, 4);
        assert.equal(Number(venta.total), 8000);
        assert.equal(Number(venta.detalles[0].descuentoTotal), 0);
    });

    test("permite actualizar una promoción 2x1 existente manteniendo el tipo y el alcance", async () => {
        await prisma.promocion.update({ where: { id: promoInactiva.id }, data: { activo: true } });
        const actualizada = await solicitar("/promociones/" + promoInactiva.id, {
            method: "PUT",
            token,
            body: { titulo: "2x1 editada " + Date.now() }
        });
        assert.equal(actualizada.respuesta.status, 200, JSON.stringify(actualizada.datos));
        assert.equal(actualizada.datos.promocion.tipoDescuento, "DOS_POR_UNO");
        assert.equal(actualizada.datos.promocion.valorDescuento, null);
        assert.equal(actualizada.datos.promocion.activo, true);
        assert.equal(await prisma.promocionProducto.count({
            where: { promocionId: promoInactiva.id, productoId: producto.id }
        }), 1);
        const productoActualizado = await solicitar("/productos/" + producto.id);
        assert.equal(productoActualizado.datos.producto.promocionesDisponibles.some((promo) => promo.id === promoInactiva.id), true);
    });

    test("permite editar el precio de un combo y conserva sus productos", async () => {
        const actualizada = await solicitar("/promociones/" + promoCombo.id, {
            method: "PUT",
            token,
            body: { titulo: "Combo editado " + Date.now(), precioCombo: 240 }
        });
        assert.equal(actualizada.respuesta.status, 200, JSON.stringify(actualizada.datos));
        assert.equal(actualizada.datos.promocion.tipoDescuento, "COMBO");
        assert.equal(Number(actualizada.datos.promocion.precioCombo), 240);
        assert.equal(await prisma.promocionProducto.count({
            where: {
                promocionId: promoCombo.id,
                productoId: { in: [productoComboA.id, productoComboB.id] }
            }
        }), 2);
    });

    test("la venta y el PDF conservan el precio original y reflejan el descuento aplicado", async () => {
        const venta = await registrarVenta(producto, 4);
        const ventaDb = await prisma.venta.findUnique({
            where: { id: venta.id },
            include: { detalles: { include: { producto: true } } }
        });
        assert.equal(Number(ventaDb.total), 4000);
        assert.equal(Number(ventaDb.detalles[0].precioUnitario), 2000);
        assert.equal(Number(ventaDb.detalles[0].descuentoTotal), 4000);

        const pdf = await solicitar("/ventas/" + venta.id + "/comprobante.pdf", { token });
        assert.equal(pdf.respuesta.status, 200);
        const textoPdf = extraerTextoPdf(Buffer.from(pdf.datos));
        assert.match(textoPdf, /2x1/);
        assert.match(textoPdf, /4\.000,00/);
        assert.match(textoPdf, /Descuentos:.*4\.000,00/);
    });

    test("representa el 2x1 en Mercado Pago con unidades pagas cuyo importe coincide con la venta", async () => {
        const fetchAnterior = global.fetch;
        const tokenAnterior = process.env.MP_ACCESS_TOKEN;
        const posAnterior = process.env.MP_QR_EXTERNAL_POS_ID;
        let payloadOrden;
        process.env.MP_ACCESS_TOKEN = "test-token";
        process.env.MP_QR_EXTERNAL_POS_ID = "test-pos";
        global.fetch = async function (_url, opciones) {
            payloadOrden = JSON.parse(opciones.body);
            return {
                ok: true,
                json: async function () {
                    return { id: "orden-test", status: "created", type_response: { qr_data: "qr-test" } };
                }
            };
        };

        try {
            await mercadoPagoQrService.crearQrDinamico({
                id: "venta-test",
                total: 4000,
                codigoComprobante: "V-TEST",
                detalles: [{
                    cantidad: 3,
                    precioUnitario: 2000,
                    subtotal: 4000,
                    unidadesBonificadas: 1,
                    promocionTitulo: "2x1",
                    producto: { nombre: "Producto" }
                }]
            });
            assert.equal(payloadOrden.total_amount, "4000.00");
            assert.equal(payloadOrden.transactions.payments[0].amount, "4000.00");
            assert.equal(payloadOrden.items.length, 1);
            assert.equal(payloadOrden.items[0].quantity, 2);
            assert.equal(payloadOrden.items[0].unit_price, "2000.00");
        } finally {
            global.fetch = fetchAnterior;
            if (tokenAnterior === undefined) delete process.env.MP_ACCESS_TOKEN;
            else process.env.MP_ACCESS_TOKEN = tokenAnterior;
            if (posAnterior === undefined) delete process.env.MP_QR_EXTERNAL_POS_ID;
            else process.env.MP_QR_EXTERNAL_POS_ID = posAnterior;
        }
    });
});
