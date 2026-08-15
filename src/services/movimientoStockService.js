const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

const MOTIVOS_PERMITIDOS_MANUAL = ["AJUSTE_MANUAL", "DEVOLUCION"];

async function registrarMovimiento(datos) {
    const { productoId, tipo, motivo, cantidad, referenciaId } = datos;

    if (!MOTIVOS_PERMITIDOS_MANUAL.includes(motivo)) {
        throw new ErrorPersonalizado("Motivo no permitido para carga manual de stock", 400);
    }
    if (cantidad <= 0) {
        throw new ErrorPersonalizado("La cantidad debe ser mayor a cero", 400);
    }

    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);

    const stockDisponible = producto.stock - producto.stockReservado;
    if (tipo === "SALIDA" && stockDisponible < cantidad) {
        throw new ErrorPersonalizado(
            "Stock insuficiente para realizar la salida (disponible: " + stockDisponible + ")",
            400
        );
    }

    const nuevoStock = tipo === "ENTRADA"
        ? producto.stock + cantidad
        : producto.stock - cantidad;

    const resultado = await prisma.$transaction(async (tx) => {
        const movimiento = await tx.movimientoStock.create({
            data: { productoId, tipo, motivo, cantidad, referenciaId }
        });
        await tx.producto.update({
            where: { id: productoId },
            data: { stock: nuevoStock }
        });
        return movimiento;
    });

    return resultado;
}

async function listarMovimientos(pagina, limite) {
    return listarHistorialMovimientos({ page: pagina, limit: limite });
}

async function listarStock(pagina, limite) {
    const saltar = (pagina - 1) * limite;

    const [productos, total] = await prisma.$transaction([
        prisma.producto.findMany({
            where: { activo: true },
            select: {
                id: true,
                nombre: true,
                categoria: true,
                stock: true,
                stockReservado: true
            },
            orderBy: { nombre: "asc" },
            skip: saltar,
            take: limite
        }),
        prisma.producto.count({ where: { activo: true } })
    ]);

    return {
        data: productos.map((producto) => ({
            ...producto,
            stockDisponible: producto.stock - producto.stockReservado
        })),
        total,
        page: pagina,
        limit: limite
    };
}

async function listarHistorialMovimientos(filtros) {
    const { page, limit, productoId, tipo, motivo, desde, hasta } = filtros;
    const saltar = (page - 1) * limit;
    const where = {
        ...(productoId && { productoId }),
        ...(tipo && { tipo }),
        ...(motivo && { motivo }),
        ...((desde || hasta) && {
            creadoEn: {
                ...(desde && { gte: desde }),
                ...(hasta && { lte: hasta })
            }
        })
    };

    const [movimientos, total] = await prisma.$transaction([
        prisma.movimientoStock.findMany({
            where,
            include: { producto: true },
            orderBy: { creadoEn: "desc" },
            skip: saltar,
            take: limit
        }),
        prisma.movimientoStock.count({ where })
    ]);

    return {
        data: movimientos,
        total,
        page,
        limit
    };
}

async function ajustarStock(productoId, datos) {
    return registrarMovimiento({
        productoId,
        tipo: datos.tipo,
        motivo: "AJUSTE_MANUAL",
        cantidad: datos.cantidad,
        referenciaId: datos.referenciaId
    });
}

async function listarMovimientosPorProducto(productoId) {
    const movimientos = await prisma.movimientoStock.findMany({
        where: { productoId: productoId },
        orderBy: { creadoEn: "desc" }
    });
    return movimientos;
}

module.exports = {
    registrarMovimiento,
    listarMovimientos,
    listarStock,
    listarHistorialMovimientos,
    listarMovimientosPorProducto,
    ajustarStock
};
