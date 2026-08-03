const ventaService = require("../services/ventaService");

async function registrar(req, res, next) {
    try {
        const usuarioId = req.usuario.id;
        const { items } = req.body;
        const nuevaVenta = await ventaService.registrarVenta(usuarioId, items);
        res.status(201).json({
            mensaje: "Venta registrada correctamente",
            venta: nuevaVenta
        });
    } catch (error) { next(error); }
}

async function listar(req, res, next) {
    try {
        const pagina = parseInt(req.query.pagina);
        const limite = parseInt(req.query.limite);
        const resultado = await ventaService.listarVentas(pagina, limite);
        res.status(200).json(resultado);
    } catch (error) { next(error); }
}

async function obtenerPorId(req, res, next) {
    try {
        const venta = await ventaService.obtenerVentaPorId(req.params.id);
        res.status(200).json({ venta: venta });
    } catch (error) { next(error); }
}

module.exports = { registrar, listar, obtenerPorId };