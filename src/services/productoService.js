const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");
const { calcularPaginacion } = require("../utils/paginacion");
const { calcularPrecioPromocional } = require("./promocionService");

const clasificacion = {
    categoriaRelacion: { select: { id: true, nombre: true, activo: true } },
    tipoProducto: { select: { id: true, nombre: true, activo: true } }
};

function presentar(producto) {
    return { ...producto, categoriaId: producto.categoriaRelacion.id, categoria: producto.categoriaRelacion.nombre, tipoProductoId: producto.tipoProducto.id, tipoProducto: producto.tipoProducto, categoriaRelacion: undefined };
}

async function presentarConPrecio(db, producto) {
    return { ...presentar(producto), ...(await calcularPrecioPromocional(db, { ...producto, categoria: producto.categoriaRelacion.nombre })) };
}

async function validarClasificacion(categoriaId, tipoProductoId) {
    const [categoria, tipoProducto] = await Promise.all([prisma.categoria.findUnique({ where: { id: categoriaId } }), prisma.tipoProducto.findUnique({ where: { id: tipoProductoId } })]);
    if (!categoria || !categoria.activo) throw new ErrorPersonalizado("La categoría no existe o está inactiva", 400);
    if (!tipoProducto || !tipoProducto.activo) throw new ErrorPersonalizado("El tipo de producto no existe o está inactivo", 400);
}

async function crearProducto(datos) {
    const { nombre, descripcion, imagen, precio, stock, categoriaId, tipoProductoId } = datos;
    if (await prisma.producto.findFirst({ where: { nombre, activo: true } })) throw new ErrorPersonalizado("Ya existe un producto activo con ese nombre", 409);
    await validarClasificacion(categoriaId, tipoProductoId);
    return presentarConPrecio(prisma, await prisma.producto.create({ data: { nombre, descripcion, imagen, precio, stock, categoriaId, tipoProductoId }, include: clasificacion }));
}

async function listarProductos(pagina, limite, filtros = {}) {
    const { skip, take, page, limit } = calcularPaginacion(pagina, limite);
    const where = { activo: true };
    if (filtros.nombre) where.nombre = { contains: filtros.nombre, mode: "insensitive" };
    if (filtros.categoriaId) where.categoriaId = filtros.categoriaId;
    if (filtros.categoria) where.categoriaRelacion = { nombre: filtros.categoria };
    if (filtros.tipoProductoId) where.tipoProductoId = filtros.tipoProductoId;
    const [productos, total, categorias] = await prisma.$transaction([prisma.producto.findMany({ where, include: clasificacion, orderBy: { nombre: "asc" }, skip, take }), prisma.producto.count({ where }), prisma.categoria.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { nombre: true } })]);
    return { data: await Promise.all(productos.map((producto) => presentarConPrecio(prisma, producto))), total, page, limit, categorias: categorias.map((item) => item.nombre) };
}

async function obtenerProductoPorId(id) {
    const producto = await prisma.producto.findUnique({ where: { id }, include: clasificacion });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    return presentarConPrecio(prisma, producto);
}

async function actualizarProducto(id, datos) {
    const producto = await prisma.producto.findUnique({ where: { id } });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    if (datos.nombre && datos.nombre !== producto.nombre && await prisma.producto.findFirst({ where: { nombre: datos.nombre, activo: true, NOT: { id } } })) throw new ErrorPersonalizado("Ya existe un producto activo con ese nombre", 409);
    if (datos.categoriaId || datos.tipoProductoId) await validarClasificacion(datos.categoriaId || producto.categoriaId, datos.tipoProductoId || producto.tipoProductoId);
    return presentarConPrecio(prisma, await prisma.producto.update({ where: { id }, data: datos, include: clasificacion }));
}

async function eliminarProducto(id) {
    const producto = await prisma.producto.findUnique({ where: { id } });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    return prisma.producto.update({ where: { id }, data: { activo: false }, include: clasificacion });
}

module.exports = { crearProducto, listarProductos, obtenerProductoPorId, actualizarProducto, eliminarProducto };
