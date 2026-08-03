const prisma = require("../config/prisma");

async function crearProducto(datos) {
    const { nombre, descripcion, precio, stock, categoria } = datos;
    const nuevoProducto = await prisma.producto.create({
        data: { nombre, descripcion, precio, stock, categoria }
    });
    return nuevoProducto;
}

async function listarProductos(pagina, limite) {
    const paginaActual = pagina || 1;
    const limiteActual = limite || 10;
    const saltar = (paginaActual - 1) * limiteActual;

    const [productos, total] = await prisma.$transaction([
        prisma.producto.findMany({
            where: { activo: true },
            orderBy: { nombre: "asc" },
            skip: saltar,
            take: limiteActual
        }),
        prisma.producto.count({ where: { activo: true } })
    ]);

    return {
        productos: productos,
        paginacion: {
            paginaActual: paginaActual,
            totalPaginas: Math.ceil(total / limiteActual),
            totalRegistros: total
        }
    };
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