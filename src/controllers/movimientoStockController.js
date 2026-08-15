const movimientoStockService = require("../services/movimientoStockService");
const {
    paginacionStockSchema,
    historialMovimientosSchema,
    productoIdParamSchema
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
        const resultadoPaginacion = paginacionStockSchema.safeParse(req.query);
        if (!resultadoPaginacion.success) {
            throw new ErrorPersonalizado("Los parametros page y limit deben ser enteros positivos", 400);
        }
        const { page, limit } = resultadoPaginacion.data;
        const resultado = await movimientoStockService.listarStock(page, limit);
        res.status(200).json(resultado);
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

module.exports = { registrar, listar, listarMovimientos, listarPorProducto, ajustar };
