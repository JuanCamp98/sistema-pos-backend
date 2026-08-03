const productoService = require("../services/productoService");

async function crear(req, res, next) {
    try {
        const nuevoProducto = await productoService.crearProducto(req.body);
        res.status(201).json({
            mensaje: "Producto creado correctamente",
            producto: nuevoProducto
        });
    } catch (error) { next(error); }
}

async function listar(req, res, next) {
    try {
        const pagina = parseInt(req.query.pagina);
        const limite = parseInt(req.query.limite);
        const resultado = await productoService.listarProductos(pagina, limite);
        res.status(200).json(resultado);
    } catch (error) { next(error); }
}

async function obtenerPorId(req, res, next) {
    try {
        const producto = await productoService.obtenerProductoPorId(req.params.id);
        res.status(200).json({ producto: producto });
    } catch (error) { next(error); }
}

async function actualizar(req, res, next) {
    try {
        const productoActualizado = await productoService.actualizarProducto(req.params.id, req.body);
        res.status(200).json({
            mensaje: "Producto actualizado correctamente",
            producto: productoActualizado
        });
    } catch (error) { next(error); }
}

async function eliminar(req, res, next) {
    try {
        await productoService.eliminarProducto(req.params.id);
        res.status(200).json({ mensaje: "Producto eliminado correctamente" });
    } catch (error) { next(error); }
}

module.exports = { crear, listar, obtenerPorId, actualizar, eliminar };