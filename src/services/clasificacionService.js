const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");
const { normalizarNombre, filtroNombre } = require("../utils/nombres");

function obtenerConfiguracion(tipo) {
    if (tipo === "categoria") return { modelo: prisma.categoria, etiqueta: "categoría" };
    return { modelo: prisma.tipoProducto, etiqueta: "tipo de producto" };
}

async function listar(tipo) {
    // El catalogo publico solo necesita identificar y mostrar las opciones.
    // Se omiten campos internos como activo o fechas de auditoria.
    return obtenerConfiguracion(tipo).modelo.findMany({
        where: { activo: true },
        orderBy: { nombre: "asc" },
        select: { id: true, nombre: true }
    });
}

async function crear(tipo, nombre) {
    const { modelo, etiqueta } = obtenerConfiguracion(tipo);
    const nombreNormalizado = normalizarNombre(nombre);
    const existente = await modelo.findFirst({
        where: filtroNombre(nombreNormalizado),
        select: { id: true }
    });
    if (existente) {
        throw new ErrorPersonalizado(`Ya existe ${etiqueta} con ese nombre`, 409);
    }
    try { return await modelo.create({ data: { nombre: nombreNormalizado } }); }
    catch (error) { if (error.code === "P2002") throw new ErrorPersonalizado(`Ya existe ${etiqueta} con ese nombre`, 409); throw error; }
}

async function actualizar(tipo, id, nombre) {
    const { modelo, etiqueta } = obtenerConfiguracion(tipo);
    if (!await modelo.findUnique({ where: { id } })) throw new ErrorPersonalizado(`${etiqueta} no encontrada`, 404);
    const nombreNormalizado = normalizarNombre(nombre);
    const existente = await modelo.findFirst({
        where: filtroNombre(nombreNormalizado, id),
        select: { id: true }
    });
    if (existente) {
        throw new ErrorPersonalizado(`Ya existe ${etiqueta} con ese nombre`, 409);
    }
    try { return await modelo.update({ where: { id }, data: { nombre: nombreNormalizado } }); }
    catch (error) { if (error.code === "P2002") throw new ErrorPersonalizado(`Ya existe ${etiqueta} con ese nombre`, 409); throw error; }
}

async function desactivar(tipo, id) {
    const { modelo, etiqueta } = obtenerConfiguracion(tipo);
    const actual = await modelo.findUnique({ where: { id }, include: { productos: { where: { activo: true }, select: { id: true }, take: 1 } } });
    if (!actual) throw new ErrorPersonalizado(`${etiqueta} no encontrada`, 404);
    if (actual.productos.length) throw new ErrorPersonalizado(`No se puede desactivar: ${etiqueta} tiene productos asociados`, 409);
    return modelo.update({ where: { id }, data: { activo: false } });
}

module.exports = { listar, crear, actualizar, desactivar };
