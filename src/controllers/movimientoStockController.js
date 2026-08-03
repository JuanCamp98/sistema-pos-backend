const movimientoStockService = require("../services/movimientoStockService");

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
        const pagina = parseInt(req.query.pagina);
        const limite = parseInt(req.query.limite);
        const resultado = await movimientoStockService.listarMovimientos(pagina, limite);
        res.status(200).json(resultado);
    } catch (error) { next(error); }
}

async function listarPorProducto(req, res, next) {
    try {
        const movimientos = await movimientoStockService.listarMovimientosPorProducto(req.params.productoId);
        res.status(200).json({ movimientos: movimientos });
    } catch (error) { next(error); }
}

module.exports = { registrar, listar, listarPorProducto };