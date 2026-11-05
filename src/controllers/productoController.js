const productoService = require("../services/productoService");
const imagenProductoService = require("../services/imagenProductoService");
const { paginacionProductoSchema } = require("../schemas/productoSchema");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

async function crear(req, res, next) {
    let imagenGuardada;
    try {
        if (req.imagenProducto) {
            imagenGuardada = await imagenProductoService.guardarImagenProducto(req.imagenProducto);
        }
        const datos = imagenGuardada
            ? { ...req.body, imagen: imagenGuardada.ruta }
            : req.body;
        const nuevoProducto = await productoService.crearProducto(datos);
        res.status(201).json({
            mensaje: "Producto creado correctamente",
            producto: nuevoProducto
        });
    } catch (error) {
        if (imagenGuardada) {
            try {
                await imagenProductoService.eliminarImagenProducto(imagenGuardada.ruta);
            } catch (errorLimpieza) {
                console.error("No se pudo limpiar la imagen de un producto que no se creó", errorLimpieza);
            }
        }
        next(error);
    }
}

async function listar(req, res, next) {
    try {
        const resultadoPaginacion = paginacionProductoSchema.safeParse(req.query);
        if (!resultadoPaginacion.success) {
            throw new ErrorPersonalizado("Los parametros de paginacion o filtros no son validos", 400);
        }
        const { page, limit, nombre, categoria, categoriaId, tipoProductoId } = resultadoPaginacion.data;
        const resultado = await productoService.listarProductos(page, limit, { nombre, categoria, categoriaId, tipoProductoId });
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
    let imagenGuardada;
    let productoAnterior;
    try {
        let datos = req.body;
        if (req.imagenProducto) {
            productoAnterior = await productoService.obtenerProductoPorId(req.params.id);
            imagenGuardada = await imagenProductoService.guardarImagenProducto(req.imagenProducto);
            datos = { ...datos, imagen: imagenGuardada.ruta };
        }
        const productoActualizado = await productoService.actualizarProducto(req.params.id, datos);
        if (imagenGuardada && productoAnterior?.imagen) {
            try {
                await imagenProductoService.eliminarImagenProducto(productoAnterior.imagen);
            } catch (errorLimpieza) {
                if (errorLimpieza.code !== "ENOENT") {
                    console.error("No se pudo eliminar la imagen anterior del producto", errorLimpieza);
                }
            }
        }
        res.status(200).json({
            mensaje: "Producto actualizado correctamente",
            producto: productoActualizado
        });
    } catch (error) {
        if (imagenGuardada) {
            try {
                await imagenProductoService.eliminarImagenProducto(imagenGuardada.ruta);
            } catch (errorLimpieza) {
                console.error("No se pudo limpiar una imagen de producto que no se actualizó", errorLimpieza);
            }
        }
        next(error);
    }
}

async function eliminar(req, res, next) {
    try {
        await productoService.eliminarProducto(req.params.id);
        res.status(204).send();
    } catch (error) { next(error); }
}

module.exports = { crear, listar, obtenerPorId, actualizar, eliminar };
