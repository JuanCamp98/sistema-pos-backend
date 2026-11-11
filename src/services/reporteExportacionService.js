const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const ventaService = require("./ventaService");
const movimientoStockService = require("./movimientoStockService");

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS"
});

const FORMATO_FECHA = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
});

function nombreCliente(venta) {
    const nombre = [venta.clienteNombre || venta.usuario?.nombre, venta.clienteApellido || venta.usuario?.apellido]
        .filter(Boolean)
        .join(" ");
    return nombre || "Anónimo";
}

function calcularTotalVendido(ventas) {
    const estadosConVentaEfectiva = new Set([
        "COBRADA",
        "EN_PREPARACION",
        "LISTA_PARA_RETIRAR",
        "RETIRADA"
    ]);
    const totalEnCentavos = ventas.reduce((total, venta) =>
        total + (estadosConVentaEfectiva.has(venta.estado) ? Math.round(Number(venta.total) * 100) : 0), 0);
    return totalEnCentavos / 100;
}

function textoFiltroFecha(fecha) {
    return fecha ? FORMATO_FECHA.format(fecha) : null;
}

function filtrosVentasTexto(filtros) {
    return [
        filtros.fechaDesde && `Desde: ${textoFiltroFecha(filtros.fechaDesde)}`,
        filtros.fechaHasta && `Hasta: ${textoFiltroFecha(filtros.fechaHasta)}`,
        filtros.estado && `Estado: ${filtros.estado}`,
        filtros.buscar && `Comprobante: ${filtros.buscar}`
    ].filter(Boolean);
}

function crearHoja(workbook, nombre, titulo, encabezados, filas, anchos) {
    const hoja = workbook.addWorksheet(nombre);
    hoja.columns = encabezados.map((header, indice) => ({
        key: `columna${indice}`,
        width: anchos[indice]
    }));
    hoja.addRow([titulo]);
    hoja.mergeCells(1, 1, 1, encabezados.length);
    hoja.getRow(1).font = { bold: true, size: 16, color: { argb: "FF245744" } };
    hoja.addRow(encabezados);
    hoja.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    hoja.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245744" } };
    hoja.getRow(2).alignment = { vertical: "middle", wrapText: true };
    hoja.getRow(2).height = 30;
    hoja.views = [{ state: "frozen", ySplit: 2 }];

    filas.forEach((fila) => hoja.addRow(fila));
    if (filas.length) {
        hoja.autoFilter = `A2:${String.fromCharCode(64 + encabezados.length)}${filas.length + 2}`;
    }

    return hoja;
}

async function generarExcelVentas(filtros) {
    const ventas = await ventaService.listarVentasParaReporte(filtros);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistema POS";
    workbook.created = new Date();
    const hoja = crearHoja(
        workbook,
        "Reporte de ventas",
        "Reporte de ventas",
        ["Código de comprobante", "Fecha de venta", "Cliente", "Estado", "Método de pago", "Total"],
        ventas.map((venta) => [
            venta.codigoComprobante,
            venta.fecha,
            nombreCliente(venta),
            venta.estado,
            venta.metodoPago || "No informado",
            Number(venta.total)
        ]),
        [25, 22, 32, 24, 22, 18]
    );
    hoja.getColumn(2).numFmt = "dd/mm/yyyy hh:mm";
    hoja.getColumn(6).numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    hoja.addRow([]);
    hoja.addRow(["", "", "", "", "Cantidad de ventas", ventas.length]);
    hoja.addRow(["", "", "", "", "Total vendido", calcularTotalVendido(ventas)]);
    hoja.getRow(hoja.rowCount - 1).getCell(6).numFmt = "#,##0";
    hoja.getRow(hoja.rowCount - 1).font = { bold: true };
    hoja.getRow(hoja.rowCount).font = { bold: true };

    return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function generarExcelStock(soloStockBajo) {
    const productos = await movimientoStockService.listarStockParaReporte(soloStockBajo);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistema POS";
    workbook.created = new Date();
    const hoja = crearHoja(
        workbook,
        "Reporte de stock",
        "Reporte de stock",
        ["Producto", "Categoría", "Tipo de producto", "Precio", "Stock físico", "Stock reservado", "Stock disponible"],
        productos.map((producto) => [
            producto.nombre,
            producto.categoria,
            producto.tipoProducto,
            Number(producto.precio),
            producto.stock,
            producto.stockReservado,
            producto.stockDisponible
        ]),
        [36, 24, 26, 18, 18, 20, 20]
    );
    hoja.getColumn(4).numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
    const totales = productos.reduce((acumulado, producto) => ({
        fisico: acumulado.fisico + producto.stock,
        reservado: acumulado.reservado + producto.stockReservado
    }), { fisico: 0, reservado: 0 });
    hoja.addRow([]);
    hoja.addRow(["Productos", productos.length, "", "Stock físico", totales.fisico, "Reservado", totales.reservado]);
    hoja.addRow(["", "", "", "", "", "Disponible", productos.reduce((total, producto) => total + producto.stockDisponible, 0)]);
    hoja.getRow(hoja.rowCount).font = { bold: true };
    hoja.getRow(hoja.rowCount - 1).font = { bold: true };

    return Buffer.from(await workbook.xlsx.writeBuffer());
}

function agregarFiltrosPdf(documento, filtros) {
    const filtrosTexto = filtros.bajo
        ? [filtros.bajo]
        : filtrosVentasTexto(filtros);
    documento.fontSize(9).fillColor("#52606d").text(
        filtrosTexto.length ? `Filtros: ${filtrosTexto.join(" · ")}` : "Filtros: ninguno",
        { width: documento.page.width - 64 }
    );
    documento.moveDown(0.7);
}

function agregarEncabezadoPdf(documento, titulo, filtros) {
    documento.font("Helvetica-Bold").fontSize(20).fillColor("#245744").text(titulo);
    documento.moveDown(0.3);
    documento.font("Helvetica").fontSize(10).fillColor("#52606d")
        .text(`Generado: ${FORMATO_FECHA.format(new Date())}`);
    agregarFiltrosPdf(documento, filtros);
}

function agregarTablaPdf(documento, columnas, filas, opciones = {}) {
    const margen = 32;
    const anchoDisponible = documento.page.width - margen * 2;
    const escala = anchoDisponible / columnas.reduce((total, columna) => total + columna.ancho, 0);
    const columnasEscaladas = columnas.map((columna) => ({
        ...columna,
        ancho: columna.ancho * escala
    }));
    function dibujarEncabezado() {
        const yEncabezado = documento.y;
        const alturaEncabezado = 24;
        documento.save();
        documento.rect(margen, yEncabezado, anchoDisponible, alturaEncabezado)
            .fillColor("#245744")
            .fill();
        documento.restore();

        documento.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff");
        let x = margen;
        columnasEscaladas.forEach((columna) => {
            documento.text(columna.titulo, x + 5, yEncabezado + 7, {
                width: columna.ancho - 10,
                height: alturaEncabezado - 7,
                lineBreak: false,
                ellipsis: true,
                align: columna.alinear || "left"
            });
            x += columna.ancho;
        });
        documento.y = yEncabezado + alturaEncabezado;
    }

    function nuevaPagina() {
        documento.addPage({
            size: "A4",
            layout: "landscape",
            margins: { top: margen, right: margen, bottom: margen, left: margen }
        });
        if (opciones.titulo) agregarEncabezadoPdf(documento, opciones.titulo, opciones.filtros || {});
        dibujarEncabezado();
    }

    dibujarEncabezado();
    if (!filas.length) {
        documento.font("Helvetica").fontSize(10).fillColor("#52606d")
            .text("No hay resultados para los filtros seleccionados.", margen, documento.y + 8, {
                width: anchoDisponible
            });
        return;
    }

    filas.forEach((fila, indiceFila) => {
        const celdas = columnasEscaladas.map((columna, indice) =>
            documento.heightOfString(String(fila[indice] ?? ""), {
                width: columna.ancho - 10,
                font: "Helvetica",
                fontSize: 8.5
            })
        );
        const altura = Math.max(22, ...celdas.map((alto) => alto + 8));
        if (documento.y + altura > documento.page.height - margen - 24) nuevaPagina();
        const y = documento.y;
        let x = margen;
        if (indiceFila % 2 === 1) {
            documento.save();
            documento.rect(margen, y, anchoDisponible, altura).fillColor("#f4f7f5").fill();
            documento.restore();
        }
        documento.font("Helvetica").fontSize(8.5).fillColor("#252923");
        columnasEscaladas.forEach((columna, indice) => {
            documento.text(String(fila[indice] ?? ""), x + 5, y + 4, {
                width: columna.ancho - 10,
                height: altura - 8,
                ellipsis: true,
                align: columna.alinear || "left"
            });
            x += columna.ancho;
        });
        documento.save();
        documento.moveTo(margen, y + altura).lineTo(documento.page.width - margen, y + altura)
            .strokeColor("#dce4df").lineWidth(0.5).stroke();
        documento.restore();
        documento.y = y + altura;
    });
}

function generarPdf(titulo, filtros, columnas, filas, totales) {
    return new Promise((resolve, reject) => {
        const documento = new PDFDocument({
            size: "A4",
            layout: "landscape",
            margins: { top: 32, right: 32, bottom: 32, left: 32 },
            info: { Title: titulo, Author: "Sistema POS" }
        });
        const partes = [];
        documento.on("data", (parte) => partes.push(parte));
        documento.on("end", () => resolve(Buffer.concat(partes)));
        documento.on("error", reject);

        agregarEncabezadoPdf(documento, titulo, filtros);
        agregarTablaPdf(documento, columnas, filas, { titulo, filtros });
        if (totales) {
            const margen = 32;
            const anchoDisponible = documento.page.width - margen * 2;
            if (documento.y + 30 > documento.page.height - margen) {
                documento.addPage({
                    size: "A4",
                    layout: "landscape",
                    margins: { top: margen, right: margen, bottom: margen, left: margen }
                });
                agregarEncabezadoPdf(documento, titulo, filtros);
            }
            documento.font("Helvetica-Bold").fontSize(10).fillColor("#252923")
                .text(totales, margen, documento.y + 12, {
                    width: anchoDisponible,
                    align: "right"
                });
        }
        documento.end();
    });
}

async function generarPdfVentas(filtros) {
    const ventas = await ventaService.listarVentasParaReporte(filtros);
    return generarPdf(
        "Reporte de ventas",
        filtros,
        [
            { titulo: "Comprobante", ancho: 98 },
            { titulo: "Fecha de venta", ancho: 104 },
            { titulo: "Cliente", ancho: 180 },
            { titulo: "Estado", ancho: 122 },
            { titulo: "Método de pago", ancho: 116 },
            { titulo: "Total", ancho: 78, alinear: "right" }
        ],
        ventas.map((venta) => [
            venta.codigoComprobante,
            FORMATO_FECHA.format(venta.fecha),
            nombreCliente(venta),
            venta.estado,
            venta.metodoPago || "No informado",
            FORMATO_MONEDA.format(Number(venta.total))
        ]),
        `Ventas: ${ventas.length} · Total vendido: ${FORMATO_MONEDA.format(calcularTotalVendido(ventas))}`
    );
}

async function generarPdfStock(soloStockBajo) {
    const productos = await movimientoStockService.listarStockParaReporte(soloStockBajo);
    const totales = productos.reduce((acumulado, producto) => ({
        fisico: acumulado.fisico + producto.stock,
        reservado: acumulado.reservado + producto.stockReservado,
        disponible: acumulado.disponible + producto.stockDisponible
    }), { fisico: 0, reservado: 0, disponible: 0 });

    return generarPdf(
        "Reporte de stock",
        { bajo: soloStockBajo ? "Stock bajo (disponible <= 5)" : null },
        [
            { titulo: "Producto", ancho: 160 },
            { titulo: "Categoría", ancho: 124 },
            { titulo: "Tipo de producto", ancho: 136 },
            { titulo: "Precio", ancho: 86 },
            { titulo: "Stock físico", ancho: 82, alinear: "right" },
            { titulo: "Reservado", ancho: 82, alinear: "right" },
            { titulo: "Disponible", ancho: 86, alinear: "right" }
        ],
        productos.map((producto) => [
            producto.nombre,
            producto.categoria,
            producto.tipoProducto,
            FORMATO_MONEDA.format(Number(producto.precio)),
            String(producto.stock),
            String(producto.stockReservado),
            String(producto.stockDisponible)
        ]),
        `Productos: ${productos.length} · Stock físico: ${totales.fisico} · Reservado: ${totales.reservado} · Disponible: ${totales.disponible}`
    );
}

module.exports = {
    generarExcelVentas,
    generarExcelStock,
    generarPdfVentas,
    generarPdfStock
};
