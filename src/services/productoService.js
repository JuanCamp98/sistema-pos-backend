const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");
const { calcularPaginacion } = require("../utils/paginacion");
const { normalizarNombre, filtroNombre } = require("../utils/nombres");
const { calcularPrecioPromocional, validarProductoContraPromociones } = require("./promocionService");

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

// DTO del catalogo publico: solo expone la informacion necesaria para mostrar y
// comprar el producto. No incluye stock fisico, stock reservado, estado interno,
// ids de clasificacion ni marcas de tiempo.
function presentarProductoPublico(producto) {
    return {
        id: producto.id,
        nombre: producto.nombre,
        descripcion: producto.descripcion ?? null,
        imagen: producto.imagen ?? null,
        precio: producto.precio,
        precioOriginal: producto.precioOriginal,
        precioFinal: producto.precioFinal,
        descuentoAplicado: producto.descuentoAplicado,
        promocionesDisponibles: producto.promocionesDisponibles || [],
        promocion: producto.promocion || null,
        promocionNoAplicable: producto.promocionNoAplicable || null,
        categoria: producto.categoria,
        tipoProducto: producto.tipoProducto?.nombre ?? null,
        disponible: Math.max(
            0,
            Number(producto.stock) - Number(producto.stockReservado || 0)
        )
    };
}

async function validarClasificacion(categoriaId, tipoProductoId) {
    const [categoria, tipoProducto] = await Promise.all([prisma.categoria.findUnique({ where: { id: categoriaId } }), prisma.tipoProducto.findUnique({ where: { id: tipoProductoId } })]);
    if (!categoria || !categoria.activo) throw new ErrorPersonalizado("La categoría no existe o está inactiva", 400);
    if (!tipoProducto || !tipoProducto.activo) throw new ErrorPersonalizado("El tipo de producto no existe o está inactivo", 400);
}

async function crearProducto(datos) {
    const { descripcion, imagen, precio, stock, categoriaId, tipoProductoId } = datos;
    const nombre = normalizarNombre(datos.nombre);
    if (await prisma.producto.findFirst({ where: { ...filtroNombre(nombre), activo: true }, select: { id: true } })) throw new ErrorPersonalizado("Ya existe un producto activo con ese nombre", 409);
    await validarClasificacion(categoriaId, tipoProductoId);
    const categoria = await prisma.categoria.findUnique({ where: { id: categoriaId }, select: { nombre: true } });
    await validarProductoContraPromociones({ nombre, precio, categoria: categoria.nombre });
    return presentarConPrecio(prisma, await prisma.producto.create({ data: { nombre, descripcion, imagen, precio, stock, categoriaId, tipoProductoId }, include: clasificacion }));
}

async function listarProductos(pagina, limite, filtros = {}, opciones = {}) {
    const { skip, take, page, limit } = calcularPaginacion(pagina, limite);
    const where = { activo: true };
    if (filtros.nombre) where.nombre = { contains: filtros.nombre, mode: "insensitive" };
    if (filtros.categoriaId) where.categoriaId = filtros.categoriaId;
    if (filtros.categoria) where.categoriaRelacion = { nombre: { equals: filtros.categoria, mode: "insensitive" } };
    if (filtros.tipoProductoId) where.tipoProductoId = filtros.tipoProductoId;
    const [productos, total, categorias] = await prisma.$transaction([prisma.producto.findMany({ where, include: clasificacion, orderBy: { nombre: "asc" }, skip, take }), prisma.producto.count({ where }), prisma.categoria.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { nombre: true } })]);
    const presentados = await Promise.all(productos.map((producto) => presentarConPrecio(prisma, producto)));
    return {
        data: opciones.publico ? presentados.map(presentarProductoPublico) : presentados,
        total,
        page,
        limit,
        categorias: categorias.map((item) => item.nombre)
    };
}

async function obtenerProductoPorId(id, opciones = {}) {
    const producto = await prisma.producto.findUnique({ where: { id }, include: clasificacion });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    const presentado = await presentarConPrecio(prisma, producto);
    return opciones.publico ? presentarProductoPublico(presentado) : presentado;
}

async function actualizarProducto(id, datos) {
    const producto = await prisma.producto.findUnique({ where: { id } });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    const cambios = { ...datos };
    if (datos.nombre !== undefined) {
        const nombre = normalizarNombre(datos.nombre);
        if (await prisma.producto.findFirst({ where: { ...filtroNombre(nombre, id), activo: true }, select: { id: true } })) throw new ErrorPersonalizado("Ya existe un producto activo con ese nombre", 409);
        cambios.nombre = nombre;
    }
    if (datos.categoriaId || datos.tipoProductoId) await validarClasificacion(datos.categoriaId || producto.categoriaId, datos.tipoProductoId || producto.tipoProductoId);
    const categoria = await prisma.categoria.findUnique({
        where: { id: datos.categoriaId || producto.categoriaId },
        select: { nombre: true }
    });
    await validarProductoContraPromociones({
        id: producto.id,
        nombre: cambios.nombre || producto.nombre,
        precio: datos.precio ?? producto.precio,
        categoria: categoria.nombre
    });
    return presentarConPrecio(prisma, await prisma.producto.update({ where: { id }, data: cambios, include: clasificacion }));
}

async function eliminarProducto(id) {
    const producto = await prisma.producto.findUnique({ where: { id } });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);
    return prisma.producto.update({ where: { id }, data: { activo: false }, include: clasificacion });
}

module.exports = { crearProducto, listarProductos, obtenerProductoPorId, actualizarProducto, eliminarProducto, presentarProductoPublico };
