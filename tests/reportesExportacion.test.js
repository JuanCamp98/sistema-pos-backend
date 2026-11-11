require("dotenv/config");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const ventaService = require("../src/services/ventaService");
const movimientoStockService = require("../src/services/movimientoStockService");

const listarVentasOriginal = ventaService.listarVentasParaReporte;
const listarStockOriginal = movimientoStockService.listarStockParaReporte;
const ventas = Array.from({ length: 125 }, (_, indice) => ({
    codigoComprobante: `COMP-${String(indice + 1).padStart(4, "0")}`,
    fecha: new Date("2026-05-04T15:30:00.000Z"),
    clienteNombre: indice === 0 ? "José Ñandú" : `Cliente ${indice + 1}`,
    clienteApellido: "Prueba",
    estado: "COBRADA",
    metodoPago: "Efectivo",
    total: (((indice + 1) * 123) / 100).toFixed(2),
    usuario: null
}));
const productos = Array.from({ length: 145 }, (_, indice) => ({
    nombre: indice === 0 ? "Café Ñandú" : `Producto ${String(indice + 1).padStart(3, "0")}`,
    categoria: "Almacén",
    tipoProducto: "Unidad",
    precio: 125.75,
    stock: indice < 7 ? 3 : 20,
    stockReservado: indice < 7 ? 1 : 2,
    stockDisponible: indice < 7 ? 2 : 18
}));

let server;
let ventasActuales = ventas;
let productosActuales = productos;
let errorVentas;
let filtrosVentasRecibidos;
let filtroStockRecibido;

function tokenPara(rol) {
    return jwt.sign({ id: `test-${rol}`, rol }, process.env.JWT_SECRET);
}

async function consultar(baseUrl, ruta, rol = "Administrador") {
    return fetch(`${baseUrl}${ruta}`, {
        headers: { Authorization: `Bearer ${tokenPara(rol)}` }
    });
}

test("las consultas de reporte respetan filtros y recuperan todas las filas sin paginar", async () => {
    const findManyVentasOriginal = prisma.venta.findMany;
    const findManyProductosOriginal = prisma.producto.findMany;
    let consultaVentas;
    let consultaProductos;
    prisma.venta.findMany = async (consulta) => {
        consultaVentas = consulta;
        return ventas;
    };
    prisma.producto.findMany = async (consulta) => {
        consultaProductos = consulta;
        return productos.map((producto) => ({
            ...producto,
            categoriaRelacion: { nombre: producto.categoria },
            tipoProducto: { nombre: producto.tipoProducto }
        }));
    };

    try {
        const filtros = {
            estado: "COBRADA",
            fechaDesde: new Date("2026-05-01T00:00:00.000Z"),
            fechaHasta: new Date("2026-05-31T23:59:59.999Z"),
            buscar: "COMP-"
        };
        const resultadoVentas = await ventaService.listarVentasParaReporte(filtros);
        assert.equal(resultadoVentas.length, 125);
        assert.equal(consultaVentas.where.estado, "COBRADA");
        assert.equal(consultaVentas.where.codigoComprobante.contains, "COMP-");
        assert.equal(consultaVentas.where.fecha.gte, filtros.fechaDesde);
        assert.equal(consultaVentas.where.fecha.lte, filtros.fechaHasta);
        assert.equal("skip" in consultaVentas, false);
        assert.equal("take" in consultaVentas, false);
        assert.equal("contrasena" in consultaVentas.select, false);

        const resultadoStock = await movimientoStockService.listarStockParaReporte(false);
        assert.equal(resultadoStock.length, 145);
        assert.equal(consultaProductos.where.activo, true);
        assert.equal("skip" in consultaProductos, false);
        assert.equal("take" in consultaProductos, false);
        assert.equal(resultadoStock[0].stockDisponible, 2);
        assert.equal((await movimientoStockService.listarStockParaReporte(true)).length, 7);
    } finally {
        prisma.venta.findMany = findManyVentasOriginal;
        prisma.producto.findMany = findManyProductosOriginal;
    }
});

after(async () => {
    ventaService.listarVentasParaReporte = listarVentasOriginal;
    movimientoStockService.listarStockParaReporte = listarStockOriginal;
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
            server.closeAllConnections();
        });
    }
    await prisma.$disconnect();
});

test("exporta reportes completos, aplica filtros, valida permisos y entrega archivos descargables", async () => {
    ventaService.listarVentasParaReporte = async (filtros) => {
        filtrosVentasRecibidos = filtros;
        if (errorVentas) throw errorVentas;
        return ventasActuales;
    };
    movimientoStockService.listarStockParaReporte = async (bajo) => {
        filtroStockRecibido = bajo;
        return bajo
            ? productosActuales.filter((producto) => producto.stockDisponible <= 5)
            : productosActuales;
    };

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const sinAutenticacion = await fetch(`${baseUrl}/reportes/ventas.pdf`);
    assert.equal(sinAutenticacion.status, 401);
    const sinPermisos = await consultar(baseUrl, "/reportes/ventas.pdf", "Cajero");
    assert.equal(sinPermisos.status, 403);

    const filtros = new URLSearchParams({
        fechaDesde: "2026-05-01T00:00:00.000Z",
        fechaHasta: "2026-05-31T23:59:59.999Z",
        estado: "COBRADA",
        buscar: "COMP-"
    });
    const ventasExcel = await consultar(baseUrl, `/reportes/ventas.xlsx?${filtros}`);
    assert.equal(ventasExcel.status, 200);
    assert.match(ventasExcel.headers.get("content-type"), /spreadsheetml\.sheet/);
    assert.match(ventasExcel.headers.get("content-disposition"), /reporte-ventas\.xlsx/);
    assert.equal(filtrosVentasRecibidos.estado, "COBRADA");
    assert.equal(filtrosVentasRecibidos.buscar, "COMP-");
    assert.equal(filtrosVentasRecibidos.fechaDesde.toISOString(), "2026-05-01T00:00:00.000Z");
    assert.equal(filtrosVentasRecibidos.fechaHasta.toISOString(), "2026-05-31T23:59:59.999Z");

    const workbookVentas = new ExcelJS.Workbook();
    await workbookVentas.xlsx.load(Buffer.from(await ventasExcel.arrayBuffer()));
    const hojaVentas = workbookVentas.getWorksheet("Reporte de ventas");
    assert.equal(hojaVentas.getRow(2).getCell(1).value, "Código de comprobante");
    assert.equal(hojaVentas.getRow(3).getCell(3).value, "José Ñandú Prueba");
    assert.ok(hojaVentas.getRow(3).getCell(2).value instanceof Date);
    assert.equal(hojaVentas.getRow(3).getCell(6).value, 1.23);
    assert.equal(hojaVentas.getRow(127).getCell(1).value, "COMP-0125");
    assert.equal(hojaVentas.getColumn(6).numFmt, '"$"#,##0.00;[Red]-"$"#,##0.00');
    assert.equal(hojaVentas.getRow(129).getCell(6).numFmt, "#,##0");
    assert.equal(hojaVentas.getRow(130).getCell(6).value, 9686.25);
    assert.ok(hojaVentas.autoFilter);

    const ventasPdf = await consultar(baseUrl, "/reportes/ventas.pdf");
    assert.equal(ventasPdf.status, 200);
    assert.equal(ventasPdf.headers.get("content-type"), "application/pdf");
    const bytesVentasPdf = Buffer.from(await ventasPdf.arrayBuffer());
    assert.equal(bytesVentasPdf.byteLength > 1000, true);
    assert.ok(Number(bytesVentasPdf.toString("latin1").match(/\/Count (\d+)/)?.[1]) > 1);

    const stockExcel = await consultar(baseUrl, "/reportes/stock.xlsx?bajo=true");
    assert.equal(stockExcel.status, 200);
    assert.equal(filtroStockRecibido, true);
    const workbookStock = new ExcelJS.Workbook();
    await workbookStock.xlsx.load(Buffer.from(await stockExcel.arrayBuffer()));
    const hojaStock = workbookStock.getWorksheet("Reporte de stock");
    assert.equal(hojaStock.getRow(2).getCell(1).value, "Producto");
    assert.equal(hojaStock.getRow(3).getCell(1).value, "Café Ñandú");
    assert.equal(hojaStock.getRow(3).getCell(4).value, 125.75);
    assert.equal(hojaStock.getRow(3).getCell(7).value, 2);
    assert.equal(hojaStock.getColumn(4).numFmt, '"$"#,##0.00;[Red]-"$"#,##0.00');

    const stockExcelCompleto = await consultar(baseUrl, "/reportes/stock.xlsx?bajo=false");
    const workbookStockCompleto = new ExcelJS.Workbook();
    await workbookStockCompleto.xlsx.load(Buffer.from(await stockExcelCompleto.arrayBuffer()));
    assert.equal(workbookStockCompleto.getWorksheet("Reporte de stock").getRow(147).getCell(1).value, "Producto 145");

    const stockBajoPdf = await consultar(baseUrl, "/reportes/stock.pdf?bajo=true");
    assert.equal(stockBajoPdf.status, 200);
    assert.equal(filtroStockRecibido, true);

    const stockCompleto = await consultar(baseUrl, "/reportes/stock.pdf?bajo=false");
    assert.equal(stockCompleto.status, 200);
    assert.equal(filtroStockRecibido, false);
    const bytesStockPdf = Buffer.from(await stockCompleto.arrayBuffer());
    assert.equal(bytesStockPdf.byteLength > 1000, true);
    assert.ok(Number(bytesStockPdf.toString("latin1").match(/\/Count (\d+)/)?.[1]) > 1);

    const filtrosInvalidos = await consultar(baseUrl, "/reportes/ventas.pdf?estado=INVALIDO");
    assert.equal(filtrosInvalidos.status, 400);

    ventasActuales = [];
    const ventasVacias = await consultar(baseUrl, "/reportes/ventas.xlsx");
    const workbookVacio = new ExcelJS.Workbook();
    await workbookVacio.xlsx.load(Buffer.from(await ventasVacias.arrayBuffer()));
    assert.equal(workbookVacio.getWorksheet("Reporte de ventas").getRow(3).getCell(1).value, null);

    productosActuales = [];
    const stockVacio = await consultar(baseUrl, "/reportes/stock.pdf");
    assert.equal(stockVacio.status, 200);

    errorVentas = new Error("Fallo de prueba al consultar las ventas");
    const errorGeneracion = await consultar(baseUrl, "/reportes/ventas.xlsx");
    assert.equal(errorGeneracion.status, 500);
    errorVentas = null;
});
