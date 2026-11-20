const movimientoStockService = require("../services/movimientoStockService");
const configuracionStockService = require("../services/configuracionStockService");
const {
    listarStockSchema,
    historialMovimientosSchema,
    productoIdParamSchema,
    vistaPreviaStockSchema
} = require("../schemas/movimientoStockSchema");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

async function registrar(req, res, next) {
    try {
        const nuevoMovimiento = await movimientoStockService.registrarMovimiento(req.body);
        res.status(201).json({
            mensaje: "Movimiento de stock registrado correctamente",
            movimiento: nuevoMovimiento
        });
    } catch (error) { next(error); }
}
    
async function listar(req, res, next) {
    try {
        const resultadoFiltros = listarStockSchema.safeParse(req.query);
        if (!resultadoFiltros.success) {
            throw new ErrorPersonalizado("Los parametros de paginacion o filtros no son validos", 400);
        }
        const { page, limit, bajo, buscar, categoria, estado } = resultadoFiltros.data;
        const resultado = await movimientoStockService.listarStock(page, limit, {
            bajo,
            buscar,
            categoria,
            estado
        });
        res.status(200).json(resultado);
    } catch (error) { next(error); }
}

async function obtenerConfiguracion(req, res, next) {
    try {
        res.status(200).json({
            configuracion: await configuracionStockService.obtenerConfiguracion()
        });
    } catch (error) { next(error); }
}

async function guardarConfiguracion(req, res, next) {
    try {
        res.status(200).json({
            mensaje: "La configuración de stock bajo se guardó correctamente",
            configuracion: await configuracionStockService.guardarConfiguracion(req.body)
        });
    } catch (error) { next(error); }
}

async function resumenStockBajo(req, res, next) {
    try {
        res.status(200).json(await movimientoStockService.obtenerResumenStockBajo());
    } catch (error) { next(error); }
}

async function resumenInventario(req, res, next) {
    try {
        res.set("Cache-Control", "no-store");
        res.status(200).json(await movimientoStockService.obtenerResumenInventario());
    } catch (error) { next(error); }
}

async function vistaPreviaStockBajo(req, res, next) {
    try {
        const resultado = vistaPreviaStockSchema.safeParse(req.query);
        if (!resultado.success) {
            throw new ErrorPersonalizado(
                "El umbral debe ser un número entero mayor o igual a cero",
                400
            );
        }
        res.status(200).json(
            await movimientoStockService.obtenerVistaPreviaStockBajo(resultado.data.umbral)
        );
    } catch (error) { next(error); }
}

async function listarMovimientos(req, res, next) {
    try {
        const resultadoFiltros = historialMovimientosSchema.safeParse(req.query);
        if (!resultadoFiltros.success) {
            throw new ErrorPersonalizado("Los filtros de movimientos no son validos", 400);
        }
        const resultado = await movimientoStockService.listarHistorialMovimientos(resultadoFiltros.data);
        res.status(200).json(resultado);
    } catch (error) { next(error); }
}

async function ajustar(req, res, next) {
    try {
        const resultadoProductoId = productoIdParamSchema.safeParse(req.params);
        if (!resultadoProductoId.success) {
            throw new ErrorPersonalizado("El id de producto no es valido", 400);
        }
        const movimiento = await movimientoStockService.ajustarStock(resultadoProductoId.data.productoId, req.body);
        res.status(200).json({
            mensaje: "Stock ajustado correctamente",
            movimiento
        });
    } catch (error) { next(error); }
}

async function listarPorProducto(req, res, next) {
    try {
        const movimientos = await movimientoStockService.listarMovimientosPorProducto(req.params.productoId);
        res.status(200).json({ movimientos: movimientos });
    } catch (error) { next(error); }
}

module.exports = {
    registrar,
    listar,
    obtenerConfiguracion,
    guardarConfiguracion,
    resumenStockBajo,
    resumenInventario,
    vistaPreviaStockBajo,
    listarMovimientos,
    listarPorProducto,
    ajustar
};
