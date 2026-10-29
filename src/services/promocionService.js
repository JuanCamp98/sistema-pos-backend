const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

const incluirRelaciones = {
    productos: { select: { producto: { select: { id: true, nombre: true, categoria: true } } } },
    categorias: { select: { categoria: true } }
};

function datosBase(datos) {
    return {
        titulo: datos.titulo,
        descripcion: datos.descripcion ?? null,
        tipoDescuento: datos.tipoDescuento,
        valorDescuento: datos.valorDescuento,
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        activo: datos.activo
    };
}

async function validarProductos(productoIds) {
    if (!productoIds?.length) return;
    const cantidad = await prisma.producto.count({ where: { id: { in: productoIds }, activo: true } });
    if (cantidad !== productoIds.length) throw new ErrorPersonalizado("Uno o mas productos no existen o estan inactivos", 400);
}

async function relaciones(datos) {
    await validarProductos(datos.productoIds || []);
    return {
        productos: { create: (datos.productoIds || []).map((productoId) => ({ producto: { connect: { id: productoId } } })) },
        categorias: { create: (datos.categorias || []).map((categoria) => ({ categoria })) }
    };
}

async function listarPromociones() {
    return prisma.promocion.findMany({ orderBy: { fechaInicio: "desc" }, include: incluirRelaciones });
}

async function obtenerPromocion(id) {
    const promocion = await prisma.promocion.findUnique({ where: { id }, include: incluirRelaciones });
    if (!promocion) throw new ErrorPersonalizado("Promocion no encontrada", 404);
    return promocion;
}

async function crearPromocion(datos) {
    return prisma.promocion.create({ data: { ...datosBase(datos), ...(await relaciones(datos)) }, include: incluirRelaciones });
}

async function actualizarPromocion(id, datos) {
    const actual = await obtenerPromocion(id);
    const fechaInicio = datos.fechaInicio || actual.fechaInicio;
    const fechaFin = datos.fechaFin || actual.fechaFin;
    if (fechaFin <= fechaInicio) throw new ErrorPersonalizado("La fecha de fin debe ser posterior a la fecha de inicio", 400);
    if (datos.tipoDescuento === "PORCENTAJE" && Number(datos.valorDescuento) > 100) throw new ErrorPersonalizado("El porcentaje no puede superar 100", 400);
    const tieneRelaciones = datos.productoIds !== undefined || datos.categorias !== undefined;
    if (datos.productoIds !== undefined) await validarProductos(datos.productoIds);
    return prisma.$transaction(async function (tx) {
        if (tieneRelaciones) {
            await tx.promocionProducto.deleteMany({ where: { promocionId: id } });
            await tx.promocionCategoria.deleteMany({ where: { promocionId: id } });
        }
        return tx.promocion.update({
            where: { id },
            data: {
                ...datosBase({ ...actual, ...datos, fechaInicio, fechaFin }),
                ...(datos.productoIds !== undefined ? { productos: { create: datos.productoIds.map((productoId) => ({ producto: { connect: { id: productoId } } })) } } : {}),
                ...(datos.categorias !== undefined ? { categorias: { create: datos.categorias.map((categoria) => ({ categoria })) } } : {})
            },
            include: incluirRelaciones
        });
    });
}

async function eliminarPromocion(id) {
    await obtenerPromocion(id);
    await prisma.promocion.delete({ where: { id } });
}

async function listarPromocionesVigentes() {
    const ahora = new Date();
    return prisma.promocion.findMany({
        where: {
            activo: true,
            fechaInicio: { lte: ahora },
            fechaFin: { gte: ahora }
        },
        orderBy: [{ fechaFin: "asc" }, { fechaInicio: "desc" }],
        select: {
            id: true,
            titulo: true,
            descripcion: true,
            tipoDescuento: true,
            valorDescuento: true,
            fechaInicio: true,
            fechaFin: true,
            ...incluirRelaciones
        }
    });
}

module.exports = { listarPromociones, obtenerPromocion, crearPromocion, actualizarPromocion, eliminarPromocion, listarPromocionesVigentes };
