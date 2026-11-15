require("dotenv/config");
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const movimientoStockService = require("../src/services/movimientoStockService");
const configuracionStockService = require("../src/services/configuracionStockService");
const { configuracionStockSchema, vistaPreviaStockSchema } = require("../src/schemas/movimientoStockSchema");

const productosBase = [
    {
        id: "producto-igual",
        nombre: "Producto igual al umbral",
        stock: 10,
        stockReservado: 5,
        activo: true,
        categoriaRelacion: { nombre: "Almacén" }
    },
    {
        id: "producto-inferior",
        nombre: "Producto por debajo del umbral",
        stock: 10,
        stockReservado: 8,
        activo: true,
        categoriaRelacion: { nombre: "Almacén" }
    },
    {
        id: "producto-superior",
        nombre: "Producto por encima del umbral",
        stock: 10,
        stockReservado: 0,
        activo: true,
        categoriaRelacion: { nombre: "Almacén" }
    },
    {
        id: "producto-inactivo",
        nombre: "Producto inactivo",
        stock: 0,
        stockReservado: 0,
        activo: false,
        categoriaRelacion: { nombre: "Almacén" }
    }
];

let productos;
let umbralConfigurado;
let server;
let baseUrl;

const findManyOriginal = prisma.producto.findMany;
const countOriginal = prisma.producto.count;
const transactionOriginal = prisma.$transaction;
const obtenerUmbralOriginal = configuracionStockService.obtenerUmbralStockBajo;

function producto(id) {
    return productos.find((item) => item.id === id);
}

function tokenPara(rol) {
    return jwt.sign({ id: `test-${rol}`, rol }, process.env.JWT_SECRET);
}

function activosConsulta(where) {
    return productos.filter((item) => !where?.activo || item.activo === where.activo);
}

async function consultar(ruta, opciones = {}) {
    const respuesta = await fetch(baseUrl + ruta, {
        method: opciones.method || "GET",
        headers: {
            ...(opciones.body ? { "Content-Type": "application/json" } : {}),
            ...(opciones.token ? { Authorization: "Bearer " + opciones.token } : {})
        },
        ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {})
    });
    return respuesta;
}

describe("Alerta de stock bajo", () => {
    before(async () => {
        productos = productosBase.map((item) => ({ ...item }));
        umbralConfigurado = 5;

        configuracionStockService.obtenerUmbralStockBajo = async () => umbralConfigurado;
        prisma.producto.findMany = async (consulta = {}) => {
            const datos = activosConsulta(consulta.where)
                .slice(consulta.skip || 0, (consulta.skip || 0) + (consulta.take || 100));
            return datos.map((item) => ({ ...item }));
        };
        prisma.producto.count = async (consulta = {}) => activosConsulta(consulta.where).length;
        prisma.$transaction = async (operaciones) => Promise.all(operaciones);

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
        configuracionStockService.obtenerUmbralStockBajo = obtenerUmbralOriginal;
        prisma.producto.findMany = findManyOriginal;
        prisma.producto.count = countOriginal;
        prisma.$transaction = transactionOriginal;
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((error) => error ? reject(error) : resolve());
                server.closeAllConnections();
            });
        }
    });

    test("incluye productos con stock disponible igual o inferior al umbral y excluye inactivos", async () => {
        const resultado = await movimientoStockService.listarStock(1, 10, true);

        assert.equal(resultado.total, 2);
        assert.deepEqual(
            resultado.data.map((item) => item.id),
            ["producto-igual", "producto-inferior"]
        );
        assert.equal(resultado.data[0].stockDisponible, 5);
        assert.equal(resultado.data[0].stockBajo, true);
        assert.equal(resultado.data[1].stockDisponible, 2);
        assert.equal(resultado.data[1].stockBajo, true);
        assert.equal(resultado.data.some((item) => item.id === "producto-inactivo"), false);
    });

    test("mantiene la paginación y el total real al filtrar por stock bajo", async () => {
        const primeraPagina = await movimientoStockService.listarStock(1, 1, true);
        const segundaPagina = await movimientoStockService.listarStock(2, 1, true);

        assert.equal(primeraPagina.total, 2);
        assert.equal(primeraPagina.data.length, 1);
        assert.equal(segundaPagina.total, 2);
        assert.equal(segundaPagina.data.length, 1);
        assert.notEqual(primeraPagina.data[0].id, segundaPagina.data[0].id);
    });

    test("el listado completo marca cada producto según el umbral configurado", async () => {
        const resultado = await movimientoStockService.listarStock(1, 10, false);
        const porId = new Map(resultado.data.map((item) => [item.id, item]));

        assert.equal(resultado.total, 3);
        assert.equal(porId.get("producto-igual").stockBajo, true);
        assert.equal(porId.get("producto-inferior").stockBajo, true);
        assert.equal(porId.get("producto-superior").stockBajo, false);
        assert.equal(porId.has("producto-inactivo"), false);
    });

    test("el resumen del dashboard usa el mismo umbral y devuelve la cantidad afectada", async () => {
        const resumen = await movimientoStockService.obtenerResumenStockBajo();

        assert.equal(resumen.umbralStockBajo, 5);
        assert.equal(resumen.totalProductosStockBajo, 2);
        assert.equal(resumen.totalProductosActivos, 3);
        assert.deepEqual(
            resumen.productosStockBajo.map((item) => item.id),
            ["producto-inferior", "producto-igual"]
        );
    });

    test("al cambiar el umbral se actualizan el inventario y el resumen de forma consistente", async () => {
        umbralConfigurado = 2;
        const inventarioUmbral2 = await movimientoStockService.listarStock(1, 10, true);
        const resumenUmbral2 = await movimientoStockService.obtenerResumenStockBajo();
        assert.deepEqual(inventarioUmbral2.data.map((item) => item.id), ["producto-inferior"]);
        assert.deepEqual(resumenUmbral2.productosStockBajo.map((item) => item.id), ["producto-inferior"]);

        umbralConfigurado = 10;
        const inventarioUmbral10 = await movimientoStockService.listarStock(1, 10, true);
        const resumenUmbral10 = await movimientoStockService.obtenerResumenStockBajo();
        assert.equal(inventarioUmbral10.total, 3);
        assert.equal(resumenUmbral10.totalProductosStockBajo, 3);

        umbralConfigurado = 0;
        const resumenUmbral0 = await movimientoStockService.obtenerResumenStockBajo();
        assert.equal(resumenUmbral0.totalProductosStockBajo, 0);

        umbralConfigurado = 5;
    });

    test("la vista previa calcula cantidades y porcentajes para umbrales cero, normal y elevado", async () => {
        const umbralCero = await movimientoStockService.obtenerVistaPreviaStockBajo(0);
        assert.deepEqual(umbralCero, {
            umbralStockBajo: 0,
            totalProductosActivos: 3,
            totalProductosStockBajo: 0,
            totalProductosSinStockBajo: 3,
            porcentajeAfectado: 0
        });

        const umbralNormal = await movimientoStockService.obtenerVistaPreviaStockBajo(5);
        assert.deepEqual(umbralNormal, {
            umbralStockBajo: 5,
            totalProductosActivos: 3,
            totalProductosStockBajo: 2,
            totalProductosSinStockBajo: 1,
            porcentajeAfectado: 67
        });

        const umbralElevado = await movimientoStockService.obtenerVistaPreviaStockBajo(100);
        assert.deepEqual(umbralElevado, {
            umbralStockBajo: 100,
            totalProductosActivos: 3,
            totalProductosStockBajo: 3,
            totalProductosSinStockBajo: 0,
            porcentajeAfectado: 100
        });

        assert.equal(umbralConfigurado, 5, "la vista previa no debe guardar el umbral propuesto");
    });

    test("la vista previa usa el stock disponible, descuenta reservados y excluye inactivos", async () => {
        const vistaPrevia = await movimientoStockService.obtenerVistaPreviaStockBajo(5);

        assert.equal(vistaPrevia.totalProductosActivos, 3);
        assert.equal(vistaPrevia.totalProductosStockBajo, 2);

        // producto-igual: 10 - 5 = 5 (entra por igualdad); producto-inferior: 10 - 8 = 2.
        // producto-superior: 10 - 0 = 10. El inactivo con disponible 0 queda fuera.
        producto("producto-igual").stockReservado = 0;
        const sinReserva = await movimientoStockService.obtenerVistaPreviaStockBajo(5);
        assert.equal(sinReserva.totalProductosStockBajo, 1);
        producto("producto-igual").stockReservado = 5;
    });

    test("la vista previa informa cuando no hay productos activos", async () => {
        const estadosOriginales = productos.map((item) => item.activo);
        productos.forEach((item) => { item.activo = false; });

        try {
            const vistaPrevia = await movimientoStockService.obtenerVistaPreviaStockBajo(100);
            assert.deepEqual(vistaPrevia, {
                umbralStockBajo: 100,
                totalProductosActivos: 0,
                totalProductosStockBajo: 0,
                totalProductosSinStockBajo: 0,
                porcentajeAfectado: null
            });
        } finally {
            productos.forEach((item, indice) => { item.activo = estadosOriginales[indice]; });
        }
    });

    test("un cambio de stock se refleja en la próxima consulta de la alerta", async () => {
        const antes = await movimientoStockService.obtenerResumenStockBajo();
        assert.equal(antes.totalProductosStockBajo, 2);

        producto("producto-inferior").stock = 20;
        const despues = await movimientoStockService.obtenerResumenStockBajo();
        assert.equal(despues.totalProductosStockBajo, 1);
        assert.equal(despues.productosStockBajo[0].id, "producto-igual");

        producto("producto-inferior").stock = 10;
    });

    test("los reportes de stock aplican el umbral recibido", async () => {
        assert.equal((await movimientoStockService.listarStockParaReporte(false, 5)).length, 3);
        assert.equal((await movimientoStockService.listarStockParaReporte(true, 5)).length, 2);
        assert.equal((await movimientoStockService.listarStockParaReporte(true, 2)).length, 1);
    });

    test("valida que el umbral sea un entero mayor o igual a cero", () => {
        assert.equal(configuracionStockSchema.safeParse({ umbralStockBajo: 0 }).success, true);
        assert.equal(configuracionStockSchema.safeParse({ umbralStockBajo: 5 }).success, true);
        assert.equal(configuracionStockSchema.safeParse({ umbralStockBajo: -1 }).success, false);
        assert.equal(configuracionStockSchema.safeParse({ umbralStockBajo: 1.5 }).success, false);
        assert.equal(configuracionStockSchema.safeParse({ umbralStockBajo: "5" }).success, false);
        assert.equal(configuracionStockSchema.safeParse({ umbralStockBajo: null }).success, false);
        assert.equal(configuracionStockSchema.safeParse({ umbralStockBajo: 5, extra: true }).success, false);
    });

    test("valida el umbral de la vista previa como entero mayor o igual a cero", () => {
        assert.equal(vistaPreviaStockSchema.safeParse({ umbral: "0" }).success, true);
        assert.equal(vistaPreviaStockSchema.safeParse({ umbral: "5" }).success, true);
        assert.equal(vistaPreviaStockSchema.safeParse({ umbral: "100" }).success, true);
        assert.equal(vistaPreviaStockSchema.safeParse({ umbral: "-1" }).success, false);
        assert.equal(vistaPreviaStockSchema.safeParse({ umbral: "1.5" }).success, false);
        assert.equal(vistaPreviaStockSchema.safeParse({ umbral: "abc" }).success, false);
        assert.equal(vistaPreviaStockSchema.safeParse({}).success, false);
    });

    test("protege la configuración, el resumen y la vista previa para usuarios que no son Administrador", async () => {
        const sinToken = await consultar("/stock/configuracion");
        assert.equal(sinToken.status, 401);

        const cajeroConfiguracion = await consultar("/stock/configuracion", { token: tokenPara("Cajero") });
        assert.equal(cajeroConfiguracion.status, 403);

        const cajeroGuardar = await consultar("/stock/configuracion", {
            method: "PUT",
            token: tokenPara("Cajero"),
            body: { umbralStockBajo: 0 }
        });
        assert.equal(cajeroGuardar.status, 403);

        const cajeroResumen = await consultar("/stock/resumen", { token: tokenPara("Cajero") });
        assert.equal(cajeroResumen.status, 403);

        const clienteStock = await consultar("/stock", { token: tokenPara("Cliente") });
        assert.equal(clienteStock.status, 403);

        const sinTokenVistaPrevia = await consultar("/stock/vista-previa?umbral=5");
        assert.equal(sinTokenVistaPrevia.status, 401);

        const cajeroVistaPrevia = await consultar("/stock/vista-previa?umbral=5", {
            token: tokenPara("Cajero")
        });
        assert.equal(cajeroVistaPrevia.status, 403);

        const clienteVistaPrevia = await consultar("/stock/vista-previa?umbral=5", {
            token: tokenPara("Cliente")
        });
        assert.equal(clienteVistaPrevia.status, 403);
    });

    test("el Administrador obtiene la vista previa y se rechazan umbrales inválidos", async () => {
        const token = tokenPara("Administrador");

        const valida = await consultar("/stock/vista-previa?umbral=5", { token });
        assert.equal(valida.status, 200);
        assert.deepEqual(await valida.json(), {
            umbralStockBajo: 5,
            totalProductosActivos: 3,
            totalProductosStockBajo: 2,
            totalProductosSinStockBajo: 1,
            porcentajeAfectado: 67
        });

        for (const umbral of ["-1", "1.5", "abc", ""]) {
            const invalida = await consultar(`/stock/vista-previa?umbral=${umbral}`, { token });
            assert.equal(invalida.status, 400, `umbral inválido: ${umbral || "vacío"}`);
        }

        const sinUmbral = await consultar("/stock/vista-previa", { token });
        assert.equal(sinUmbral.status, 400);
    });
});
