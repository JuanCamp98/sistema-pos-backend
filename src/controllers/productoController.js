const productoService = require("../services/productoService");
const { paginacionProductoSchema } = require("../schemas/productoSchema");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

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
        const resultadoPaginacion = paginacionProductoSchema.safeParse(req.query);
        if (!resultadoPaginacion.success) {
            throw new ErrorPersonalizado("Los parametros page y limit deben ser enteros positivos", 400);
        }
        const { page, limit } = resultadoPaginacion.data;
        const resultado = await productoService.listarProductos(page, limit);
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
        res.status(204).send();
    } catch (error) { next(error); }
}

module.exports = { crear, listar, obtenerPorId, actualizar, eliminar };
