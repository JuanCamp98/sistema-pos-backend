const ventaService = require("../services/ventaService");
const { listarVentasQuerySchema } = require("../schemas/ventaSchema");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

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
        const resultado = await ventaService.cobrarVenta(req.params.id, req.body.metodoPago, codigoComprobante);
        res.status(200).json({
            mensaje: "Venta cobrada correctamente",
            venta: resultado.venta,
            correo: resultado.correo
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
        const resultadoFiltros = listarVentasQuerySchema.safeParse(req.query);
        if (!resultadoFiltros.success) {
            throw new ErrorPersonalizado("Los filtros de ventas no son validos", 400);
        }
        const resultado = await ventaService.listarVentas(resultadoFiltros.data);
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
