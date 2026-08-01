const prisma = require("../config/prisma");

async function crearProducto(datos) {
    const { nombre, descripcion, precio, stock, categoria } = datos;
    const nuevoProducto = await prisma.producto.create({
        data: { nombre, descripcion, precio, stock, categoria }
    });
    return nuevoProducto;
}

async function listarProductos() {
    const productos = await prisma.producto.findMany({
        where: { activo: true },
        orderBy: { nombre: "asc" }
    });
    return productos;
}

async function obtenerProductoPorId(id) {
    const producto = await prisma.producto.findUnique({ where: { id: id } });
    if (!producto || !producto.activo) throw new Error("Producto no encontrado");
    return producto;
}

async function actualizarProducto(id, datos) {
    const productoExistente = await prisma.producto.findUnique({ where: { id: id } });
    if (!productoExistente || !productoExistente.activo) throw new Error("Producto no encontrado");
    const { nombre, descripcion, precio, stock, categoria } = datos;
    const productoActualizado = await prisma.producto.update({
        where: { id: id },
        data: { nombre, descripcion, precio, stock, categoria }
    });
    return productoActualizado;
}

async function eliminarProducto(id) {
    const productoExistente = await prisma.producto.findUnique({ where: { id: id } });
    if (!productoExistente || !productoExistente.activo) throw new Error("Producto no encontrado");
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