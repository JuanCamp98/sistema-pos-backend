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
    if (promocion.tipoDescuento === "DOS_POR_UNO") {
        return { precioOriginal, precioFinal: precioOriginal };
    }
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
    if (["DOS_POR_UNO", "COMBO"].includes(promocion.tipoDescuento)) return;
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
                    precio: true,
                    stock: true,
                    stockReservado: true,
                    activo: true,
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
        valorDescuento: ["DOS_POR_UNO", "COMBO"].includes(datos.tipoDescuento) ? null : datos.valorDescuento,
        precioCombo: datos.tipoDescuento === "COMBO" ? datos.precioCombo : null,
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

async function validarDatosCombo(datos, db = prisma) {
    if (datos.tipoDescuento !== "COMBO") return;
    const productoIds = datos.productoIds || [];
    if (productoIds.length < 2 || datos.categorias?.length) {
        throw new ErrorPersonalizado("Un combo debe incluir al menos dos productos específicos y no puede usar categorías", 400);
    }
    if (datos.precioCombo == null) {
        throw new ErrorPersonalizado("El precio total del combo es obligatorio", 400);
    }

    const productos = await db.producto.findMany({
        where: { id: { in: productoIds }, activo: true },
        select: { id: true, precio: true }
    });
    if (productos.length !== productoIds.length) {
        throw new ErrorPersonalizado("Uno o mas productos del combo no existen o estan inactivos", 400);
    }
    const precioRegularCombo = productos.reduce((total, producto) => total + aCentavos(producto.precio), 0);
    if (aCentavos(datos.precioCombo) >= precioRegularCombo) {
        throw new ErrorPersonalizado("El precio del combo debe ser menor que el precio regular conjunto de sus productos", 400);
    }
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
        select: {
            titulo: true,
            tipoDescuento: true,
            valorDescuento: true,
            precioCombo: true,
            productos: { select: { productoId: true } }
        }
    });

    for (const promocion of promociones) {
        if (promocion.tipoDescuento === "COMBO") {
            const idsCombo = promocion.productos.map((item) => item.productoId);
            const productosCombo = await db.producto.findMany({
                where: { id: { in: idsCombo }, activo: true },
                select: { id: true, precio: true }
            });
            const precioRegularCombo = productosCombo.reduce((total, item) => {
                return total + aCentavos(item.id === producto.id ? producto.precio : item.precio);
            }, 0);
            if (productosCombo.length !== idsCombo.length || aCentavos(promocion.precioCombo) >= precioRegularCombo) {
                throw new ErrorPersonalizado(
                    "El nuevo precio del producto no puede dejar el combo \"" + promocion.titulo +
                    "\" sin un descuento real.",
                    400
                );
            }
            continue;
        }
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
    await validarDatosCombo(datos);
    await validarPromocionContraMinimo(datos);
    const promocion = await prisma.promocion.create({ data: { ...datosBase(datos), ...(await relaciones(datos)) }, include: incluirRelaciones });
    return presentarPromocion(promocion);
}

async function actualizarPromocion(id, datos) {
    const actual = await obtenerPromocion(id);
    const fechaInicio = datos.fechaInicio || actual.fechaInicio;
    const fechaFin = datos.fechaFin || actual.fechaFin;
    if (fechaFin <= fechaInicio) throw new ErrorPersonalizado("La fecha de fin debe ser posterior a la fecha de inicio", 400);
    const tipoDescuento = datos.tipoDescuento ?? actual.tipoDescuento;
    const valorDescuento = datos.valorDescuento !== undefined
        ? datos.valorDescuento
        : actual.valorDescuento;
    const precioCombo = datos.precioCombo !== undefined
        ? datos.precioCombo
        : actual.precioCombo;
    if (tipoDescuento === "DOS_POR_UNO" && valorDescuento != null) {
        throw new ErrorPersonalizado("La promoción 2x1 no lleva un valor de descuento", 400);
    }
    if (tipoDescuento === "COMBO" && valorDescuento != null) {
        throw new ErrorPersonalizado("El combo no lleva un descuento adicional", 400);
    }
    if (tipoDescuento !== "COMBO" && precioCombo != null) {
        throw new ErrorPersonalizado("El precio de combo solo corresponde al tipo COMBO", 400);
    }
    if (!["DOS_POR_UNO", "COMBO"].includes(tipoDescuento) && valorDescuento == null) {
        throw new ErrorPersonalizado("El valor del descuento es obligatorio", 400);
    }
    if (tipoDescuento === "PORCENTAJE" && Number(valorDescuento) > 100) throw new ErrorPersonalizado("El porcentaje no puede superar 100", 400);
    const tieneRelaciones = datos.productoIds !== undefined || datos.categorias !== undefined;
    if (datos.productoIds !== undefined) await validarProductos(datos.productoIds);
    const datosFinales = {
        ...actual,
        ...datos,
        tipoDescuento,
        valorDescuento,
        precioCombo,
        fechaInicio,
        fechaFin,
        productoIds: datos.productoIds ?? actual.productos.map((item) => item.producto.id),
        categorias: datos.categorias ?? actual.categorias.map((item) => item.categoria)
    };
    await validarDatosCombo(datosFinales);
    await validarPromocionContraMinimo(datosFinales);
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
            precioCombo: true,
            fechaInicio: true,
            fechaFin: true,
            ...incluirRelaciones
        }
    });
    return promociones.map(presentarPromocion);
}

function calcularPrecioPromocionalConPromociones(precioProducto, cantidadProducto, promociones) {
    const precioOriginalCentavos = aCentavos(precioProducto);
    const cantidad = Number.isSafeInteger(cantidadProducto) && cantidadProducto > 0
        ? cantidadProducto
        : 1;
    const promocionesDisponibles = [];
    let mejor = null;
    let promocionNoAplicable = null;
    for (const promocion of promociones) {
        if (promocion.tipoDescuento === "COMBO") {
            promocionesDisponibles.push({
                id: promocion.id,
                titulo: promocion.titulo,
                tipoDescuento: promocion.tipoDescuento,
                precioCombo: Number(promocion.precioCombo),
                productoIds: (promocion.productos || []).map((item) => item.productoId),
                productos: (promocion.productos || []).map((item) => ({
                    id: item.productoId,
                    nombre: item.producto.nombre
                }))
            });
            continue;
        }
        if (promocion.tipoDescuento === "DOS_POR_UNO") {
            promocionesDisponibles.push({
                id: promocion.id,
                titulo: promocion.titulo,
                tipoDescuento: promocion.tipoDescuento,
                valorDescuento: null
            });
            const unidadesBonificadas = Math.floor(cantidad / 2);
            const descuentoTotal = unidadesBonificadas * precioOriginalCentavos;
            if (descuentoTotal > 0 && (!mejor || descuentoTotal > mejor.descuentoTotal)) {
                mejor = { ...promocion, descuentoTotal, unidadesBonificadas, precioPorUnidad: precioOriginalCentavos };
            }
            continue;
        }

        const precio = calcularPrecioPromocionalEnCentavos(precioProducto, promocion);
        const minimoPromocional = obtenerPrecioMinimoPromocionalCentavos();
        if (precio.precioFinal < minimoPromocional) {
            if (!promocionNoAplicable || precio.precioFinal < promocionNoAplicable.precioFinal) {
                promocionNoAplicable = { ...promocion, precioFinal: precio.precioFinal };
            }
            continue;
        }

        promocionesDisponibles.push({
            id: promocion.id,
            titulo: promocion.titulo,
            tipoDescuento: promocion.tipoDescuento,
            valorDescuento: Number(promocion.valorDescuento)
        });
        const descuentoTotal = (precioOriginalCentavos - precio.precioFinal) * cantidad;
        if (descuentoTotal > 0 && (!mejor || descuentoTotal > mejor.descuentoTotal)) {
            mejor = {
                ...promocion,
                descuentoTotal,
                unidadesBonificadas: 0,
                precioPorUnidad: precio.precioFinal
            };
        }
    }

    const minimo = obtenerPrecioMinimoPromocionalCentavos();
    if (!mejor && promocionNoAplicable && promocionesDisponibles.length === 0) {
        return {
            precioOriginal: precioOriginalCentavos / 100,
            precioFinal: precioOriginalCentavos / 100,
            descuentoAplicado: 0,
            promocion: null,
            promocionesDisponibles,
            subtotal: (precioOriginalCentavos * cantidad) / 100,
            descuentoTotal: 0,
            unidadesBonificadas: 0,
            promocionNoAplicable: {
                titulo: promocionNoAplicable.titulo,
                precioIntentado: promocionNoAplicable.precioFinal / 100,
                precioMinimo: minimo / 100,
                mensaje: "La acción no se puede realizar: la promoción \"" + promocionNoAplicable.titulo +
                    "\" dejaría el producto por debajo del mínimo de " + formatearPesos(minimo) + "."
            }
        };
    }

    const precioFinal = mejor?.tipoDescuento === "DOS_POR_UNO"
        ? precioOriginalCentavos
        : mejor?.precioPorUnidad ?? precioOriginalCentavos;
    return {
        precioOriginal: precioOriginalCentavos / 100,
        precioFinal: precioFinal / 100,
        descuentoAplicado: (precioOriginalCentavos - precioFinal) / 100,
        subtotal: (precioOriginalCentavos * cantidad - (mejor?.descuentoTotal || 0)) / 100,
        descuentoTotal: (mejor?.descuentoTotal || 0) / 100,
        unidadesBonificadas: mejor?.unidadesBonificadas || 0,
        promocionesDisponibles,
        promocion: mejor ? {
            id: mejor.id,
            titulo: mejor.titulo,
            tipoDescuento: mejor.tipoDescuento,
            valorDescuento: mejor.valorDescuento == null ? null : Number(mejor.valorDescuento)
        } : null,
        promocionNoAplicable: null
    };
}

function calcularPromocionesCombo(items) {
    const itemsPorId = new Map(items.map((item) => [item.producto.id, item]));
    const cantidadesDisponibles = new Map(items.map((item) => [item.producto.id, item.cantidad]));
    const asignaciones = new Map(items.map((item) => [item.producto.id, {
        cantidadCombo: 0,
        subtotalComboCentavos: 0,
        descuentoComboCentavos: 0,
        titulos: []
    }]));
    const promocionesCombo = new Map();
    items.forEach((item) => {
        item.precio.promocionesDisponibles
            .filter((promocion) => promocion.tipoDescuento === "COMBO")
            .forEach((promocion) => promocionesCombo.set(promocion.id, promocion));
    });

    while (true) {
        let mejor = null;
        for (const promocion of promocionesCombo.values()) {
            const productoIds = [...new Set(promocion.productoIds || [])];
            if (productoIds.length < 2 || productoIds.some((id) => !itemsPorId.has(id))) continue;
            const cantidadCombos = Math.min(...productoIds.map((id) => cantidadesDisponibles.get(id) || 0));
            if (cantidadCombos <= 0) continue;

            const componentes = productoIds.map((id) => itemsPorId.get(id));
            const precioRegularUnitario = componentes.reduce(
                (total, item) => total + aCentavos(item.producto.precio),
                0
            );
            const precioComboCentavos = aCentavos(promocion.precioCombo);
            if (precioComboCentavos >= precioRegularUnitario) continue;

            const ahorroCombo = (precioRegularUnitario - precioComboCentavos) * cantidadCombos;
            const ahorroIndividual = componentes.reduce((total, item) => {
                const promosIndividuales = item.precio.promocionesDisponibles
                    .filter((itemPromocion) => itemPromocion.tipoDescuento !== "COMBO");
                return total + Math.round(calcularPrecioPromocionalConPromociones(
                    item.producto.precio,
                    cantidadCombos,
                    promosIndividuales
                ).descuentoTotal * 100);
            }, 0);
            const ahorroAdicional = ahorroCombo - ahorroIndividual;
            if (ahorroAdicional > 0 && (!mejor || ahorroAdicional > mejor.ahorroAdicional)) {
                mejor = {
                    promocion,
                    productoIds,
                    componentes,
                    cantidadCombos,
                    precioRegularUnitario,
                    precioComboCentavos,
                    ahorroAdicional
                };
            }
        }
        if (!mejor) break;

        let precioAsignado = 0;
        mejor.componentes.forEach((item, indice) => {
            const productoId = item.producto.id;
            const precioRegularComponente = aCentavos(item.producto.precio) * mejor.cantidadCombos;
            const subtotalComponente = indice === mejor.componentes.length - 1
                ? mejor.precioComboCentavos * mejor.cantidadCombos - precioAsignado
                : Math.floor(
                    mejor.precioComboCentavos *
                    mejor.cantidadCombos *
                    precioRegularComponente /
                    (mejor.precioRegularUnitario * mejor.cantidadCombos)
                );
            precioAsignado += subtotalComponente;

            const asignacion = asignaciones.get(productoId);
            asignacion.cantidadCombo += mejor.cantidadCombos;
            asignacion.subtotalComboCentavos += subtotalComponente;
            asignacion.descuentoComboCentavos += precioRegularComponente - subtotalComponente;
            if (!asignacion.titulos.includes(mejor.promocion.titulo)) {
                asignacion.titulos.push(mejor.promocion.titulo);
            }
            cantidadesDisponibles.set(productoId, cantidadesDisponibles.get(productoId) - mejor.cantidadCombos);
        });
    }

    return new Map(items.map((item) => {
        const productoId = item.producto.id;
        const asignacion = asignaciones.get(productoId);
        const cantidadRestante = cantidadesDisponibles.get(productoId);
        const promocionesIndividuales = item.precio.promocionesDisponibles
            .filter((promocion) => promocion.tipoDescuento !== "COMBO");
        const precioRestante = cantidadRestante
            ? calcularPrecioPromocionalConPromociones(
                item.producto.precio,
                cantidadRestante,
                promocionesIndividuales
            )
            : { subtotal: 0, descuentoTotal: 0, unidadesBonificadas: 0, promocion: null };
        const subtotalComboCentavos = asignacion.subtotalComboCentavos;
        const subtotalCentavos = subtotalComboCentavos + Math.round(precioRestante.subtotal * 100);
        const descuentoTotalCentavos = asignacion.descuentoComboCentavos +
            Math.round(precioRestante.descuentoTotal * 100);
        const titulos = [
            ...asignacion.titulos.map((titulo) => "Combo: " + titulo),
            ...(precioRestante.promocion ? [precioRestante.promocion.titulo] : [])
        ];

        return [productoId, {
            subtotalCentavos,
            descuentoTotalCentavos,
            unidadesBonificadas: precioRestante.unidadesBonificadas || 0,
            promocionTitulo: [...new Set(titulos)].join(" + ") || null,
            combosAplicados: asignacion.cantidadCombo
        }];
    }));
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
        select: {
            id: true,
            titulo: true,
            tipoDescuento: true,
            valorDescuento: true,
            precioCombo: true,
            productos: { select: { productoId: true, producto: { select: { nombre: true } } } }
        }
    });

    return calcularPrecioPromocionalConPromociones(
        producto.precio,
        producto.cantidad,
        promociones
    );
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
    calcularPrecioPromocionalConPromociones,
    calcularPromocionesCombo,
    calcularPrecioPromocionalEnCentavos,
    validarPromocionContraMinimo,
    validarProductoContraPromociones,
    obtenerConfiguracionPromociones
};
