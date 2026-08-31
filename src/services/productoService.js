const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");
const { calcularPaginacion } = require("../utils/paginacion");

async function crearProducto(datos) {
    const { nombre, descripcion, precio, stock, categoria } = datos;
    const productoExistente = await prisma.producto.findFirst({
        where: { nombre, activo: true }
    });
    if (productoExistente) {
        throw new ErrorPersonalizado("Ya existe un producto activo con ese nombre", 409);
    }
    const nuevoProducto = await prisma.producto.create({
        data: { nombre, descripcion, precio, stock, categoria }
    });
    return nuevoProducto;
}

async function listarProductos(pagina, limite) {
    const { skip, take, page, limit } = calcularPaginacion(pagina, limite);

    const [productos, total] = await prisma.$transaction([
        prisma.producto.findMany({
            where: { activo: true },
            orderBy: { nombre: "asc" },
            skip: skip,
            take: take
        }),
        prisma.producto.count({ where: { activo: true } })
    ]);

    return {
        data: productos,
        total: total,
        page: page,
        limit: limit
    };
}

async function obtenerProductoPorId(id) {
    const producto = await prisma.producto.findUnique({ where: { id: id } });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    return producto;
}

async function actualizarProducto(id, datos) {
    const productoExistente = await prisma.producto.findUnique({ where: { id: id } });
    if (!productoExistente || !productoExistente.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    if (datos.nombre && datos.nombre !== productoExistente.nombre) {
        const productoConMismoNombre = await prisma.producto.findFirst({
            where: { nombre: datos.nombre, activo: true, NOT: { id } }
        });
        if (productoConMismoNombre) {
            throw new ErrorPersonalizado("Ya existe un producto activo con ese nombre", 409);
        }
    }
    const productoActualizado = await prisma.producto.update({
        where: { id: id },
        data: datos
    });
    return productoActualizado;
}

async function eliminarProducto(id) {
    const productoExistente = await prisma.producto.findUnique({ where: { id: id } });
    if (!productoExistente || !productoExistente.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    const productoEliminado = await prisma.producto.update({
        where: { id: id },
        data: { activo: false }
    });
    return productoEliminado;
}

module.exports = {
    crearProducto,
    listarProductos,
    obtenerProductoPorId,
    actualizarProducto,
    eliminarProducto
};
