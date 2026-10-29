const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

function obtenerConfiguracion(tipo) {
    if (tipo === "categoria") return { modelo: prisma.categoria, etiqueta: "categoría" };
    return { modelo: prisma.tipoProducto, etiqueta: "tipo de producto" };
}

async function listar(tipo) {
    return obtenerConfiguracion(tipo).modelo.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
}

async function crear(tipo, nombre) {
    const { modelo, etiqueta } = obtenerConfiguracion(tipo);
    try { return await modelo.create({ data: { nombre } }); }
    catch (error) { if (error.code === "P2002") throw new ErrorPersonalizado(`Ya existe ${etiqueta} con ese nombre`, 409); throw error; }
}

async function actualizar(tipo, id, nombre) {
    const { modelo, etiqueta } = obtenerConfiguracion(tipo);
    if (!await modelo.findUnique({ where: { id } })) throw new ErrorPersonalizado(`${etiqueta} no encontrada`, 404);
    try { return await modelo.update({ where: { id }, data: { nombre } }); }
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
