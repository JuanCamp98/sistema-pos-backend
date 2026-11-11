const reporteExportacionService = require("../services/reporteExportacionService");
const {
    reporteVentasQuerySchema,
    reporteStockQuerySchema
} = require("../schemas/reporteSchema");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

function validarFiltros(schema, query) {
    const resultado = schema.safeParse(query);
    if (!resultado.success) {
        throw new ErrorPersonalizado(
            resultado.error.issues[0]?.message || "Los filtros del reporte no son válidos",
            400
        );
    }
    return resultado.data;
}

function enviarArchivo(res, archivo, nombre, tipoContenido) {
    res.set({
        "Content-Type": tipoContenido,
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "private, no-store"
    });
    res.status(200).send(archivo);
}

async function exportarVentasPdf(req, res, next) {
    try {
        const filtros = validarFiltros(reporteVentasQuerySchema, req.query);
        const archivo = await reporteExportacionService.generarPdfVentas(filtros);
        enviarArchivo(res, archivo, "reporte-ventas.pdf", "application/pdf");
    } catch (error) { next(error); }
}

async function exportarVentasExcel(req, res, next) {
    try {
        const filtros = validarFiltros(reporteVentasQuerySchema, req.query);
        const archivo = await reporteExportacionService.generarExcelVentas(filtros);
        enviarArchivo(
            res,
            archivo,
            "reporte-ventas.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
    } catch (error) { next(error); }
}

async function exportarStockPdf(req, res, next) {
    try {
        const { bajo } = validarFiltros(reporteStockQuerySchema, req.query);
        const archivo = await reporteExportacionService.generarPdfStock(bajo);
        enviarArchivo(res, archivo, "reporte-stock.pdf", "application/pdf");
    } catch (error) { next(error); }
}

async function exportarStockExcel(req, res, next) {
    try {
        const { bajo } = validarFiltros(reporteStockQuerySchema, req.query);
        const archivo = await reporteExportacionService.generarExcelStock(bajo);
        enviarArchivo(
            res,
            archivo,
            "reporte-stock.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
    } catch (error) { next(error); }
}

module.exports = {
    exportarVentasPdf,
    exportarVentasExcel,
    exportarStockPdf,
    exportarStockExcel
};
