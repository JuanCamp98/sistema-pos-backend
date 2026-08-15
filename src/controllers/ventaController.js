const ventaService = require("../services/ventaService");

async function registrar(req, res, next) {
    try {
        const usuarioId = req.usuario ? req.usuario.id : null;
        const nuevaVenta = await ventaService.registrarVenta(usuarioId, req.body);
        res.status(201).json({
            mensaje: "Venta registrada correctamente",
            venta: nuevaVenta
        });
    } catch (error) { next(error); }
}

async function cobrar(req, res, next) {
    try {
        const codigoComprobante = req.body.codigoComprobante || null;
        const ventaCobrada = await ventaService.cobrarVenta(req.params.id, req.body.metodoPago, codigoComprobante);
        res.status(200).json({
            mensaje: "Venta cobrada correctamente",
            venta: ventaCobrada
        });
    } catch (error) { next(error); }
}

async function cancelar(req, res, next) {
    try {
        const ventaCancelada = await ventaService.cancelarVenta(req.params.id);
        res.status(200).json({
            mensaje: "Venta cancelada correctamente",
            venta: ventaCancelada
        });
    } catch (error) { next(error); }
}

async function listar(req, res, next) {
    try {
        const filtros = {
            pagina: req.query.pagina ? parseInt(req.query.pagina) : undefined,
            limite: req.query.limite ? parseInt(req.query.limite) : undefined,
            estado: req.query.estado || undefined
        };
        const resultado = await ventaService.listarVentas(filtros);
        res.status(200).json(resultado);
    } catch (error) { next(error); }
}

async function obtenerPorId(req, res, next) {
    try {
        const venta = await ventaService.obtenerVentaPorId(req.params.id);
        res.status(200).json({ venta: venta });
    } catch (error) { next(error); }
}

async function buscarPorComprobante(req, res, next) {
    try {
        const venta = await ventaService.obtenerVentaPorCodigoComprobante(req.params.codigo);
        res.status(200).json({ venta: venta });
    } catch (error) { next(error); }
}

module.exports = {
    registrar,
    cobrar,
    cancelar,
    listar,
    obtenerPorId,
    buscarPorComprobante
};