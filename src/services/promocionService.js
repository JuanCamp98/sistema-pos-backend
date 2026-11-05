const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

function aCentavos(valor) {
    const coincidencia = String(valor).match(/^(\d+)(?:\.(\d+))?$/);
    if (!coincidencia || (coincidencia[2] && coincidencia[2].length > 2)) {
        throw new ErrorPersonalizado("El importe debe ser un número válido con hasta dos decimales", 400);
    }

    const fraccion = (coincidencia[2] || "").padEnd(3, "0");
    const centavos = Number(coincidencia[1]) * 100 +
        Number(fraccion.slice(0, 2)) +
        (Number(fraccion[2]) >= 5 ? 1 : 0);
    if (!Number.isSafeInteger(centavos)) {
        throw new ErrorPersonalizado("El importe excede el máximo permitido", 400);
    }
    return centavos;
}

function obtenerPrecioMinimoPromocionalCentavos() {
    const configurado = process.env.PRECIO_MINIMO_PROMOCIONAL ?? "100.00";
    let minimo;
    try {
        minimo = aCentavos(configurado);
    } catch {
        throw new ErrorPersonalizado("PRECIO_MINIMO_PROMOCIONAL debe ser un importe válido con hasta dos decimales", 500);
    }
    if (minimo <= 0) {
        throw new ErrorPersonalizado("PRECIO_MINIMO_PROMOCIONAL debe ser mayor a cero", 500);
    }
    return minimo;
}

function formatearPesos(centavos) {
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS"
    }).format(centavos / 100);
}

function calcularPrecioPromocionalEnCentavos(precio, promocion) {
    const precioOriginal = aCentavos(precio);
    const valor = aCentavos(promocion.valorDescuento);
    if (promocion.tipoDescuento === "PORCENTAJE" && valor > 10000) {
        throw new ErrorPersonalizado("El porcentaje no puede superar 100", 400);
    }

    const precioFinal = promocion.tipoDescuento === "PORCENTAJE"
        ? Math.round(precioOriginal * (10000 - valor) / 10000)
        : Math.max(0, precioOriginal - valor);
    return { precioOriginal, precioFinal };
}

function asegurarPrecioMinimoPromocion(producto, promocion) {
    const { precioOriginal, precioFinal } = calcularPrecioPromocionalEnCentavos(producto.precio, promocion);
    const minimo = obtenerPrecioMinimoPromocionalCentavos();
    if (precioFinal >= minimo) return;

    throw new ErrorPersonalizado(
        "La acción no se puede realizar: la promoción dejaría \"" + producto.nombre +
        "\" en " + formatearPesos(precioFinal) +
        ", por debajo del mínimo promocional de " + formatearPesos(minimo) + ".",
        400
    );
}

const incluirRelaciones = {
    productos: {
        select: {
            producto: {
                select: {
                    id: true,
                    nombre: true,
                    imagen: true,
                    categoriaRelacion: { select: { nombre: true } }
                }
            }
        }
    },
    categorias: { select: { categoria: true } }
};

function presentarPromocion(promocion) {
    return {
        ...promocion,
        productos: promocion.productos?.map(function (item) {
            const { categoriaRelacion, ...producto } = item.producto;
            return {
                ...item,
                producto: { ...producto, categoria: categoriaRelacion.nombre }
            };
        })
    };
}

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

async function validarPromocionContraMinimo(datos, db = prisma) {
    if (datos.activo === false) return;
    const condiciones = [];
    if (datos.productoIds?.length) condiciones.push({ id: { in: datos.productoIds } });
    if (datos.categorias?.length) {
        condiciones.push({ categoriaRelacion: { nombre: { in: datos.categorias } } });
    }
    if (condiciones.length === 0) return;

    const productos = await db.producto.findMany({
        where: { activo: true, OR: condiciones },
        select: { id: true, nombre: true, precio: true }
    });
    for (const producto of productos) {
        asegurarPrecioMinimoPromocion(producto, datos);
    }
}

async function validarProductoContraPromociones(producto, db = prisma) {
    const ahora = new Date();
    const alcance = [];
    if (producto.id) alcance.push({ productos: { some: { productoId: producto.id } } });
    if (producto.categoria) alcance.push({ categorias: { some: { categoria: producto.categoria } } });
    if (alcance.length === 0) return;

    const promociones = await db.promocion.findMany({
        where: {
            activo: true,
            fechaFin: { gte: ahora },
            OR: alcance
        },
        select: { titulo: true, tipoDescuento: true, valorDescuento: true }
    });

    for (const promocion of promociones) {
        asegurarPrecioMinimoPromocion(
            { nombre: producto.nombre, precio: producto.precio },
            promocion
        );
    }
}

async function relaciones(datos) {
    await validarProductos(datos.productoIds || []);
    return {
        productos: { create: (datos.productoIds || []).map((productoId) => ({ producto: { connect: { id: productoId } } })) },
        categorias: { create: (datos.categorias || []).map((categoria) => ({ categoria })) }
    };
}

async function listarPromociones() {
    const promociones = await prisma.promocion.findMany({ orderBy: { fechaInicio: "desc" }, include: incluirRelaciones });
    return promociones.map(presentarPromocion);
}

async function obtenerPromocion(id) {
    const promocion = await prisma.promocion.findUnique({ where: { id }, include: incluirRelaciones });
    if (!promocion) throw new ErrorPersonalizado("Promocion no encontrada", 404);
    return presentarPromocion(promocion);
}

async function crearPromocion(datos) {
    await validarPromocionContraMinimo(datos);
    const promocion = await prisma.promocion.create({ data: { ...datosBase(datos), ...(await relaciones(datos)) }, include: incluirRelaciones });
    return presentarPromocion(promocion);
}

async function actualizarPromocion(id, datos) {
    const actual = await obtenerPromocion(id);
    const fechaInicio = datos.fechaInicio || actual.fechaInicio;
    const fechaFin = datos.fechaFin || actual.fechaFin;
    if (fechaFin <= fechaInicio) throw new ErrorPersonalizado("La fecha de fin debe ser posterior a la fecha de inicio", 400);
    if (datos.tipoDescuento === "PORCENTAJE" && Number(datos.valorDescuento) > 100) throw new ErrorPersonalizado("El porcentaje no puede superar 100", 400);
    const tieneRelaciones = datos.productoIds !== undefined || datos.categorias !== undefined;
    if (datos.productoIds !== undefined) await validarProductos(datos.productoIds);
    await validarPromocionContraMinimo({
        ...actual,
        ...datos,
        fechaInicio,
        fechaFin,
        productoIds: datos.productoIds ?? actual.productos.map((item) => item.producto.id),
        categorias: datos.categorias ?? actual.categorias.map((item) => item.categoria)
    });
    return prisma.$transaction(async function (tx) {
        if (tieneRelaciones) {
            await tx.promocionProducto.deleteMany({ where: { promocionId: id } });
            await tx.promocionCategoria.deleteMany({ where: { promocionId: id } });
        }
        const promocion = await tx.promocion.update({
            where: { id },
            data: {
                ...datosBase({ ...actual, ...datos, fechaInicio, fechaFin }),
                ...(datos.productoIds !== undefined ? { productos: { create: datos.productoIds.map((productoId) => ({ producto: { connect: { id: productoId } } })) } } : {}),
                ...(datos.categorias !== undefined ? { categorias: { create: datos.categorias.map((categoria) => ({ categoria })) } } : {})
            },
            include: incluirRelaciones
        });
        return presentarPromocion(promocion);
    });
}

async function eliminarPromocion(id) {
    await obtenerPromocion(id);
    await prisma.promocion.delete({ where: { id } });
}

async function listarPromocionesVigentes() {
    const ahora = new Date();
    const promociones = await prisma.promocion.findMany({
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
    return promociones.map(presentarPromocion);
}

async function calcularPrecioPromocional(db, producto) {
    const promociones = await db.promocion.findMany({
        where: {
            activo: true,
            fechaInicio: { lte: new Date() },
            fechaFin: { gte: new Date() },
            OR: [
                { productos: { some: { productoId: producto.id } } },
                { categorias: { some: { categoria: producto.categoria } } }
            ]
        },
        select: { id: true, titulo: true, tipoDescuento: true, valorDescuento: true }
    });

    const precioOriginalCentavos = aCentavos(producto.precio);
    let mejor = null;
    for (const promocion of promociones) {
        const precio = calcularPrecioPromocionalEnCentavos(producto.precio, promocion);
        if (!mejor || precio.precioFinal < mejor.precioFinal) {
            mejor = { ...promocion, precioFinal: precio.precioFinal };
        }
    }

    const minimo = obtenerPrecioMinimoPromocionalCentavos();
    if (mejor && mejor.precioFinal < minimo) {
        return {
            precioOriginal: precioOriginalCentavos / 100,
            precioFinal: precioOriginalCentavos / 100,
            descuentoAplicado: 0,
            promocion: null,
            promocionNoAplicable: {
                titulo: mejor.titulo,
                precioIntentado: mejor.precioFinal / 100,
                precioMinimo: minimo / 100,
                mensaje: "La acción no se puede realizar: la promoción \"" + mejor.titulo +
                    "\" dejaría el producto por debajo del mínimo de " + formatearPesos(minimo) + "."
            }
        };
    }

    return {
        precioOriginal: precioOriginalCentavos / 100,
        precioFinal: (mejor ? mejor.precioFinal : precioOriginalCentavos) / 100,
        descuentoAplicado: mejor ? (precioOriginalCentavos - mejor.precioFinal) / 100 : 0,
        promocion: mejor ? {
            id: mejor.id,
            titulo: mejor.titulo,
            tipoDescuento: mejor.tipoDescuento,
            valorDescuento: Number(mejor.valorDescuento)
        } : null,
        promocionNoAplicable: null
    };
}

function obtenerConfiguracionPromociones() {
    return { precioMinimoPromocional: obtenerPrecioMinimoPromocionalCentavos() / 100 };
}

module.exports = {
    listarPromociones,
    obtenerPromocion,
    crearPromocion,
    actualizarPromocion,
    eliminarPromocion,
    listarPromocionesVigentes,
    calcularPrecioPromocional,
    calcularPrecioPromocionalEnCentavos,
    validarPromocionContraMinimo,
    validarProductoContraPromociones,
    obtenerConfiguracionPromociones
};
